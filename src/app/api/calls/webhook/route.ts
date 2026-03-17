import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeCallTranscript } from "@/lib/voice/call-analyzer";
import { syncCallToMarkedUp } from "@/lib/integrations/markedup-sync";

/**
 * Bland.ai Call Completion Webhook
 *
 * Called when an AI voice call finishes. We:
 * 1. Parse the call result (transcript, duration, outcome)
 * 2. AI-analyze the transcript
 * 3. Update the outreach message status
 * 4. Update the lead's pipeline stage
 * 5. Auto-generate a follow-up if warranted
 * 6. Sync the call log to MarkedUp
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    call_id,
    to,
    status,
    duration,
    transcript,
    concatenated_transcript,
    recording_url,
    answered_by,
    call_length,
    metadata,
  } = body;

  const leadId = metadata?.leadId;
  const ownerId = metadata?.ownerId;
  const callType = metadata?.callType ?? "cold_intro";

  if (!leadId || !ownerId) {
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const fullTranscript = concatenated_transcript ?? transcript ?? "";
  const callDuration = call_length ?? duration ?? 0;

  // AI-analyze the transcript
  const analysis = await analyzeCallTranscript({
    transcript: fullTranscript,
    leadName: lead.name,
    leadCompany: lead.company,
    callType,
    duration: callDuration,
    answeredBy: answered_by ?? "unknown",
  });

  // Update the outreach message
  const existingMessage = await db.outreachMessage.findFirst({
    where: { leadId, channel: "phone", status: "queued", ownerId },
    orderBy: { createdAt: "desc" },
  });

  if (existingMessage) {
    await db.outreachMessage.update({
      where: { id: existingMessage.id },
      data: {
        status: status === "completed" ? "sent" : "failed",
        sentAt: new Date(),
        content: `${existingMessage.content}\n\n---\nTranscript:\n${fullTranscript.slice(0, 5000)}`,
      },
    });
  }

  // Update pipeline stage based on analysis
  const stageMap: Record<string, string> = {
    book_meeting: "meeting",
    send_info: "contacted",
    call_back: "contacted",
    add_to_sequence: "contacted",
    mark_lost: "lost",
  };

  const newStage = stageMap[analysis.followUpType] ?? lead.pipelineStage;
  if (analysis.outcome === "positive" && lead.pipelineStage === "new") {
    await db.lead.update({
      where: { id: leadId },
      data: { pipelineStage: "replied" },
    });
  } else if (newStage !== lead.pipelineStage && newStage !== "contacted") {
    await db.lead.update({
      where: { id: leadId },
      data: { pipelineStage: newStage },
    });
  }

  // Auto-generate follow-up if warranted
  let followUpId = null;
  if (analysis.followUpDraft && analysis.followUpType !== "none" && analysis.followUpType !== "mark_lost") {
    const followUp = await db.outreachMessage.create({
      data: {
        leadId,
        channel: "email",
        subject: `Following up on our call — ${lead.name}`,
        content: analysis.followUpDraft,
        status: "draft",
        modelUsed: "claude-sonnet-4-20250514",
        ownerId,
      },
    });
    followUpId = followUp.id;
  }

  // Save key quotes and next step as notes
  const noteLines: string[] = [];
  if (analysis.keyQuotes.length > 0) {
    noteLines.push(`Key quotes from call (${new Date().toLocaleDateString()}):`);
    analysis.keyQuotes.forEach((q) => noteLines.push(`  "${q}"`));
  }
  noteLines.push(`Next step: ${analysis.nextStep}`);

  await db.lead.update({
    where: { id: leadId },
    data: {
      notes: [lead.notes, noteLines.join("\n")].filter(Boolean).join("\n\n"),
    },
  });

  // Sync to MarkedUp if connection exists
  // Look up the team member's org to find the MarkedUp connection
  const teamMember = await db.teamMember.findUnique({ where: { userId: ownerId } });
  const markedUpConnection = teamMember
    ? await db.markedUpConnection.findUnique({ where: { orgId: teamMember.orgId } })
    : null;

  let markedUpCallId = null;
  if (markedUpConnection) {
    try {
      // We need a Clerk token for the MarkedUp API
      // In production, use a service token or server-to-server auth
      const result = await syncCallToMarkedUp({
        workspaceId: markedUpConnection.workspaceId,
        clerkToken: "", // Will need Clerk service token in production
        title: `Sales Call: ${lead.name}${lead.company ? ` — ${lead.company}` : ""}`,
        transcript: fullTranscript,
        summary: analysis.summary,
        actionItems: analysis.actionItems,
        outcome: analysis.outcome,
        score: analysis.score,
        durationSecs: callDuration,
        tags: analysis.tags,
      });
      markedUpCallId = result.callId;
    } catch (err) {
      // MarkedUp sync is best-effort — don't fail the webhook
      console.error("MarkedUp sync failed:", err);
    }
  }

  return NextResponse.json({
    status: "processed",
    leadId,
    analysis: {
      outcome: analysis.outcome,
      score: analysis.score,
      summary: analysis.summary,
      nextStep: analysis.nextStep,
      followUpType: analysis.followUpType,
      sentiment: analysis.prospectSentiment,
    },
    followUpId,
    markedUpCallId,
    recordingUrl: recording_url,
  });
}
