/**
 * Zapier Webhook Integration
 *
 * Emit events to registered webhook URLs for Zapier/Make/n8n integration.
 */

import { db } from "@/lib/db";
import crypto from "crypto";

export type WebhookEvent =
  | "lead.created"
  | "lead.enriched"
  | "lead.scored"
  | "lead.stage_changed"
  | "reply.received"
  | "reply.classified"
  | "meeting.booked"
  | "deal.won"
  | "deal.lost"
  | "signal.detected"
  | "outreach.sent";

/**
 * Emit a webhook event to all matching subscriptions.
 */
export async function emitWebhook(
  ownerId: string,
  event: WebhookEvent,
  payload: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await db.webhookSubscription.findMany({
    where: { ownerId, status: "active" },
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const events = JSON.parse(sub.events) as string[];
    if (!events.includes(event) && !events.includes("*")) continue;

    try {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      // Sign with HMAC
      const signature = crypto
        .createHmac("sha256", sub.secret)
        .update(body)
        .digest("hex");

      await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Generate a webhook secret.
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
