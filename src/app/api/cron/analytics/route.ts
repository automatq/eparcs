import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  syncReportToMarkedUp,
  syncMetricsToMarkedUp,
} from "@/lib/integrations/markedup-sync";
import { computeLeadScore } from "@/lib/scoring/lead-scorer";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

/**
 * Cron: Auto-generate team analytics docs and push to MarkedUp team workspace.
 *
 * Each org gets ONE report pushed to their shared MarkedUp workspace.
 * The report includes per-member breakdowns so the team can see
 * who's doing what.
 *
 * Configure via Vercel Cron: runs at 8am daily
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
      const result = await generateTeamAnalytics(conn.orgId, conn.workspaceId);
      results.push({ orgId: conn.orgId, ...result });
    } catch (err: any) {
      results.push({ orgId: conn.orgId, error: err.message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function generateTeamAnalytics(orgId: string, workspaceId: string) {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  // Get all team members for this org
  const members = await db.teamMember.findMany({ where: { orgId } });
  const memberIds = members.map((m) => m.userId);

  // If no members registered, use all owners who have leads in this org's scope
  const ownerFilter = memberIds.length > 0
    ? { ownerId: { in: memberIds } }
    : {};

  // ── Org-wide stats ──
  const [totalLeads, newLeadsThisWeek, allMessages, pipelineCounts] = await Promise.all([
    db.lead.count({ where: ownerFilter }),
    db.lead.count({ where: { ...ownerFilter, createdAt: { gte: weekAgo } } }),
    db.outreachMessage.findMany({
      where: { ...ownerFilter, createdAt: { gte: weekAgo } },
    }),
    db.lead.groupBy({
      by: ["pipelineStage"],
      where: ownerFilter,
      _count: true,
    }),
  ]);

  const sent = allMessages.filter((m) => m.status === "sent");
  const opened = allMessages.filter((m) => m.openedAt);
  const replied = allMessages.filter((m) => m.repliedAt);
  const openRate = sent.length > 0 ? opened.length / sent.length : 0;
  const replyRate = sent.length > 0 ? replied.length / sent.length : 0;

  const pipeline: Record<string, number> = {};
  pipelineCounts.forEach((p) => { pipeline[p.pipelineStage] = p._count; });

  // ── Per-member breakdowns ──
  const memberStats = await Promise.all(
    members.map(async (member) => {
      const msgs = allMessages.filter((m) => m.ownerId === member.userId);
      const memberSent = msgs.filter((m) => m.status === "sent");
      const memberEmails = memberSent.filter((m) => m.channel === "email");
      const memberCalls = memberSent.filter((m) => m.channel === "phone");
      const memberOpened = msgs.filter((m) => m.openedAt);
      const memberReplied = msgs.filter((m) => m.repliedAt);
      const memberLeads = await db.lead.count({
        where: { ownerId: member.userId, createdAt: { gte: weekAgo } },
      });
      const memberMeetings = await db.lead.count({
        where: { ownerId: member.userId, pipelineStage: "meeting" },
      });

      return {
        name: member.name,
        role: member.role,
        leadsAdded: memberLeads,
        emailsSent: memberEmails.length,
        callsMade: memberCalls.length,
        opens: memberOpened.length,
        replies: memberReplied.length,
        openRate: memberEmails.length > 0 ? memberOpened.length / memberEmails.length : 0,
        replyRate: memberEmails.length > 0 ? memberReplied.length / memberEmails.length : 0,
        meetings: memberMeetings,
      };
    })
  );

  // ── Top leads org-wide ──
  const topLeads = await db.lead.findMany({
    where: { ...ownerFilter, pipelineStage: { in: ["replied", "meeting", "won"] } },
    include: { emails: true, businessProfile: true, automationSignals: true, outreachMessages: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const agentConfig = await db.outreachAgent.findFirst({
    where: ownerFilter,
    orderBy: { createdAt: "desc" },
  });

  const scoredTop = topLeads.map((lead) => ({
    name: lead.name,
    company: lead.company,
    stage: lead.pipelineStage,
    owner: members.find((m) => m.userId === lead.ownerId)?.name ?? "Unknown",
    score: computeLeadScore({
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
    }).total,
  }));

  // ── AI recommendations ──
  const recommendations = await getAIRecommendations({
    totalLeads, newLeadsThisWeek,
    sent: sent.length, openRate, replyRate,
    calls: allMessages.filter((m) => m.channel === "phone" && m.status === "sent").length,
    pipeline, memberStats,
  });

  // ── Build the team report document ──
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const doc = buildTeamReport({
    date: dateLabel,
    totalLeads,
    newLeadsThisWeek,
    emailsSent: sent.filter((m) => m.channel === "email").length,
    callsMade: allMessages.filter((m) => m.channel === "phone" && m.status === "sent").length,
    openRate,
    replyRate,
    pipeline,
    memberStats,
    topLeads: scoredTop,
    recommendations,
  });

  // Push to MarkedUp team workspace
  try {
    await syncReportToMarkedUp({
      workspaceId,
      clerkToken: "",
      title: `Team Analytics — ${dateLabel}`,
      content: doc,
    });
  } catch { /* best effort */ }

  // Push per-member KPIs
  const weekNumber = getISOWeek(now);
  for (const member of memberStats) {
    const userId = members.find((m) => m.name === member.name)?.userId;
    if (!userId) continue;
    try {
      await syncMetricsToMarkedUp({
        workspaceId,
        clerkToken: "",
        userId,
        week: weekNumber,
        metrics: {
          leadsCapured: member.leadsAdded,
          emailsSent: member.emailsSent,
          callsMade: member.callsMade,
          repliesReceived: member.replies,
          meetingsBooked: member.meetings,
          dealsWon: 0,
        },
      });
    } catch { /* best effort */ }
  }

  return { success: true, members: memberStats.length, totalLeads };
}

function buildTeamReport(data: any): object {
  const content: any[] = [
    heading(1, `📊 Team Analytics — ${data.date}`),

    heading(2, "Pipeline Snapshot"),
    bulletList([
      `Total leads: ${data.totalLeads} (${data.newLeadsThisWeek} new this week)`,
      `New: ${data.pipeline.new ?? 0} | Contacted: ${data.pipeline.contacted ?? 0} | Replied: ${data.pipeline.replied ?? 0} | Meeting: ${data.pipeline.meeting ?? 0} | Won: ${data.pipeline.won ?? 0} | Lost: ${data.pipeline.lost ?? 0}`,
    ]),

    heading(2, "Team Outreach (Last 7 Days)"),
    bulletList([
      `Emails sent: ${data.emailsSent}`,
      `Calls made: ${data.callsMade}`,
      `Open rate: ${(data.openRate * 100).toFixed(1)}% ${data.openRate > 0.25 ? "✅" : data.openRate > 0.15 ? "⚠️" : "🔴"}`,
      `Reply rate: ${(data.replyRate * 100).toFixed(1)}% ${data.replyRate > 0.05 ? "✅" : data.replyRate > 0.02 ? "⚠️" : "🔴"}`,
    ]),

    heading(2, "👥 Per-Member Breakdown"),
  ];

  // Per-member stats table as bullet lists (TipTap doesn't have native tables easily)
  for (const member of data.memberStats) {
    content.push(
      heading(3, `${member.name} (${member.role})`),
      bulletList([
        `Leads added: ${member.leadsAdded}`,
        `Emails sent: ${member.emailsSent} | Open rate: ${(member.openRate * 100).toFixed(1)}%`,
        `Calls made: ${member.callsMade}`,
        `Replies: ${member.replies} | Reply rate: ${(member.replyRate * 100).toFixed(1)}%`,
        `Meetings booked: ${member.meetings}`,
      ])
    );
  }

  if (data.topLeads.length > 0) {
    content.push(
      heading(2, "🔥 Top Active Leads"),
      bulletList(data.topLeads.map((l: any) =>
        `${l.name}${l.company ? ` (${l.company})` : ""} — ${l.stage} — Score: ${l.score} — Owner: ${l.owner}`
      ))
    );
  }

  content.push(
    heading(2, "AI Recommendations"),
    bulletList(data.recommendations)
  );

  return { type: "doc", content };
}

function heading(level: number, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
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

async function getAIRecommendations(stats: any): Promise<string[]> {
  try {
    const memberContext = stats.memberStats?.map((m: any) =>
      `${m.name}: ${m.emailsSent} emails, ${m.callsMade} calls, ${(m.openRate * 100).toFixed(0)}% opens, ${m.replies} replies, ${m.meetings} meetings`
    ).join("\n") ?? "";

    const text = await aiComplete({
      system: "You're a sales team performance analyst.",
      prompt: `Give 4-6 specific actionable recommendations as a JSON array of strings. Include per-person coaching tips where relevant.

Team stats (last 7 days):
- ${stats.totalLeads} total leads, ${stats.newLeadsThisWeek} new
- ${stats.sent} messages sent, ${(stats.openRate * 100).toFixed(1)}% opens, ${(stats.replyRate * 100).toFixed(1)}% replies
- ${stats.calls} calls
- Pipeline: ${JSON.stringify(stats.pipeline)}

Per-member:
${memberContext}

Benchmarks: 20-30% open rate, 3-5% reply rate for cold outreach.`,
      maxTokens: 500,
    });
    const parsed = parseAIJson<string[]>(text);
    return parsed ?? ["Focus on hot leads", "Increase call volume"];
  } catch {
    return ["Focus on hot leads", "Increase call volume", "Review subject lines"];
  }
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
