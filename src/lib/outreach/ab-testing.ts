/**
 * A/B Testing Framework
 *
 * Create message variants, track performance, auto-select winners.
 */

import { db } from "@/lib/db";

/**
 * Select a variant for a given step using weighted random selection.
 * Winner always gets selected if one exists.
 */
export async function selectVariant(stepId: string): Promise<{
  id: string;
  variant: string;
  subject: string | null;
  content: string;
} | null> {
  const variants = await db.messageVariant.findMany({
    where: { stepId },
    orderBy: { variant: "asc" },
  });

  if (variants.length === 0) return null;

  // If there's a winner, always use it
  const winner = variants.find((v) => v.isWinner);
  if (winner) return winner;

  // Random selection (equal weight initially)
  const index = Math.floor(Math.random() * variants.length);
  return variants[index];
}

/**
 * Record a send for a variant.
 */
export async function recordVariantSend(variantId: string): Promise<void> {
  await db.messageVariant.update({
    where: { id: variantId },
    data: { sendCount: { increment: 1 } },
  });
}

/**
 * Record an open for a variant.
 */
export async function recordVariantOpen(variantId: string): Promise<void> {
  await db.messageVariant.update({
    where: { id: variantId },
    data: { openCount: { increment: 1 } },
  });
}

/**
 * Record a reply for a variant.
 */
export async function recordVariantReply(variantId: string): Promise<void> {
  await db.messageVariant.update({
    where: { id: variantId },
    data: { replyCount: { increment: 1 } },
  });
}

/**
 * Check if we can declare a winner for a step's variants.
 * Uses a simplified significance test.
 *
 * Minimum: 50 sends per variant before declaring winner.
 */
export async function checkForWinner(stepId: string): Promise<{
  hasWinner: boolean;
  winnerId?: string;
  winnerVariant?: string;
  confidence?: number;
}> {
  const variants = await db.messageVariant.findMany({
    where: { stepId },
  });

  if (variants.length < 2) return { hasWinner: false };

  // Need minimum sends
  const minSends = 50;
  if (variants.some((v) => v.sendCount < minSends)) {
    return { hasWinner: false };
  }

  // Calculate reply rates
  const rates = variants.map((v) => ({
    ...v,
    replyRate: v.sendCount > 0 ? v.replyCount / v.sendCount : 0,
  }));

  // Sort by reply rate descending
  rates.sort((a, b) => b.replyRate - a.replyRate);

  const best = rates[0];
  const secondBest = rates[1];

  // Simple significance check: best must be at least 20% better than second
  // AND have at least 3% absolute reply rate difference
  const relativeImprovement =
    secondBest.replyRate > 0
      ? (best.replyRate - secondBest.replyRate) / secondBest.replyRate
      : best.replyRate > 0
      ? 1
      : 0;

  const absoluteDifference = best.replyRate - secondBest.replyRate;

  if (relativeImprovement >= 0.2 && absoluteDifference >= 0.03) {
    // Declare winner
    await db.messageVariant.update({
      where: { id: best.id },
      data: { isWinner: true },
    });

    // Calculate confidence (simplified)
    const confidence = Math.min(99, Math.floor(70 + relativeImprovement * 30));

    return {
      hasWinner: true,
      winnerId: best.id,
      winnerVariant: best.variant,
      confidence,
    };
  }

  return { hasWinner: false };
}

/**
 * Get A/B test stats for a step.
 */
export async function getVariantStats(stepId: string) {
  const variants = await db.messageVariant.findMany({
    where: { stepId },
    orderBy: { variant: "asc" },
  });

  return variants.map((v) => ({
    id: v.id,
    variant: v.variant,
    subject: v.subject,
    sendCount: v.sendCount,
    openCount: v.openCount,
    replyCount: v.replyCount,
    meetingCount: v.meetingCount,
    openRate: v.sendCount > 0 ? ((v.openCount / v.sendCount) * 100).toFixed(1) : "0",
    replyRate: v.sendCount > 0 ? ((v.replyCount / v.sendCount) * 100).toFixed(1) : "0",
    isWinner: v.isWinner,
  }));
}
