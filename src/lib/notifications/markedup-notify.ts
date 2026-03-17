/**
 * MarkedUp Notification System
 *
 * Pushes notifications into MarkedUp via two mechanisms:
 *
 * 1. Liveblocks comment threads — creates comments on a "Scraped Activity"
 *    document which triggers MarkedUp's native notification bell + email alerts
 *
 * 2. Alert documents — for urgent events, creates a standalone document
 *    that appears in the workspace sidebar immediately
 *
 * Events that trigger notifications:
 * - Hot lead: email opened 3+ times
 * - Reply detected: lead replied to outreach
 * - Call completed: AI call finished with positive outcome
 * - Meeting booked: lead agreed to a meeting
 * - Deal won: lead moved to "won" stage
 * - Deliverability alert: bounce rate spiking
 * - Weekly report ready
 */

import { Liveblocks } from "@liveblocks/node";
import { syncReportToMarkedUp } from "@/lib/integrations/markedup-sync";

function getLiveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("LIVEBLOCKS_SECRET_KEY not configured");
  return new Liveblocks({ secret });
}

export type AlertLevel = "urgent" | "important" | "info";

export type EventType =
  | "hot_lead"
  | "reply_detected"
  | "call_completed"
  | "meeting_booked"
  | "deal_won"
  | "deliverability_alert"
  | "report_ready"
  | "objection_received";

interface NotifyParams {
  workspaceId: string;
  userId: string; // Clerk user ID to notify
  clerkToken: string;
  event: EventType;
  level: AlertLevel;
  title: string;
  body: string;
  leadName?: string;
  leadId?: string;
  metadata?: Record<string, string>;
}

const EVENT_EMOJI: Record<EventType, string> = {
  hot_lead: "🔥",
  reply_detected: "💬",
  call_completed: "📞",
  meeting_booked: "📅",
  deal_won: "🎉",
  deliverability_alert: "⚠️",
  report_ready: "📊",
  objection_received: "🛡️",
};

/**
 * Push a notification to MarkedUp.
 *
 * For urgent events: creates a standalone alert document in the workspace
 * For all events: posts a comment thread on the Scraped Activity document
 */
export async function notifyMarkedUp(params: NotifyParams) {
  const { workspaceId, event, level, title, body } = params;
  const emoji = EVENT_EMOJI[event] ?? "📌";

  // For urgent events, create a standalone alert document
  if (level === "urgent") {
    try {
      await syncReportToMarkedUp({
        workspaceId,
        clerkToken: params.clerkToken,
        title: `${emoji} ${title}`,
        content: buildAlertDocument(params),
      });
    } catch {
      // Best effort
    }
  }

  // Post a comment thread on the Scraped Activity document via Liveblocks
  try {
    const liveblocks = getLiveblocks();
    const roomId = `document:scraped-activity-${workspaceId}`;

    // Create a thread with the notification content
    await liveblocks.createThread({
      roomId,
      data: {
        comment: {
          userId: params.userId,
          body: {
            version: 1 as const,
            content: [
              {
                type: "paragraph" as const,
                children: [
                  { text: `${emoji} ` },
                  { text: title, bold: true },
                ],
              },
              {
                type: "paragraph" as const,
                children: [{ text: body }],
              },
              ...(params.leadName ? [{
                type: "paragraph" as const,
                children: [
                  { text: "Lead: ", bold: true },
                  { text: params.leadName },
                ],
              }] : []),
            ],
          },
        },
        metadata: {
          event,
          level,
          leadId: params.leadId ?? "",
          timestamp: new Date().toISOString(),
          ...params.metadata,
        },
      },
    });
  } catch {
    // Liveblocks thread creation is best-effort
    // If the room doesn't exist yet, we skip
  }
}

/**
 * Build a TipTap alert document for urgent notifications.
 */
function buildAlertDocument(params: NotifyParams): object {
  const emoji = EVENT_EMOJI[params.event] ?? "📌";
  const timestamp = new Date().toLocaleString();

  const content: any[] = [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: `${emoji} ${params.title}` }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: params.body },
      ],
    },
  ];

  if (params.leadName) {
    content.push({
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Lead: " },
        { type: "text", text: params.leadName },
      ],
    });
  }

  content.push({
    type: "paragraph",
    content: [
      { type: "text", marks: [{ type: "italic" }], text: `Scraped alert — ${timestamp}` },
    ],
  });

  // Add action buttons context
  if (params.event === "hot_lead" || params.event === "reply_detected") {
    content.push(
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Recommended Action" }],
      },
      {
        type: "bulletList",
        content: [
          listItem(params.event === "hot_lead"
            ? "Call this lead immediately — they're actively engaged"
            : "Review the reply and approve the AI-generated follow-up"
          ),
          listItem(`Open Scraped dashboard to take action${params.leadId ? ` (Lead ID: ${params.leadId})` : ""}`),
        ],
      }
    );
  }

  return { type: "doc", content };
}

function listItem(text: string) {
  return {
    type: "listItem",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text }],
    }],
  };
}

/**
 * Helper: notify about a hot lead (opened email 3+ times)
 */
export async function notifyHotLead(params: {
  workspaceId: string;
  userId: string;
  clerkToken: string;
  leadName: string;
  leadId: string;
  openCount: number;
}) {
  return notifyMarkedUp({
    ...params,
    event: "hot_lead",
    level: "urgent",
    title: `Hot Lead: ${params.leadName} opened ${params.openCount}x`,
    body: `${params.leadName} has opened your email ${params.openCount} times. They're actively interested — reach out now before they go cold.`,
  });
}

/**
 * Helper: notify about a reply
 */
export async function notifyReplyDetected(params: {
  workspaceId: string;
  userId: string;
  clerkToken: string;
  leadName: string;
  leadId: string;
  category: string;
  summary: string;
}) {
  const level: AlertLevel = params.category === "interested" ? "urgent" : "important";
  return notifyMarkedUp({
    ...params,
    event: "reply_detected",
    level,
    title: `Reply from ${params.leadName}: ${params.category}`,
    body: params.summary,
  });
}

/**
 * Helper: notify about call completion
 */
export async function notifyCallCompleted(params: {
  workspaceId: string;
  userId: string;
  clerkToken: string;
  leadName: string;
  leadId: string;
  outcome: string;
  summary: string;
}) {
  const level: AlertLevel = params.outcome === "positive" ? "urgent" : "info";
  return notifyMarkedUp({
    ...params,
    event: "call_completed",
    level,
    title: `Call with ${params.leadName}: ${params.outcome}`,
    body: params.summary,
  });
}
