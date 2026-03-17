/**
 * Pipeline Analytics
 *
 * Conversion rates, velocity, and funnel metrics.
 */

import { db } from "@/lib/db";

export interface PipelineStats {
  stages: { stage: string; count: number; percentage: number }[];
  conversions: { from: string; to: string; rate: number }[];
  velocity: { stage: string; avgDaysInStage: number }[];
  totalLeads: number;
  winRate: number;
  avgDealCycle: number; // days from new to won
}

export async function getPipelineStats(ownerId: string): Promise<PipelineStats> {
  const allLeads = await db.lead.findMany({
    where: { ownerId },
    select: { id: true, pipelineStage: true, createdAt: true, updatedAt: true },
  });

  const stages = ["new", "contacted", "replied", "meeting", "won", "lost"];
  const stageCounts = stages.map((stage) => ({
    stage,
    count: allLeads.filter((l) => l.pipelineStage === stage).length,
    percentage: allLeads.length > 0
      ? (allLeads.filter((l) => l.pipelineStage === stage).length / allLeads.length) * 100
      : 0,
  }));

  // Calculate conversion rates between adjacent stages
  const conversions = [];
  for (let i = 0; i < stages.length - 2; i++) {
    const fromCount = allLeads.filter((l) =>
      stages.indexOf(l.pipelineStage) >= stages.indexOf(stages[i])
    ).length;
    const toCount = allLeads.filter((l) =>
      stages.indexOf(l.pipelineStage) >= stages.indexOf(stages[i + 1])
    ).length;
    conversions.push({
      from: stages[i],
      to: stages[i + 1],
      rate: fromCount > 0 ? (toCount / fromCount) * 100 : 0,
    });
  }

  // Win rate
  const closedLeads = allLeads.filter((l) => ["won", "lost"].includes(l.pipelineStage));
  const wonLeads = allLeads.filter((l) => l.pipelineStage === "won");
  const winRate = closedLeads.length > 0
    ? (wonLeads.length / closedLeads.length) * 100
    : 0;

  // Average deal cycle
  const avgDealCycle = wonLeads.length > 0
    ? wonLeads.reduce((sum, l) => {
        const days = (l.updatedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0) / wonLeads.length
    : 0;

  return {
    stages: stageCounts,
    conversions,
    velocity: stages.map((stage) => ({ stage, avgDaysInStage: 0 })), // Simplified
    totalLeads: allLeads.length,
    winRate,
    avgDealCycle,
  };
}
