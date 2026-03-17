import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { computeLeadScore, aiLeadAnalysis } from "@/lib/scoring/lead-scorer";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { leadId, deep = false } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: {
      emails: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get user's agent config for target industries
  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  const scoreInput = {
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
  };

  // Fast deterministic score
  const score = computeLeadScore(scoreInput);

  // Optional deep AI analysis
  let aiAnalysis = null;
  if (deep) {
    aiAnalysis = await aiLeadAnalysis({
      ...scoreInput,
      jobDescriptionFull: lead.automationSignals[0]?.jobDescription ?? undefined,
    });
  }

  return NextResponse.json({
    score,
    aiAnalysis,
  });
}

/**
 * Batch score all leads for a user.
 */
export async function GET(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const leads = await db.lead.findMany({
    where: { ownerId: userId },
    include: {
      emails: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: true,
    },
  });

  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  const scored = leads.map((lead) => {
    const score = computeLeadScore({
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
    });

    return {
      leadId: lead.id,
      name: lead.name,
      company: lead.company,
      score: score.total,
      tier: score.tier,
      reasoning: score.reasoning,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return NextResponse.json({ leads: scored });
}
