import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  syncReportToMarkedUp,
  syncMetricsToMarkedUp,
  buildReportDocument,
} from "@/lib/integrations/markedup-sync";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

/**
 * Generate a campaign report and push it to MarkedUp.
 *
 * POST /api/integrations/markedup/report
 * Body: { period: "week" | "month", clerkToken: string }
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { period = "week", clerkToken } = body;

  // Check MarkedUp connection via the user's org
  const teamMember = await db.teamMember.findUnique({ where: { userId } });
  const connection = teamMember
    ? await db.markedUpConnection.findUnique({ where: { orgId: teamMember.orgId } })
    : null;

  if (!connection) {
    return NextResponse.json(
      { error: "No MarkedUp connection configured. Go to Settings to connect." },
      { status: 400 }
    );
  }

  if (!clerkToken) {
    return NextResponse.json(
      { error: "clerkToken required for MarkedUp API auth" },
      { status: 400 }
    );
  }

  // Calculate date range
  const now = new Date();
  const startDate = new Date(now);
  if (period === "week") {
    startDate.setDate(startDate.getDate() - 7);
  } else {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Gather metrics
  const [
    totalLeads,
    leadsBySource,
    messages,
    allLeads,
  ] = await Promise.all([
    db.lead.count({
      where: { ownerId: userId, createdAt: { gte: startDate } },
    }),
    db.lead.groupBy({
      by: ["source"],
      where: { ownerId: userId, createdAt: { gte: startDate } },
      _count: true,
    }),
    db.outreachMessage.findMany({
      where: { ownerId: userId, createdAt: { gte: startDate } },
      include: { lead: true },
    }),
    db.lead.findMany({
      where: { ownerId: userId },
      include: {
        emails: true,
        outreachMessages: { where: { createdAt: { gte: startDate } } },
      },
    }),
  ]);

  const emailsSent = messages.filter((m) => m.channel === "email" && m.status === "sent").length;
  const callsMade = messages.filter((m) => m.channel === "phone" && m.status === "sent").length;
  const opened = messages.filter((m) => m.openedAt).length;
  const replied = messages.filter((m) => m.repliedAt).length;
  const meetings = allLeads.filter((l) => l.pipelineStage === "meeting").length;
  const won = allLeads.filter((l) => l.pipelineStage === "won").length;

  const openRate = emailsSent > 0 ? opened / emailsSent : 0;
  const replyRate = emailsSent > 0 ? replied / emailsSent : 0;

  const bySource: Record<string, number> = {};
  leadsBySource.forEach((g) => {
    bySource[g.source] = g._count;
  });

  // Top subject lines by open rate
  const subjectStats = new Map<string, { opens: number; total: number }>();
  messages
    .filter((m) => m.channel === "email" && m.subject && m.status === "sent")
    .forEach((m) => {
      const key = m.subject!;
      const stat = subjectStats.get(key) ?? { opens: 0, total: 0 };
      stat.total++;
      if (m.openedAt) stat.opens++;
      subjectStats.set(key, stat);
    });

  const topSubjectLines = Array.from(subjectStats.entries())
    .filter(([, s]) => s.total >= 2)
    .map(([subject, s]) => ({ subject, openRate: s.opens / s.total }))
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 5);

  // Top performing leads (by engagement)
  const topLeads = allLeads
    .filter((l) => l.pipelineStage !== "new" && l.pipelineStage !== "lost")
    .map((l) => ({
      name: l.name,
      company: l.company,
      score: l.pipelineStage === "won" ? 100 :
             l.pipelineStage === "meeting" ? 80 :
             l.pipelineStage === "replied" ? 60 :
             l.pipelineStage === "contacted" ? 30 : 10,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // AI-generated recommendations
  const recommendations = await generateRecommendations({
    totalLeads,
    emailsSent,
    callsMade,
    openRate,
    replyRate,
    meetings,
    won,
    topSubjectLines,
    period,
  });

  // Build the report document
  const periodLabel = period === "week"
    ? `Week of ${startDate.toLocaleDateString()} — ${now.toLocaleDateString()}`
    : `${startDate.toLocaleDateString()} — ${now.toLocaleDateString()}`;

  const reportContent = buildReportDocument({
    period: periodLabel,
    totalLeads,
    bySource,
    emailsSent,
    callsMade,
    openRate,
    replyRate,
    meetingsBooked: meetings,
    topPerformingLeads: topLeads,
    topSubjectLines,
    recommendations,
  });

  // Push report to MarkedUp
  const { documentId } = await syncReportToMarkedUp({
    workspaceId: connection.workspaceId,
    clerkToken,
    title: `Scraped Report — ${periodLabel}`,
    content: reportContent,
  });

  // Push KPI metrics to MarkedUp
  const weekNumber = getISOWeek(now);
  await syncMetricsToMarkedUp({
    workspaceId: connection.workspaceId,
    clerkToken,
    userId,
    week: weekNumber,
    metrics: {
      leadsCapured: totalLeads,
      emailsSent,
      callsMade,
      repliesReceived: replied,
      meetingsBooked: meetings,
      dealsWon: won,
    },
  });

  return NextResponse.json({
    success: true,
    documentId,
    metrics: {
      totalLeads,
      bySource,
      emailsSent,
      callsMade,
      openRate: Math.round(openRate * 100),
      replyRate: Math.round(replyRate * 100),
      meetingsBooked: meetings,
      dealsWon: won,
    },
    recommendations,
  });
}

async function generateRecommendations(stats: {
  totalLeads: number;
  emailsSent: number;
  callsMade: number;
  openRate: number;
  replyRate: number;
  meetings: number;
  won: number;
  topSubjectLines: { subject: string; openRate: number }[];
  period: string;
}): Promise<string[]> {
  const text = await aiComplete({
    system: "You are a sales performance analyst.",
    prompt: `Based on this ${stats.period}'s outreach data, give 3-5 specific, actionable recommendations.

Data:
- ${stats.totalLeads} leads captured
- ${stats.emailsSent} emails sent, ${stats.callsMade} calls made
- ${(stats.openRate * 100).toFixed(1)}% open rate, ${(stats.replyRate * 100).toFixed(1)}% reply rate
- ${stats.meetings} meetings booked, ${stats.won} deals won
${stats.topSubjectLines.length > 0 ? `- Best subject line: "${stats.topSubjectLines[0].subject}" (${(stats.topSubjectLines[0].openRate * 100).toFixed(0)}% opens)` : ""}

Industry benchmarks: 20-30% open rate, 3-5% reply rate for cold outreach.

Return just the recommendations as a JSON array of strings.`,
    maxTokens: 512,
  });

  const parsed = parseAIJson<string[]>(text);
  if (parsed) return parsed;
  return ["Review and optimize subject lines", "Increase call volume", "Focus on high-scoring leads"];
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
