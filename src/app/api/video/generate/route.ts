import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { generateVideoScript } from "@/lib/video/video-script-generator";
import { createVideo, getVideoStatus } from "@/lib/video/heygen-client";

/**
 * Generate a personalized AI video for a lead.
 *
 * POST /api/video/generate
 * Body: { leadId, scriptType?, avatarId? }
 *
 * Returns the video script immediately + kicks off video generation.
 * Poll GET /api/video/generate?videoId=xxx for completion.
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    leadId,
    scriptType = "cold_intro",
    avatarId,
  } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: {
      businessProfile: true,
      automationSignals: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  // Generate the video script
  const { script, estimatedDuration, thumbnailText, emailBody } =
    await generateVideoScript({
      leadName: lead.name,
      leadCompany: lead.company,
      leadIndustry: lead.industry,
      leadSource: lead.source,
      painPoints: lead.automationSignals.map((s) => s.jobTitle).filter(Boolean) as string[],
      agentConfig: agentConfig
        ? {
            agencyDescription: agentConfig.agencyDescription,
            tone: agentConfig.tone,
            differentiators: agentConfig.differentiators,
            name: agentConfig.name,
          }
        : undefined,
      scriptType,
    });

  // Kick off video generation with HeyGen
  let videoId = null;
  let videoError = null;

  try {
    const result = await createVideo({
      script,
      avatarId,
      aspectRatio: "16:9",
    });
    videoId = result.videoId;
  } catch (err: any) {
    videoError = err.message;
  }

  // Save as outreach message draft
  const message = await db.outreachMessage.create({
    data: {
      leadId,
      channel: "email",
      subject: `Personal video for ${lead.name}`,
      content: emailBody,
      status: "draft",
      modelUsed: "heygen + claude-sonnet-4",
      ownerId: userId,
    },
  });

  return NextResponse.json({
    messageId: message.id,
    script,
    estimatedDuration,
    thumbnailText,
    emailBody,
    videoId,
    videoStatus: videoId ? "processing" : "failed",
    videoError,
  });
}

/**
 * Check video generation status.
 *
 * GET /api/video/generate?videoId=xxx
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const status = await getVideoStatus(videoId);
  return NextResponse.json(status);
}
