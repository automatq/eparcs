/**
 * AI Autopilot Engine
 *
 * Full autonomous sales agent:
 * 1. Auto-scrape leads based on ICP config
 * 2. Auto-enrich with waterfall
 * 3. Auto-score against ICP
 * 4. Auto-draft personalized outreach
 * 5. Auto-send (with guardrails)
 * 6. Auto-handle replies (classify, follow-up, book meetings)
 * 7. Generate daily report
 */

import { db } from "@/lib/db";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";
import { enrichLead } from "@/lib/enrichment";
import { detectMeetingIntent } from "./meeting-detector";
import { checkGuardrails } from "./guardrails";

/**
 * Run one autopilot cycle. Called by cron every 15-30 minutes.
 */
export async function runAutopilotCycle(ownerId: string): Promise<{
  actions: string[];
  errors: string[];
}> {
  const actions: string[] = [];
  const errors: string[] = [];

  const config = await db.autopilotConfig.findUnique({
    where: { ownerId },
  });

  if (!config || !config.enabled) {
    return { actions: ["Autopilot is disabled"], errors: [] };
  }

  const guardrails = await checkGuardrails(ownerId, config);
  if (guardrails.paused) {
    await logAction(ownerId, "paused", guardrails.reason ?? "Guardrails triggered");
    return { actions: [`Paused: ${guardrails.reason}`], errors: [] };
  }

  // ── Step 1: Find un-enriched leads and enrich them ──
  const unenriched = await db.lead.findMany({
    where: { ownerId, enrichmentStatus: "pending" },
    include: { businessProfile: true },
    take: 10,
  });

  for (const lead of unenriched) {
    try {
      const domain = lead.companyDomain ??
        lead.businessProfile?.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

      if (domain) {
        const results = await enrichLead({
          name: lead.name,
          company: lead.company ?? lead.name,
          companyDomain: domain,
          website: lead.businessProfile?.website ?? undefined,
        });

        for (const email of results.emails) {
          await db.leadEmail.create({
            data: {
              leadId: lead.id,
              email: email.email,
              source: email.source,
              confidence: email.confidence,
              verified: email.verified,
              personName: email.personName,
              personTitle: email.personTitle,
            },
          }).catch(() => {});
        }

        await db.lead.update({
          where: { id: lead.id },
          data: { enrichmentStatus: "complete", companyDomain: domain },
        });
        actions.push(`Enriched: ${lead.name}`);
        await logAction(ownerId, "enriched", `Enriched ${lead.name}`, lead.id);
      }
    } catch {
      errors.push(`Failed to enrich: ${lead.name}`);
    }
  }

  // ── Step 2: Draft outreach for leads with emails but no outreach ──
  const channels = JSON.parse(config.channels ?? '["email"]');
  if (channels.includes("email")) {
    const needsOutreach = await db.lead.findMany({
      where: {
        ownerId,
        enrichmentStatus: "complete",
        pipelineStage: "new",
        emails: { some: {} },
        outreachMessages: { none: {} },
      },
      include: {
        emails: { take: 1 },
        businessProfile: true,
        automationSignals: true,
      },
      take: guardrails.remainingEmails,
    });

    for (const lead of needsOutreach) {
      try {
        // Get agent config for personalization
        const agent = await db.outreachAgent.findFirst({ where: { ownerId } });

        const draftResponse = await aiComplete({
          system: `You are a sales outreach expert. Write a personalized cold email.
${agent ? `Agency: ${agent.agencyDescription}. Tone: ${agent.tone}. Differentiators: ${agent.differentiators}` : ""}
Return JSON: {"subject": "...", "body": "..."}`,
          prompt: `Lead: ${lead.name}
${lead.title ? `Title: ${lead.title}` : ""}
${lead.company ? `Company: ${lead.company}` : ""}
${lead.businessProfile?.category ? `Category: ${lead.businessProfile.category}` : ""}
${lead.businessProfile?.rating ? `Rating: ${lead.businessProfile.rating}/5 (${lead.businessProfile.reviewCount} reviews)` : ""}
${lead.automationSignals[0] ? `Hiring signal: ${lead.automationSignals[0].jobTitle}` : ""}

Write a short, personalized email (3-4 sentences max).`,
          maxTokens: 512,
        });

        const draft = parseAIJson<{ subject: string; body: string }>(draftResponse);
        if (!draft) continue;

        // Create the message
        const message = await db.outreachMessage.create({
          data: {
            leadId: lead.id,
            channel: "email",
            subject: draft.subject,
            content: draft.body,
            status: lead.fitScore && lead.fitScore >= config.approvalThreshold
              ? "draft" // High-value leads need approval
              : "queued", // Auto-send for lower-value leads
            modelUsed: "autopilot",
            ownerId,
          },
        });

        if (message.status === "queued") {
          actions.push(`Auto-queued email to ${lead.name}`);
          await logAction(ownerId, "drafted", `Auto-drafted email to ${lead.name}`, lead.id, message.id);
        } else {
          actions.push(`Drafted email to ${lead.name} (needs approval - high value)`);
          await logAction(ownerId, "drafted", `Drafted email for approval: ${lead.name}`, lead.id, message.id);
        }

        // Update pipeline stage
        await db.lead.update({
          where: { id: lead.id },
          data: { pipelineStage: "contacted" },
        });
      } catch {
        errors.push(`Failed to draft for: ${lead.name}`);
      }
    }
  }

  // ── Step 3: Handle replies ──
  const unhandledReplies = await db.outreachMessage.findMany({
    where: {
      ownerId,
      status: "replied",
      lead: { pipelineStage: { notIn: ["meeting", "won", "lost"] } },
    },
    include: { lead: true },
    take: 10,
  });

  for (const reply of unhandledReplies) {
    try {
      // Check for meeting intent
      const meetingIntent = await detectMeetingIntent(reply.content);

      if (meetingIntent.wantsMeeting && config.calendarLink) {
        // Auto-send calendar link
        const followUp = await db.outreachMessage.create({
          data: {
            leadId: reply.leadId,
            channel: "email",
            subject: `Re: ${reply.subject}`,
            content: `Thanks for your interest! Here's my calendar to book a time that works for you: ${config.calendarLink}`,
            status: "queued",
            modelUsed: "autopilot-meeting",
            ownerId,
          },
        });

        await db.lead.update({
          where: { id: reply.leadId },
          data: { pipelineStage: "meeting" },
        });

        actions.push(`Auto-booked meeting with ${reply.lead.name}`);
        await logAction(ownerId, "booked", `Auto-sent calendar link to ${reply.lead.name}`, reply.leadId, followUp.id);
      } else if (meetingIntent.isInterested) {
        // Draft a follow-up for interested replies
        const followUpText = await aiComplete({
          system: "Write a brief, friendly follow-up email responding to an interested prospect. Keep it to 2-3 sentences.",
          prompt: `Their reply: "${reply.content}"\n\nOur original email was about: ${reply.subject}`,
          maxTokens: 256,
        });

        await db.outreachMessage.create({
          data: {
            leadId: reply.leadId,
            channel: "email",
            subject: `Re: ${reply.subject}`,
            content: followUpText,
            status: "draft", // Follow-ups always need approval
            modelUsed: "autopilot-followup",
            ownerId,
          },
        });

        actions.push(`Drafted follow-up for interested reply from ${reply.lead.name}`);
        await logAction(ownerId, "replied", `Drafted follow-up for ${reply.lead.name}`, reply.leadId);
      }
    } catch {
      errors.push(`Failed to handle reply from: ${reply.lead.name}`);
    }
  }

  return { actions, errors };
}

/**
 * Generate daily autopilot report.
 */
export async function generateDailyReport(ownerId: string): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await db.autopilotLog.findMany({
    where: { ownerId, createdAt: { gte: today } },
    orderBy: { createdAt: "asc" },
  });

  const counts = {
    scraped: logs.filter((l) => l.action === "scraped").length,
    enriched: logs.filter((l) => l.action === "enriched").length,
    drafted: logs.filter((l) => l.action === "drafted").length,
    sent: logs.filter((l) => l.action === "sent").length,
    replied: logs.filter((l) => l.action === "replied").length,
    booked: logs.filter((l) => l.action === "booked").length,
    paused: logs.filter((l) => l.action === "paused").length,
  };

  return `Autopilot Daily Report:
- Leads enriched: ${counts.enriched}
- Emails drafted: ${counts.drafted}
- Emails sent: ${counts.sent}
- Replies handled: ${counts.replied}
- Meetings booked: ${counts.booked}
${counts.paused > 0 ? `- Paused ${counts.paused} time(s)` : ""}`;
}

async function logAction(
  ownerId: string,
  action: string,
  summary: string,
  leadId?: string,
  messageId?: string
) {
  await db.autopilotLog.create({
    data: { ownerId, action, summary, leadId, messageId },
  }).catch(() => {});
}
