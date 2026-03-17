/**
 * Source ROI Analytics
 *
 * Which source produces the most meetings and won deals.
 */

import { db } from "@/lib/db";

export interface SourceROI {
  source: string;
  totalLeads: number;
  contacted: number;
  replied: number;
  meetings: number;
  won: number;
  contactRate: number;
  replyRate: number;
  meetingRate: number;
  winRate: number;
}

export async function getSourceROI(ownerId: string): Promise<SourceROI[]> {
  const sources = ["gmaps", "linkedin", "yelp", "bbb", "jobboard", "import", "manual"];

  const results: SourceROI[] = [];

  for (const source of sources) {
    const total = await db.lead.count({ where: { ownerId, source } });
    if (total === 0) continue;

    const contacted = await db.lead.count({
      where: { ownerId, source, pipelineStage: { in: ["contacted", "replied", "meeting", "won"] } },
    });
    const replied = await db.lead.count({
      where: { ownerId, source, pipelineStage: { in: ["replied", "meeting", "won"] } },
    });
    const meetings = await db.lead.count({
      where: { ownerId, source, pipelineStage: { in: ["meeting", "won"] } },
    });
    const won = await db.lead.count({
      where: { ownerId, source, pipelineStage: "won" },
    });

    results.push({
      source,
      totalLeads: total,
      contacted,
      replied,
      meetings,
      won,
      contactRate: (contacted / total) * 100,
      replyRate: contacted > 0 ? (replied / contacted) * 100 : 0,
      meetingRate: replied > 0 ? (meetings / replied) * 100 : 0,
      winRate: meetings > 0 ? (won / meetings) * 100 : 0,
    });
  }

  return results.sort((a, b) => b.totalLeads - a.totalLeads);
}

/**
 * Get outreach performance stats.
 */
export async function getOutreachStats(ownerId: string) {
  const total = await db.outreachMessage.count({ where: { ownerId } });
  const sent = await db.outreachMessage.count({ where: { ownerId, status: "sent" } });
  const opened = await db.outreachMessage.count({ where: { ownerId, openedAt: { not: null } } });
  const replied = await db.outreachMessage.count({ where: { ownerId, status: "replied" } });

  // By channel
  const channels = ["email", "linkedin", "sms", "twitter"];
  const byChannel = await Promise.all(
    channels.map(async (channel) => ({
      channel,
      sent: await db.outreachMessage.count({ where: { ownerId, channel, status: "sent" } }),
      replied: await db.outreachMessage.count({ where: { ownerId, channel, status: "replied" } }),
    }))
  );

  return {
    total,
    sent,
    opened,
    replied,
    openRate: sent > 0 ? (opened / sent) * 100 : 0,
    replyRate: sent > 0 ? (replied / sent) * 100 : 0,
    byChannel: byChannel.filter((c) => c.sent > 0),
  };
}
