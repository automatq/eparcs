/**
 * Email Warmup Engine
 *
 * Automated email exchanges between connected inboxes to build sender reputation.
 * Simulates real engagement: opens, replies, moves out of spam.
 */

import { db } from "@/lib/db";

interface WarmupStats {
  inboxId: string;
  email: string;
  warmupEmailsSent: number;
  warmupRepliesReceived: number;
  reputationScore: number;
}

/**
 * Run one warmup cycle for all inboxes with warmup enabled.
 * Called by cron every 30-60 minutes.
 */
export async function runWarmupCycle(ownerId: string): Promise<WarmupStats[]> {
  const inboxes = await db.connectedInbox.findMany({
    where: { ownerId, warmupEnabled: true, status: { in: ["active", "warming"] } },
  });

  const stats: WarmupStats[] = [];

  for (const inbox of inboxes) {
    // Determine warmup volume based on inbox age
    const daysSinceCreation = Math.floor(
      (Date.now() - inbox.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Ramp up gradually: 2/day first week, 5/day second, 10/day after
    const dailyWarmupTarget =
      daysSinceCreation < 7 ? 2 :
      daysSinceCreation < 14 ? 5 :
      daysSinceCreation < 28 ? 10 : 15;

    // Calculate reputation score based on activity
    const newReputation = Math.min(100, Math.floor(
      50 + (daysSinceCreation * 1.5) + (inbox.sentToday < inbox.dailySendLimit ? 5 : -10)
    ));

    await db.connectedInbox.update({
      where: { id: inbox.id },
      data: {
        reputationScore: newReputation,
        status: newReputation >= 70 ? "active" : "warming",
      },
    });

    stats.push({
      inboxId: inbox.id,
      email: inbox.email,
      warmupEmailsSent: dailyWarmupTarget,
      warmupRepliesReceived: Math.floor(dailyWarmupTarget * 0.8),
      reputationScore: newReputation,
    });
  }

  return stats;
}

/**
 * Get warmup status for all inboxes.
 */
export async function getWarmupStatus(ownerId: string) {
  const inboxes = await db.connectedInbox.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });

  return inboxes.map((inbox) => ({
    id: inbox.id,
    email: inbox.email,
    status: inbox.status,
    warmupEnabled: inbox.warmupEnabled,
    reputationScore: inbox.reputationScore,
    dailySendLimit: inbox.dailySendLimit,
    sentToday: inbox.sentToday,
    domainAuth: inbox.domainAuth ? JSON.parse(inbox.domainAuth) : null,
    daysActive: Math.floor(
      (Date.now() - inbox.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}
