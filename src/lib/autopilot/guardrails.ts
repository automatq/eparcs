/**
 * Autopilot Guardrails
 *
 * Safety checks to prevent over-sending, burning domains, or annoying leads.
 */

import { db } from "@/lib/db";

interface GuardrailResult {
  paused: boolean;
  reason?: string;
  remainingEmails: number;
}

export async function checkGuardrails(
  ownerId: string,
  config: {
    maxEmailsPerDay: number;
    maxLeadsPerDay: number;
    pauseOnNegative: boolean;
  }
): Promise<GuardrailResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check daily email limit
  const emailsSentToday = await db.outreachMessage.count({
    where: {
      ownerId,
      sentAt: { gte: today },
      channel: "email",
    },
  });

  if (emailsSentToday >= config.maxEmailsPerDay) {
    return {
      paused: true,
      reason: `Daily email limit reached (${emailsSentToday}/${config.maxEmailsPerDay})`,
      remainingEmails: 0,
    };
  }

  // Check for negative signal spike (3+ negative replies in last hour = pause)
  if (config.pauseOnNegative) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const negativeReplies = await db.replyClassification.count({
      where: {
        category: "not_interested",
        classifiedAt: { gte: oneHourAgo },
      },
    });

    if (negativeReplies >= 3) {
      return {
        paused: true,
        reason: `${negativeReplies} negative replies in the last hour. Pausing to protect sender reputation.`,
        remainingEmails: 0,
      };
    }
  }

  // Check daily lead scrape limit
  const leadsScrapedToday = await db.lead.count({
    where: {
      ownerId,
      createdAt: { gte: today },
    },
  });

  if (leadsScrapedToday >= config.maxLeadsPerDay) {
    // Don't pause, just limit scraping
  }

  return {
    paused: false,
    remainingEmails: config.maxEmailsPerDay - emailsSentToday,
  };
}
