/**
 * Agent Queue
 *
 * Manages concurrent search agents per user.
 * Default limit: 3 concurrent agents.
 */

import { db } from "@/lib/db";

const MAX_CONCURRENT_AGENTS = 3;

/**
 * Check if a user can start a new search agent.
 */
export async function canStartAgent(ownerId: string): Promise<boolean> {
  const running = await db.searchAgent.count({
    where: { ownerId, status: "running" },
  });
  return running < MAX_CONCURRENT_AGENTS;
}

/**
 * Get the count of running agents for a user.
 */
export async function getRunningAgentCount(ownerId: string): Promise<number> {
  return db.searchAgent.count({
    where: { ownerId, status: "running" },
  });
}

/**
 * Get recent search agents for a user.
 */
export async function getRecentAgents(
  ownerId: string,
  limit = 10
): Promise<any[]> {
  return db.searchAgent.findMany({
    where: { ownerId },
    include: { workspace: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Clean up stale agents that have been running for too long (> 10 minutes).
 */
export async function cleanupStaleAgents(): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const result = await db.searchAgent.updateMany({
    where: {
      status: "running",
      createdAt: { lt: tenMinutesAgo },
    },
    data: {
      status: "failed",
      completedAt: new Date(),
    },
  });
  return result.count;
}
