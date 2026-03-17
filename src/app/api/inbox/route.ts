import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/inbox — Unified inbox: all replies across all channels.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  // Get all replied messages with lead data and classifications
  const replies = await db.outreachMessage.findMany({
    where: {
      ownerId: userId,
      status: "replied",
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          title: true,
          company: true,
          pipelineStage: true,
        },
      },
    },
    orderBy: { repliedAt: "desc" },
    take: 100,
  });

  // Get classifications for these messages
  const messageIds = replies.map((r) => r.id);
  const classifications = await db.replyClassification.findMany({
    where: { messageId: { in: messageIds } },
  });

  const classMap = new Map(classifications.map((c) => [c.messageId, c]));

  // Get follow-up drafts
  const followUps = await db.outreachMessage.findMany({
    where: {
      ownerId: userId,
      status: "draft",
      modelUsed: { startsWith: "autopilot" },
      leadId: { in: replies.map((r) => r.leadId) },
    },
  });

  const followUpMap = new Map(followUps.map((f) => [f.leadId, f]));

  const inbox = replies.map((reply) => {
    const classification = classMap.get(reply.id);
    const followUp = followUpMap.get(reply.leadId);

    return {
      id: reply.id,
      lead: reply.lead,
      channel: reply.channel,
      subject: reply.subject,
      content: reply.content,
      repliedAt: reply.repliedAt,
      classification: classification
        ? {
            category: classification.category,
            sentiment: classification.sentiment,
            summary: classification.summary,
            objectionType: classification.objectionType,
          }
        : null,
      suggestedFollowUp: followUp
        ? { id: followUp.id, subject: followUp.subject, content: followUp.content }
        : null,
    };
  });

  return NextResponse.json(inbox);
}
