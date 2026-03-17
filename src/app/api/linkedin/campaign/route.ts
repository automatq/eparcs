import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getCampaignStats } from "@/lib/linkedin/campaign-engine";

/**
 * GET /api/linkedin/campaign — List all campaigns with stats.
 * POST /api/linkedin/campaign — Create a new campaign with steps.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const campaigns = await db.linkedInCampaign.findMany({
    where: { ownerId: userId },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { prospects: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get stats for each campaign
  const withStats = await Promise.all(
    campaigns.map(async (c) => ({
      ...c,
      stats: await getCampaignStats(c.id),
    }))
  );

  return NextResponse.json(withStats);
}

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    name,
    accountType = "free",
    dailyLimit = 20,
    steps = [],
    prospects = [],
  } = body;

  if (!name) {
    return NextResponse.json({ error: "Campaign name required" }, { status: 400 });
  }

  const campaign = await db.linkedInCampaign.create({
    data: {
      name,
      ownerId: userId,
      accountType,
      dailyLimit,
      steps: {
        create: steps.map((step: any, i: number) => ({
          order: i,
          action: step.action,
          delayHours: step.delayHours ?? 24,
          messageTemplate: step.messageTemplate ?? null,
          tag: step.tag ?? null,
        })),
      },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  // Enroll prospects if provided
  if (prospects.length > 0) {
    const firstStep = campaign.steps[0];
    const now = new Date();

    await db.linkedInProspect.createMany({
      data: prospects.map((p: any) => ({
        campaignId: campaign.id,
        leadId: p.leadId ?? null,
        linkedinUrl: p.linkedinUrl,
        name: p.name,
        title: p.title ?? null,
        company: p.company ?? null,
        stage: "enrolled",
        currentStep: 0,
        nextActionAt: new Date(now.getTime() + (firstStep?.delayHours ?? 0) * 60 * 60 * 1000),
      })),
    });
  }

  return NextResponse.json(campaign, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { id, status, name, dailyLimit } = body;

  if (!id) {
    return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
  }

  const existing = await db.linkedInCampaign.findFirst({
    where: { id, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const campaign = await db.linkedInCampaign.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(name && { name }),
      ...(dailyLimit && { dailyLimit }),
    },
    include: { steps: true },
  });

  return NextResponse.json(campaign);
}
