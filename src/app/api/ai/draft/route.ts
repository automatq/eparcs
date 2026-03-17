import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { generateDraft } from "@/lib/ai/claude";
import { generateDraftOpenAI } from "@/lib/ai/openai";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    leadId,
    channel = "email",
    lead: rawLead,
    provider = "claude",
    model,
  } = body;

  // If leadId is provided, load from DB
  // If raw lead data is provided (from extension before save), use directly
  let leadData: any;
  let agentConfig: any = null;

  if (leadId) {
    leadData = await db.lead.findFirst({
      where: { id: leadId, ownerId: userId },
      include: {
        businessProfile: true,
        automationSignals: true,
      },
    });
    if (!leadData) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Load the user's agent config if available
    agentConfig = await db.outreachAgent.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
    });
  } else if (rawLead) {
    leadData = rawLead;
  } else {
    return NextResponse.json(
      { error: "Either leadId or lead data is required" },
      { status: 400 }
    );
  }

  const draftParams = {
    leadName: leadData.name ?? leadData.company ?? "Unknown",
    leadTitle: leadData.title ?? null,
    leadCompany: leadData.company ?? null,
    leadIndustry: leadData.industry ?? null,
    leadSource: leadData.source ?? "manual",
    businessProfile: leadData.businessProfile ?? (leadData.source === "gmaps" ? {
      category: leadData.category,
      rating: leadData.rating,
      reviewCount: leadData.reviewCount,
      website: leadData.website,
    } : null),
    automationSignal: leadData.automationSignals?.[0] ?? (leadData.source === "jobboard" ? {
      jobTitle: leadData.jobTitle,
      jobDescription: leadData.jobDescription,
      signalStrength: leadData.signalStrength,
    } : null),
    channel,
    agentConfig,
  };

  // Route to the selected AI provider (default: OpenAI)
  let draft;
  if (provider === "claude" && process.env.ANTHROPIC_API_KEY) {
    draft = await generateDraft(draftParams);
  } else {
    // Default to OpenAI
    draft = await generateDraftOpenAI({
      ...draftParams,
      model: model ?? "o4-mini",
    });
  }

  // If we have a leadId, save the draft as an OutreachMessage
  if (leadId) {
    const message = await db.outreachMessage.create({
      data: {
        leadId,
        channel,
        subject: draft.subject,
        content: draft.content,
        status: "draft",
        modelUsed: draft.modelUsed,
        ownerId: userId,
      },
    });

    return NextResponse.json({
      ...draft,
      messageId: message.id,
    });
  }

  return NextResponse.json(draft);
}
