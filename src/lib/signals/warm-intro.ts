/**
 * Warm Introduction Finder
 *
 * Identifies potential warm paths to a lead:
 * 1. Shared connections (if LinkedIn data available)
 * 2. Same industry as past clients who converted
 * 3. Same location as past clients
 * 4. Mutual communities (same associations, groups, events)
 *
 * Also generates intro request drafts.
 */

import { aiComplete } from "@/lib/ai/provider";

export interface WarmPath {
  type: "mutual_client" | "same_industry" | "same_location" | "mutual_connection";
  strength: "strong" | "medium" | "weak";
  description: string;
  connectionName: string | null;
  introRequestDraft: string | null;
}

export interface WarmIntroResult {
  paths: WarmPath[];
  bestApproach: string;
  coldVsWarmRecommendation: "warm_intro" | "warm_reference" | "cold_with_context" | "cold";
}

/**
 * Find warm introduction paths to a lead.
 */
export async function findWarmPaths(params: {
  leadName: string;
  leadCompany: string | null;
  leadIndustry: string | null;
  leadLocation: string | null;
  // Past successful leads (won/meeting stage)
  pastClients: {
    name: string;
    company: string | null;
    industry: string | null;
    location: string | null;
  }[];
  agencyName?: string;
}): Promise<WarmIntroResult> {
  const paths: WarmPath[] = [];

  // Check for same-industry past clients
  if (params.leadIndustry) {
    const sameIndustry = params.pastClients.filter((c) =>
      c.industry?.toLowerCase() === params.leadIndustry?.toLowerCase()
    );
    for (const client of sameIndustry) {
      paths.push({
        type: "same_industry",
        strength: "medium",
        description: `${client.name}${client.company ? ` at ${client.company}` : ""} is in the same industry (${params.leadIndustry})`,
        connectionName: client.name,
        introRequestDraft: null,
      });
    }
  }

  // Check for same-location past clients
  if (params.leadLocation) {
    const sameLocation = params.pastClients.filter((c) => {
      if (!c.location || !params.leadLocation) return false;
      // Fuzzy match on city/state
      const leadLoc = params.leadLocation.toLowerCase();
      const clientLoc = c.location.toLowerCase();
      return leadLoc.includes(clientLoc) || clientLoc.includes(leadLoc);
    });
    for (const client of sameLocation) {
      paths.push({
        type: "same_location",
        strength: "weak",
        description: `${client.name}${client.company ? ` at ${client.company}` : ""} is in the same area (${params.leadLocation})`,
        connectionName: client.name,
        introRequestDraft: null,
      });
    }
  }

  // Check for mutual client (same company)
  if (params.leadCompany) {
    const sameCompany = params.pastClients.filter((c) =>
      c.company?.toLowerCase() === params.leadCompany?.toLowerCase()
    );
    for (const client of sameCompany) {
      paths.push({
        type: "mutual_client",
        strength: "strong",
        description: `You already work with ${client.name} at ${params.leadCompany}!`,
        connectionName: client.name,
        introRequestDraft: null,
      });
    }
  }

  if (paths.length === 0) {
    return {
      paths: [],
      bestApproach: "No warm paths found. Use cold outreach with strong personalization.",
      coldVsWarmRecommendation: "cold",
    };
  }

  // Generate intro request drafts for the strongest paths
  const strongPaths = paths.filter((p) => p.strength === "strong" || p.strength === "medium");
  if (strongPaths.length > 0 && strongPaths[0].connectionName) {
    const text = await aiComplete({
      prompt: `Write two short messages:

1. An intro request to send to ${strongPaths[0].connectionName} asking them to introduce you to ${params.leadName}${params.leadCompany ? ` at ${params.leadCompany}` : ""}. Keep it casual and brief (3-4 sentences). You are from ${params.agencyName ?? "an AI automation agency"}.

2. A "warm reference" cold email to ${params.leadName} that name-drops ${strongPaths[0].connectionName} naturally. Not "they told me to reach out" (unless it's a mutual client), but "I work with others in [industry/area] like ${strongPaths[0].connectionName}."

Format:
INTRO REQUEST:
[message]

WARM REFERENCE:
[message]`,
      maxTokens: 512,
    });
    const introMatch = text.match(/INTRO REQUEST:\s*([\s\S]*?)(?=WARM REFERENCE:|$)/);
    const warmMatch = text.match(/WARM REFERENCE:\s*([\s\S]*?)$/);

    if (introMatch) {
      strongPaths[0].introRequestDraft = introMatch[1].trim();
    }

    // Determine recommendation
    const hasStrongPath = paths.some((p) => p.strength === "strong");
    const hasMediumPath = paths.some((p) => p.strength === "medium");

    return {
      paths,
      bestApproach: hasStrongPath
        ? `Ask ${strongPaths[0].connectionName} for a direct intro — you have a strong connection.`
        : `Reference ${strongPaths[0].connectionName} in your outreach as social proof.`,
      coldVsWarmRecommendation: hasStrongPath
        ? "warm_intro"
        : hasMediumPath
        ? "warm_reference"
        : "cold_with_context",
    };
  }

  return {
    paths,
    bestApproach: "Use cold outreach but reference shared context (same industry/location).",
    coldVsWarmRecommendation: "cold_with_context",
  };
}
