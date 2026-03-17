import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyReply, handleObjection } from "@/lib/replies/classifier";

/**
 * Inbound email webhook handler.
 *
 * Resend forwards replies to this endpoint. We:
 * 1. Match the reply to the original outreach message
 * 2. Classify the reply using AI
 * 3. Update the message status
 * 4. Auto-generate a follow-up draft if warranted
 * 5. Update the lead's pipeline stage
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Resend inbound webhook payload
  const {
    from,
    to,
    subject,
    text: replyContent,
    html,
    in_reply_to,
    message_id,
  } = body;

  if (!from || !replyContent) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const senderEmail = typeof from === "string" ? from : from?.address ?? from?.[0]?.address;
  if (!senderEmail) {
    return NextResponse.json({ error: "No sender email" }, { status: 400 });
  }

  // Find the lead by email
  const leadEmail = await db.leadEmail.findFirst({
    where: { email: { equals: senderEmail, mode: "insensitive" } },
    include: { lead: true },
  });

  if (!leadEmail) {
    // Unknown sender — could be a new lead
    return NextResponse.json({ status: "unknown_sender", email: senderEmail });
  }

  const lead = leadEmail.lead;

  // Find the most recent sent outreach message to this lead
  const originalMessage = await db.outreachMessage.findFirst({
    where: { leadId: lead.id, status: "sent", channel: "email" },
    orderBy: { sentAt: "desc" },
  });

  // Classify the reply
  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: lead.ownerId },
    orderBy: { createdAt: "desc" },
  });

  const classification = await classifyReply({
    replyContent: replyContent.slice(0, 2000),
    originalMessage: originalMessage?.content ?? "",
    leadName: lead.name,
    leadCompany: lead.company,
    channel: "email",
    agencyDescription: agentConfig?.agencyDescription ?? undefined,
  });

  // Update the original message
  if (originalMessage) {
    await db.outreachMessage.update({
      where: { id: originalMessage.id },
      data: { repliedAt: new Date(), status: "replied" },
    });
  }

  // Update lead pipeline stage based on classification
  const stageMap: Record<string, string> = {
    interested: "replied",
    question: "replied",
    positive_referral: "replied",
    objection: "replied",
    not_interested: "lost",
    out_of_office: lead.pipelineStage, // don't change
    wrong_person: lead.pipelineStage,
  };

  const newStage = stageMap[classification.category] ?? lead.pipelineStage;
  if (newStage !== lead.pipelineStage) {
    await db.lead.update({
      where: { id: lead.id },
      data: { pipelineStage: newStage },
    });
  }

  // Auto-generate follow-up draft if warranted
  let followUpMessageId = null;
  if (classification.followUpDraft && classification.urgency !== "none") {
    // If it's an objection, generate a specialized response
    let followUpContent = classification.followUpDraft;
    if (classification.category === "objection" && classification.objectionType) {
      followUpContent = await handleObjection({
        objectionType: classification.objectionType,
        replyContent: replyContent.slice(0, 1000),
        leadName: lead.name,
        leadCompany: lead.company,
        channel: "email",
        agencyDescription: agentConfig?.agencyDescription ?? undefined,
        differentiators: agentConfig?.differentiators ?? undefined,
      });
    }

    const followUp = await db.outreachMessage.create({
      data: {
        leadId: lead.id,
        channel: "email",
        subject: `Re: ${originalMessage?.subject ?? subject ?? ""}`,
        content: followUpContent,
        status: "draft",
        modelUsed: "claude-sonnet-4-20250514",
        ownerId: lead.ownerId,
      },
    });
    followUpMessageId = followUp.id;
  }

  // If it's a referral, create a note
  if (classification.category === "positive_referral" && classification.referredTo) {
    await db.lead.update({
      where: { id: lead.id },
      data: {
        notes: [lead.notes, `Referred to: ${classification.referredTo}`]
          .filter(Boolean)
          .join("\n"),
      },
    });
  }

  return NextResponse.json({
    status: "processed",
    leadId: lead.id,
    classification: {
      category: classification.category,
      sentiment: classification.sentiment,
      summary: classification.summary,
      urgency: classification.urgency,
    },
    followUpMessageId,
    pipelineStageUpdated: newStage !== lead.pipelineStage,
  });
}
