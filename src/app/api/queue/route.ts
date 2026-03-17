import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { generateDailyQueue, type QueueInput } from "@/lib/icp/daily-queue";
import { type ICPConfig } from "@/lib/icp/engine";

/**
 * GET /api/queue — Get today's prioritized lead queue.
 * Returns the top leads to contact today, ranked with reasons.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const leads = await db.lead.findMany({
    where: { ownerId: userId },
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  // Build ICP config from agent settings
  const icpConfig: ICPConfig = {
    targetCategories: agentConfig?.targetIndustries?.split(/[,;]+/).map((t) => t.trim()).filter(Boolean) ?? [],
    excludeCategories: [],
    minReviews: 5,
    maxReviews: 500,
    idealReviewRange: [10, 200],
    minRating: 2.0,
    maxRating: 4.8,
    idealRatingRange: [3.0, 4.2],
    targetLocations: [],
    excludeLocations: [],
    requireWebsite: false,
    requirePhone: false,
    requireEmail: false,
    minEstimatedRevenue: 0,
    maxEstimatedRevenue: Infinity,
    competitorKeywords: [],
  };

  // Map leads to queue input
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
        name: lead.name,
        title: lead.title,
        company: lead.company,
        industry: lead.industry,
        source: lead.source,
        leadType: lead.leadType,
        businessProfile: lead.businessProfile ? {
          category: lead.businessProfile.category,
          rating: lead.businessProfile.rating,
          reviewCount: lead.businessProfile.reviewCount,
          website: lead.businessProfile.website,
          phone: lead.businessProfile.phone,
        } : null,
        automationSignals: lead.automationSignals.map((s) => ({
          signalType: s.signalType,
          signalStrength: s.signalStrength,
          jobTitle: s.jobTitle,
          jobDescription: s.jobDescription,
        })),
        emails: lead.emails.map((e) => ({ verified: e.verified })),
        outreachMessages: lead.outreachMessages.map((m) => ({
          status: m.status,
          openedAt: m.openedAt,
          clickedAt: m.clickedAt,
          repliedAt: m.repliedAt,
        })),
        targetIndustries: agentConfig?.targetIndustries ?? null,
      },
    };
  });

  const queue = generateDailyQueue(queueInputs, icpConfig, 20);

  return NextResponse.json({
    date: new Date().toISOString(),
    queue,
    totalLeads: leads.length,
    activeLeads: leads.filter((l) => l.pipelineStage !== "won" && l.pipelineStage !== "lost").length,
  });
}
