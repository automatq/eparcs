import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { generateCallScript, type CallType } from "@/lib/voice/script-generator";
import { initiateCall } from "@/lib/voice/bland-client";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    leadId,
    callType = "cold_intro" as CallType,
    phoneNumber,
    personalizationHook,
  } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: {
      phones: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Determine phone number
  const phone =
    phoneNumber ??
    lead.phones[0]?.phone ??
    lead.businessProfile?.phone;

  if (!phone) {
    return NextResponse.json(
      { error: "No phone number available for this lead. Add one or provide phoneNumber." },
      { status: 400 }
    );
  }

  // Load agent config
  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  // Generate the call script
  const script = await generateCallScript({
    leadName: lead.name,
    leadTitle: lead.title,
    leadCompany: lead.company,
    leadIndustry: lead.industry,
    leadSource: lead.source,
    callType,
    personalizationHook,
    painPoints: lead.automationSignals.map((s) => s.jobTitle).filter(Boolean) as string[],
    previousOutreach: lead.outreachMessages.map((m) => ({
      channel: m.channel,
      content: m.content,
      status: m.status,
    })),
    agentConfig: agentConfig ? {
      agencyDescription: agentConfig.agencyDescription,
      tone: agentConfig.tone,
      differentiators: agentConfig.differentiators,
      name: agentConfig.name,
    } : undefined,
  });

  // Initiate the call via Bland.ai
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const callResponse = await initiateCall({
    phoneNumber: phone,
    script: script.fullScript,
    voicemailScript: script.voicemailScript,
    maxDurationMins: Math.ceil(script.maxDurationSecs / 60),
    webhookUrl: `${appUrl}/api/calls/webhook`,
    record: true,
    metadata: {
      leadId: lead.id,
      ownerId: userId,
      callType,
    },
  });

  // Save as an outreach message
  const message = await db.outreachMessage.create({
    data: {
      leadId: lead.id,
      channel: "phone",
      subject: `AI Call: ${callType.replace(/_/g, " ")}`,
      content: script.fullScript,
      status: "queued",
      modelUsed: "bland-ai",
      ownerId: userId,
    },
  });

  // Update pipeline
  if (lead.pipelineStage === "new") {
    await db.lead.update({
      where: { id: lead.id },
      data: { pipelineStage: "contacted" },
    });
  }

  return NextResponse.json({
    callId: callResponse.call_id,
    messageId: message.id,
    script: {
      type: script.type,
      greeting: script.greeting,
      mainPitch: script.mainPitch,
      voicemailScript: script.voicemailScript,
    },
    phoneNumber: phone,
  });
}
