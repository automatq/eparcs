import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";
import { parseSearchQuery } from "@/lib/search/query-parser";
import { runParallelSearch } from "@/lib/search/parallel-runner";
import { canStartAgent } from "@/lib/search/agent-queue";

/**
 * Lookalike Lead Discovery
 *
 * Analyzes your best-performing leads (replied, meeting, won)
 * and identifies patterns to find more like them.
 *
 * Returns:
 * - Profile of your ideal lead
 * - Suggested Google Maps searches
 * - Suggested LinkedIn search queries
 * - Suggested Indeed search queries
 */
export async function GET(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  // Get all leads with positive outcomes
  const successfulLeads = await db.lead.findMany({
    where: {
      ownerId: userId,
      pipelineStage: { in: ["replied", "meeting", "won"] },
    },
    include: {
      businessProfile: true,
      automationSignals: true,
    },
  });

  // Also get all leads for comparison
  const allLeads = await db.lead.findMany({
    where: { ownerId: userId },
    include: { businessProfile: true },
  });

  if (successfulLeads.length < 2) {
    return NextResponse.json({
      message: "Need at least 2 successful leads (replied/meeting/won) to generate lookalike profiles. Keep doing outreach!",
      idealProfile: null,
      searches: null,
    });
  }

  // Build context about successful leads
  const successContext = successfulLeads.map((lead) => {
    const parts = [`${lead.name} (${lead.source})`];
    if (lead.title) parts.push(`Title: ${lead.title}`);
    if (lead.company) parts.push(`Company: ${lead.company}`);
    if (lead.industry) parts.push(`Industry: ${lead.industry}`);
    if (lead.businessProfile?.category) parts.push(`Category: ${lead.businessProfile.category}`);
    if (lead.businessProfile?.rating) parts.push(`Rating: ${lead.businessProfile.rating}/5 (${lead.businessProfile.reviewCount} reviews)`);
    if (lead.location) parts.push(`Location: ${lead.location}`);
    if (lead.automationSignals.length > 0) {
      parts.push(`Signal: ${lead.automationSignals[0].jobTitle} (${lead.automationSignals[0].signalStrength})`);
    }
    parts.push(`Outcome: ${lead.pipelineStage}`);
    return parts.join("\n  ");
  }).join("\n\n");

  // Count stats
  const stats = {
    totalLeads: allLeads.length,
    successful: successfulLeads.length,
    topSources: countBy(successfulLeads.map((l) => l.source)),
    topIndustries: countBy(successfulLeads.map((l) => l.industry).filter(Boolean) as string[]),
    topCategories: countBy(successfulLeads.map((l) => l.businessProfile?.category).filter(Boolean) as string[]),
    avgRating: avg(successfulLeads.map((l) => l.businessProfile?.rating).filter(Boolean) as number[]),
    avgReviewCount: avg(successfulLeads.map((l) => l.businessProfile?.reviewCount).filter(Boolean) as number[]),
    topLocations: countBy(successfulLeads.map((l) => l.location).filter(Boolean) as string[]),
  };

  const text = await aiComplete({
    system: "You are a sales intelligence analyst for an AI automation agency.",
    prompt: `Analyze these successful leads (leads that replied, booked meetings, or closed) and generate a lookalike discovery plan.

Respond in JSON:
{
  "idealProfile": {
    "summary": "<2 sentence description of the ideal lead>",
    "industries": ["<industry 1>", "<industry 2>"],
    "categories": ["<business category 1>", "<business category 2>"],
    "companySize": "<ideal company size range>",
    "ratingRange": "<ideal Google Maps rating range>",
    "reviewRange": "<ideal review count range>",
    "locations": ["<location 1>", "<location 2>"],
    "titles": ["<decision maker title 1>", "<title 2>"],
    "commonTraits": ["<trait 1>", "<trait 2>"]
  },
  "googleMapsSearches": [
    {"query": "<search term>", "location": "<city/area>", "reason": "<why>"},
    {"query": "<search term>", "location": "<city/area>", "reason": "<why>"}
  ],
  "linkedinSearches": [
    {"query": "<search URL parameters or keywords>", "reason": "<why>"},
    {"query": "<search URL parameters or keywords>", "reason": "<why>"}
  ],
  "indeedSearches": [
    {"query": "<job title to search>", "reason": "<why this signals automation need>"},
    {"query": "<job title to search>", "reason": "<why>"}
  ],
  "avoidProfiles": ["<type of lead to avoid based on your failures>"]
}

Stats:
- ${stats.successful}/${stats.totalLeads} leads converted
- Top sources: ${JSON.stringify(stats.topSources)}
- Top industries: ${JSON.stringify(stats.topIndustries)}
- Top categories: ${JSON.stringify(stats.topCategories)}
- Avg rating: ${stats.avgRating?.toFixed(1) ?? "N/A"}
- Avg reviews: ${stats.avgReviewCount?.toFixed(0) ?? "N/A"}
- Top locations: ${JSON.stringify(stats.topLocations)}

Successful leads:
${successContext}`,
    maxTokens: 1500,
  });

  const result = parseAIJson<any>(text);
  if (!result) {
    return NextResponse.json({ raw: text });
  }

  // Auto-execute: Build a natural language query from the ideal profile and run it
  const autoExecute = new URL(request.url).searchParams.get("autoExecute") === "true";

  if (autoExecute && result.idealProfile) {
    const allowed = await canStartAgent(userId);
    if (!allowed) {
      return NextResponse.json({ ...result, autoSearch: null, message: "Too many searches running" });
    }

    // Build search query from the lookalike profile
    const searchQuery = `Find ${result.idealProfile.categories?.[0] ?? result.idealProfile.industries?.[0] ?? "businesses"} in ${result.idealProfile.locations?.[0] ?? "any location"} ${result.idealProfile.ratingRange ? `with ${result.idealProfile.ratingRange} rating` : ""}`;

    const parsed = await parseSearchQuery(searchQuery);

    // Create workspace
    const workspace = await db.workspace.create({
      data: {
        name: `Lookalikes: ${result.idealProfile.summary?.slice(0, 60) ?? "Similar leads"}`,
        description: `Auto-generated from lookalike analysis`,
        ownerId: userId,
      },
    });

    // Create search agent
    const searchAgent = await db.searchAgent.create({
      data: {
        ownerId: userId,
        query: searchQuery,
        status: "running",
        sources: JSON.stringify(parsed.sources),
        sourceProgress: JSON.stringify(
          Object.fromEntries(parsed.sources.map((s) => [s, { status: "pending", found: 0 }]))
        ),
        workspaceId: workspace.id,
      },
    });

    // Fire and forget
    runParallelSearch({
      searchAgentId: searchAgent.id,
      workspaceId: workspace.id,
      query: searchQuery,
      parsed,
      ownerId: userId,
    }).catch(() => {});

    return NextResponse.json({
      ...result,
      autoSearch: {
        searchAgentId: searchAgent.id,
        workspaceId: workspace.id,
        query: searchQuery,
      },
    });
  }

  return NextResponse.json(result);
}

function countBy(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5)
  );
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
