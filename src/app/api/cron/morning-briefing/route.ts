import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateDailyQueue, type QueueInput } from "@/lib/icp/daily-queue";
import { estimateRevenue, type ICPConfig } from "@/lib/icp/engine";
import { syncReportToMarkedUp } from "@/lib/integrations/markedup-sync";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

/**
 * Cron: Smart Morning Briefing → MarkedUp
 *
 * Runs at 8am daily. Pushes a personalized briefing doc to each team's
 * MarkedUp workspace:
 * - Top priority leads to contact today (with reasons)
 * - Leads going cold (need attention)
 * - Yesterday's wins
 * - Hot leads that engaged overnight
 * - Per-member action items
 *
 * Vercel Cron config: 0 8 * * * (8am daily)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db.markedUpConnection.findMany();
  const results = [];

  for (const conn of connections) {
    try {
      const result = await generateMorningBriefing(conn.orgId, conn.workspaceId);
      results.push({ orgId: conn.orgId, ...result });
    } catch (err: any) {
      results.push({ orgId: conn.orgId, error: err.message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function generateMorningBriefing(orgId: string, workspaceId: string) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const members = await db.teamMember.findMany({ where: { orgId } });
  const memberIds = members.map((m) => m.userId);
  const ownerFilter = memberIds.length > 0 ? { ownerId: { in: memberIds } } : {};

  // Fetch all leads with full data
  const leads = await db.lead.findMany({
    where: ownerFilter,
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: { orderBy: { createdAt: "desc" } },
    },
  });

  const agentConfig = await db.outreachAgent.findFirst({
    where: ownerFilter,
    orderBy: { createdAt: "desc" },
  });

  const icpConfig: ICPConfig = {
    targetCategories: agentConfig?.targetIndustries?.split(/[,;]+/).map((t) => t.trim()).filter(Boolean) ?? [],
    excludeCategories: [],
    minReviews: 5, maxReviews: 500,
    idealReviewRange: [10, 200],
    minRating: 2.0, maxRating: 4.8,
    idealRatingRange: [3.0, 4.2],
    targetLocations: [], excludeLocations: [],
    requireWebsite: false, requirePhone: false, requireEmail: false,
    minEstimatedRevenue: 0, maxEstimatedRevenue: Infinity,
    competitorKeywords: [],
  };

  // Build queue inputs
  const queueInputs: QueueInput[] = leads.map((lead) => {
    const lastSent = lead.outreachMessages.find((m) => m.status === "sent");
    const lastOpened = lead.outreachMessages.find((m) => m.openedAt);
    const lastReplied = lead.outreachMessages.find((m) => m.repliedAt);

    return {
      leadId: lead.id,
      name: lead.name,
      company: lead.company,
      source: lead.source,
      pipelineStage: lead.pipelineStage,
      category: lead.businessProfile?.category ?? null,
      industry: lead.industry,
      rating: lead.businessProfile?.rating ?? null,
      reviewCount: lead.businessProfile?.reviewCount ?? null,
      location: lead.location,
      hasWebsite: !!lead.businessProfile?.website,
      hasPhone: lead.phones.length > 0,
      hasEmail: lead.emails.length > 0,
      createdAt: lead.createdAt,
      lastContactedAt: lastSent?.sentAt ?? null,
      lastOpenedAt: lastOpened?.openedAt ?? null,
      lastRepliedAt: lastReplied?.repliedAt ?? null,
      leadScoreInput: {
        name: lead.name, title: lead.title, company: lead.company, industry: lead.industry,
        source: lead.source, leadType: lead.leadType,
        businessProfile: lead.businessProfile ? {
          category: lead.businessProfile.category, rating: lead.businessProfile.rating,
          reviewCount: lead.businessProfile.reviewCount, website: lead.businessProfile.website,
          phone: lead.businessProfile.phone,
        } : null,
        automationSignals: lead.automationSignals.map((s) => ({
          signalType: s.signalType, signalStrength: s.signalStrength,
          jobTitle: s.jobTitle, jobDescription: s.jobDescription,
        })),
        emails: lead.emails.map((e) => ({ verified: e.verified })),
        outreachMessages: lead.outreachMessages.map((m) => ({
          status: m.status, openedAt: m.openedAt, clickedAt: m.clickedAt, repliedAt: m.repliedAt,
        })),
        targetIndustries: agentConfig?.targetIndustries ?? null,
      },
    };
  });

  // Generate the queue
  const queue = generateDailyQueue(queueInputs, icpConfig, 10);

  // Find yesterday's wins
  const yesterdayReplies = leads.filter((l) =>
    l.outreachMessages.some((m) => m.repliedAt && m.repliedAt >= yesterday)
  );
  const yesterdayMeetings = leads.filter((l) =>
    l.pipelineStage === "meeting" && l.updatedAt >= yesterday
  );

  // Find leads going cold (contacted 5+ days ago, no reply)
  const goingCold = leads.filter((l) => {
    if (l.pipelineStage !== "contacted") return false;
    const lastMsg = l.outreachMessages.find((m) => m.status === "sent");
    if (!lastMsg?.sentAt) return false;
    const daysSince = (Date.now() - lastMsg.sentAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 5 && daysSince < 14;
  });

  // Hot engagement overnight
  const overnightEngagement = leads.filter((l) =>
    l.outreachMessages.some((m) =>
      (m.openedAt && m.openedAt >= yesterday) ||
      (m.clickedAt && m.clickedAt >= yesterday)
    )
  );

  // AI-generated per-member coaching
  const memberActions = await generateMemberActions(members, leads, agentConfig);

  // Build the briefing document
  const doc = buildBriefingDoc({
    date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    queue,
    yesterdayReplies: yesterdayReplies.map((l) => ({ name: l.name, company: l.company })),
    yesterdayMeetings: yesterdayMeetings.map((l) => ({ name: l.name, company: l.company })),
    goingCold: goingCold.map((l) => {
      const lastMsg = l.outreachMessages.find((m) => m.status === "sent");
      const daysSince = lastMsg?.sentAt ? Math.floor((Date.now() - lastMsg.sentAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return { name: l.name, company: l.company, daysSince };
    }),
    overnightEngagement: overnightEngagement.map((l) => ({ name: l.name, company: l.company })),
    memberActions,
    totalActive: leads.filter((l) => l.pipelineStage !== "won" && l.pipelineStage !== "lost").length,
  });

  // Push to MarkedUp
  try {
    await syncReportToMarkedUp({
      workspaceId,
      clerkToken: "",
      title: `Morning Briefing — ${now.toLocaleDateString()}`,
      content: doc,
    });
  } catch { /* best effort */ }

  return { success: true, queueSize: queue.length, goingCold: goingCold.length };
}

async function generateMemberActions(
  members: { name: string; userId: string; role: string }[],
  leads: any[],
  agentConfig: any
): Promise<{ name: string; actions: string[] }[]> {
  if (members.length === 0) return [];

  const memberSummaries = members.map((m) => {
    const memberLeads = leads.filter((l) => l.ownerId === m.userId);
    const newLeads = memberLeads.filter((l) => l.pipelineStage === "new").length;
    const contacted = memberLeads.filter((l) => l.pipelineStage === "contacted").length;
    const replied = memberLeads.filter((l) => l.pipelineStage === "replied").length;
    return `${m.name} (${m.role}): ${newLeads} new, ${contacted} contacted, ${replied} replied`;
  }).join("\n");

  try {
    const text = await aiComplete({
      system: "You're a sales team coach giving brief daily action items.",
      prompt: `Give 2-3 specific action items for each team member based on their pipeline. JSON format: [{"name": "...", "actions": ["...", "..."]}]

Team:
${memberSummaries}`,
      maxTokens: 500,
    });
    return parseAIJson<{ name: string; actions: string[] }[]>(text) ?? [];
  } catch {
    return [];
  }
}

function buildBriefingDoc(data: any): object {
  const content: any[] = [
    heading(1, `Good morning — ${data.date}`),
    paragraph(`${data.totalActive} active leads in your pipeline.`),
  ];

  // Top priority leads
  if (data.queue.length > 0) {
    content.push(heading(2, "Your Top Leads to Contact Today"));
    for (let i = 0; i < Math.min(data.queue.length, 10); i++) {
      const lead = data.queue[i];
      const rev = lead.estimatedRevenue > 0
        ? ` | Est. revenue: $${(lead.estimatedRevenue / 1000).toFixed(0)}K/yr`
        : "";
      content.push(
        heading(3, `${i + 1}. ${lead.name}${lead.company ? ` — ${lead.company}` : ""}`),
        bulletList([
          `Score: ${lead.queueScore}/100 | ICP: ${lead.icpScore.matchLevel}${rev}`,
          `Why: ${lead.reason}`,
          `Action: ${lead.suggestedAction} (${lead.suggestedChannel})`,
          `${lead.icpScore.recommendation}`,
        ])
      );
    }
  }

  // Yesterday's wins
  if (data.yesterdayReplies.length > 0 || data.yesterdayMeetings.length > 0) {
    content.push(heading(2, "Yesterday's Wins"));
    const wins: string[] = [];
    for (const r of data.yesterdayReplies) {
      wins.push(`Reply from ${r.name}${r.company ? ` (${r.company})` : ""}`);
    }
    for (const m of data.yesterdayMeetings) {
      wins.push(`Meeting booked with ${m.name}${m.company ? ` (${m.company})` : ""}`);
    }
    content.push(bulletList(wins));
  }

  // Hot overnight engagement
  if (data.overnightEngagement.length > 0) {
    content.push(
      heading(2, "Engaged Overnight"),
      bulletList(data.overnightEngagement.map((l: any) =>
        `${l.name}${l.company ? ` (${l.company})` : ""} — opened/clicked your outreach`
      ))
    );
  }

  // Going cold
  if (data.goingCold.length > 0) {
    content.push(
      heading(2, "Going Cold — Need Attention"),
      bulletList(data.goingCold.map((l: any) =>
        `${l.name}${l.company ? ` (${l.company})` : ""} — ${l.daysSince} days since last contact`
      ))
    );
  }

  // Per-member actions
  if (data.memberActions.length > 0) {
    content.push(heading(2, "Team Action Items"));
    for (const member of data.memberActions) {
      content.push(
        heading(3, member.name),
        bulletList(member.actions)
      );
    }
  }

  return { type: "doc", content };
}

function heading(level: number, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function bulletList(items: string[]) {
  return {
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  };
}
