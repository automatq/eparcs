import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendOutreachEmail } from "@/lib/outreach/email-sender";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { error, userId } = await requireAuth();
  if (error) return error;
  const { messageId } = await params;

  const message = await db.outreachMessage.findFirst({
    where: { id: messageId, ownerId: userId },
    include: {
      lead: {
        include: { emails: true },
      },
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.status !== "draft") {
    return NextResponse.json(
      { error: `Message is already ${message.status}` },
      { status: 400 }
    );
  }

  // For email channel, actually send the email
  if (message.channel === "email") {
    const email = message.lead.emails[0];
    if (!email) {
      return NextResponse.json(
        { error: "Lead has no email address" },
        { status: 400 }
      );
    }

    const fromAddress =
      process.env.OUTREACH_FROM_EMAIL ?? "outreach@scraped.io";

    const { unsubscribeToken } = await sendOutreachEmail({
      to: email.email,
      from: fromAddress,
      subject: message.subject ?? "Quick question",
      body: message.content,
      leadId: message.leadId,
    });

    // Create unsubscribe record
    await db.unsubscribe.create({
      data: {
        email: email.email,
        token: unsubscribeToken,
        leadId: message.leadId,
        source: "link",
      },
    });

    await db.outreachMessage.update({
      where: { id: messageId },
      data: { status: "sent", sentAt: new Date() },
    });

    // Update pipeline stage
    await db.lead.update({
      where: { id: message.leadId },
      data: { pipelineStage: "contacted" },
    });

    return NextResponse.json({ success: true, status: "sent" });
  }

  // For non-email channels, just mark as approved
  await db.outreachMessage.update({
    where: { id: messageId },
    data: { status: "approved" },
  });

  return NextResponse.json({ success: true, status: "approved" });
}
