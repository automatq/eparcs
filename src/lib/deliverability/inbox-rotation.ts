/**
 * Inbox Rotation + Deliverability Engine
 *
 * Sending 50+ cold emails from one address = spam folder.
 * This engine:
 *
 * 1. Rotates across multiple sending addresses/domains
 * 2. Tracks per-inbox health (bounce rate, spam complaints, open rate)
 * 3. Auto-pauses unhealthy inboxes
 * 4. Enforces daily send limits per inbox
 * 5. Warms up new inboxes gradually
 * 6. Staggers sends across the day (not all at once)
 * 7. Monitors deliverability signals
 */

import { db } from "@/lib/db";
import { Resend } from "resend";

export interface SendingInbox {
  id: string;
  email: string;
  domain: string;
  displayName: string;
  dailyLimit: number;
  sentToday: number;
  warmupDay: number; // 0 = fully warmed, 1-30 = warming up
  health: "healthy" | "warning" | "paused";
  bounceRate: number;
  openRate: number;
  lastSentAt: Date | null;
}

// Warmup schedule: gradually increase daily sends
const WARMUP_SCHEDULE: Record<number, number> = {
  1: 5,
  2: 5,
  3: 8,
  4: 8,
  5: 12,
  6: 12,
  7: 18,
  8: 18,
  9: 25,
  10: 25,
  11: 35,
  12: 35,
  13: 45,
  14: 45,
  15: 50,
  // Day 16+: use configured dailyLimit
};

/**
 * Select the best inbox to send from.
 * Considers: health, daily limit, warmup status, recent activity, domain distribution.
 */
export async function selectInbox(
  ownerId: string,
  recipientDomain?: string
): Promise<SendingInbox | null> {
  // In production, these would come from a SendingInbox DB model
  // For now, we use env-configured inboxes
  const inboxes = getConfiguredInboxes();

  if (inboxes.length === 0) return null;

  // Filter out paused and over-limit inboxes
  const available = inboxes.filter((inbox) => {
    if (inbox.health === "paused") return false;

    // Respect warmup limits
    const maxToday = inbox.warmupDay > 0
      ? (WARMUP_SCHEDULE[inbox.warmupDay] ?? inbox.dailyLimit)
      : inbox.dailyLimit;

    if (inbox.sentToday >= maxToday) return false;

    return true;
  });

  if (available.length === 0) return null;

  // Avoid sending from the same domain as the recipient
  const preferredInboxes = recipientDomain
    ? available.filter((i) => i.domain !== recipientDomain)
    : available;

  const candidates = preferredInboxes.length > 0 ? preferredInboxes : available;

  // Pick the inbox with the fewest sends today (round-robin effect)
  candidates.sort((a, b) => a.sentToday - b.sentToday);

  return candidates[0];
}

/**
 * Record a send from an inbox and update health metrics.
 */
export async function recordSend(inboxId: string, result: {
  bounced: boolean;
  opened: boolean;
  complained: boolean;
}) {
  // In production, update the SendingInbox model in the database
  // Track: sentToday++, bounce rate, open rate, complaint rate
  // Auto-pause if bounce rate > 5% or complaint rate > 0.1%
}

/**
 * Check inbox health and auto-pause if needed.
 */
export function checkHealth(inbox: SendingInbox): "healthy" | "warning" | "paused" {
  if (inbox.bounceRate > 0.05) return "paused"; // >5% bounce = paused
  if (inbox.bounceRate > 0.03) return "warning"; // >3% = warning
  if (inbox.openRate < 0.05 && inbox.sentToday > 20) return "warning"; // <5% open = likely spam
  return "healthy";
}

/**
 * Generate a staggered send schedule for the day.
 * Distributes sends across business hours with random intervals.
 */
export function generateSendSchedule(
  totalToSend: number,
  startHour: number = 8,
  endHour: number = 18
): Date[] {
  const now = new Date();
  const schedules: Date[] = [];
  const windowMs = (endHour - startHour) * 60 * 60 * 1000;

  for (let i = 0; i < totalToSend; i++) {
    const offset = Math.random() * windowMs;
    const sendTime = new Date(now);
    sendTime.setHours(startHour, 0, 0, 0);
    sendTime.setTime(sendTime.getTime() + offset);

    // Add jitter: ±5 minutes
    sendTime.setTime(sendTime.getTime() + (Math.random() - 0.5) * 10 * 60 * 1000);

    schedules.push(sendTime);
  }

  return schedules.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Send an email through the rotation system.
 */
export async function sendWithRotation(params: {
  ownerId: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}): Promise<{ success: boolean; fromInbox: string; messageId: string | null; error?: string }> {
  const recipientDomain = params.to.split("@")[1];
  const inbox = await selectInbox(params.ownerId, recipientDomain);

  if (!inbox) {
    return {
      success: false,
      fromInbox: "",
      messageId: null,
      error: "No available sending inboxes. All are paused or over daily limit.",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const result = await resend.emails.send({
      from: `${inbox.displayName} <${inbox.email}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      headers: params.headers,
    });

    // Record the send
    await recordSend(inbox.id, { bounced: false, opened: false, complained: false });

    return {
      success: true,
      fromInbox: inbox.email,
      messageId: result.data?.id ?? null,
    };
  } catch (err: any) {
    return {
      success: false,
      fromInbox: inbox.email,
      messageId: null,
      error: err.message,
    };
  }
}

/**
 * Get configured sending inboxes from environment/database.
 * Format: SENDING_INBOXES=email1@domain1.com:Display Name 1,email2@domain2.com:Display Name 2
 */
function getConfiguredInboxes(): SendingInbox[] {
  const config = process.env.SENDING_INBOXES;
  if (!config) {
    // Fall back to single inbox
    const from = process.env.OUTREACH_FROM_EMAIL;
    if (!from) return [];
    return [{
      id: "default",
      email: from,
      domain: from.split("@")[1],
      displayName: from.split("@")[0],
      dailyLimit: 50,
      sentToday: 0,
      warmupDay: 0,
      health: "healthy",
      bounceRate: 0,
      openRate: 0.25,
      lastSentAt: null,
    }];
  }

  return config.split(",").map((entry, i) => {
    const [email, displayName] = entry.split(":");
    return {
      id: `inbox-${i}`,
      email: email.trim(),
      domain: email.trim().split("@")[1],
      displayName: displayName?.trim() ?? email.split("@")[0],
      dailyLimit: 50,
      sentToday: 0,
      warmupDay: 0,
      health: "healthy" as const,
      bounceRate: 0,
      openRate: 0.25,
      lastSentAt: null,
    };
  });
}

/**
 * Get daily warmup limit for an inbox on a given day.
 */
export function getWarmupLimit(day: number): number {
  if (day <= 0) return 50; // Fully warmed
  return WARMUP_SCHEDULE[day] ?? 50;
}

/**
 * Generate a deliverability health report.
 */
export function generateHealthReport(inboxes: SendingInbox[]): {
  totalInboxes: number;
  healthy: number;
  warning: number;
  paused: number;
  totalSentToday: number;
  totalCapacityToday: number;
  avgBounceRate: number;
  avgOpenRate: number;
  recommendation: string;
} {
  const healthy = inboxes.filter((i) => i.health === "healthy").length;
  const warning = inboxes.filter((i) => i.health === "warning").length;
  const paused = inboxes.filter((i) => i.health === "paused").length;
  const totalSent = inboxes.reduce((sum, i) => sum + i.sentToday, 0);
  const totalCap = inboxes.reduce((sum, i) => sum + i.dailyLimit, 0);
  const avgBounce = inboxes.length > 0
    ? inboxes.reduce((sum, i) => sum + i.bounceRate, 0) / inboxes.length
    : 0;
  const avgOpen = inboxes.length > 0
    ? inboxes.reduce((sum, i) => sum + i.openRate, 0) / inboxes.length
    : 0;

  let recommendation = "All systems healthy.";
  if (paused > 0) recommendation = `${paused} inbox(es) paused due to high bounce rate. Check domain DNS settings.`;
  else if (warning > 0) recommendation = `${warning} inbox(es) showing warning signs. Reduce send volume.`;
  else if (avgOpen < 0.15) recommendation = "Open rates are below 15%. Review subject lines and sending times.";
  else if (totalSent > totalCap * 0.8) recommendation = "Approaching daily capacity. Consider adding more sending domains.";

  return {
    totalInboxes: inboxes.length,
    healthy,
    warning,
    paused,
    totalSentToday: totalSent,
    totalCapacityToday: totalCap,
    avgBounceRate: avgBounce,
    avgOpenRate: avgOpen,
    recommendation,
  };
}
