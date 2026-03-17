/**
 * MarkedUp Integration - Sync Engine
 *
 * Pushes data from Scraped into MarkedUp workspaces:
 * 1. Call logs (voice calls) → MarkedUp CallLog + Document
 * 2. Campaign reports → MarkedUp Document
 * 3. Lead profiles → MarkedUp Document
 * 4. Pipeline metrics → MarkedUp KPIs
 *
 * Uses MarkedUp's existing API routes with shared Clerk auth.
 */

const getMarkedUpBase = () =>
  process.env.MARKEDUP_API_URL ?? "http://localhost:3001";

/**
 * Push a call log to MarkedUp.
 * Creates a CallLog entry that appears in the workspace's call log view.
 */
export async function syncCallToMarkedUp(params: {
  workspaceId: string;
  clerkToken: string;
  title: string;
  transcript: string;
  summary: string;
  actionItems: string;
  outcome: "positive" | "neutral" | "negative";
  score: number;
  durationSecs: number;
  tags: string;
}): Promise<{ callId: string; documentId: string | null }> {
  const base = getMarkedUpBase();

  // Step 1: Create the call log
  // MarkedUp's POST /api/calls expects multipart with audio,
  // but POST /api/calls/save lets us save directly with transcript
  // We'll use a direct DB approach via a custom sync endpoint

  // Create the call log entry
  const callRes = await fetch(`${base}/api/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.clerkToken}`,
    },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      title: params.title,
      transcript: params.transcript,
      summary: params.summary,
      actionItems: params.actionItems,
      outcome: params.outcome,
      score: params.score,
      durationSecs: params.durationSecs,
      tags: params.tags,
      source: "scraped", // identify this came from Scraped
    }),
  });

  if (!callRes.ok) {
    const err = await callRes.json().catch(() => ({}));
    throw new Error(`MarkedUp call sync failed: ${JSON.stringify(err)}`);
  }

  const call = await callRes.json();

  // Step 2: Save as a document (creates a rich-text page in the workspace)
  let documentId = null;
  try {
    const docRes = await fetch(`${base}/api/calls/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.clerkToken}`,
      },
      body: JSON.stringify({
        callId: call.id,
        workspaceId: params.workspaceId,
      }),
    });

    if (docRes.ok) {
      const doc = await docRes.json();
      documentId = doc.document?.id ?? null;
    }
  } catch {
    // Document creation is optional
  }

  return { callId: call.id, documentId };
}

/**
 * Push a campaign report to MarkedUp as a document.
 */
export async function syncReportToMarkedUp(params: {
  workspaceId: string;
  clerkToken: string;
  title: string;
  content: object; // TipTap JSON content
  parentId?: string; // nest under a "Scraped Reports" folder
}): Promise<{ documentId: string }> {
  const base = getMarkedUpBase();

  const res = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.clerkToken}`,
    },
    body: JSON.stringify({
      workspaceId: params.workspaceId,
      title: params.title,
      content: params.content,
      sourceType: "scraped-report",
      parentId: params.parentId ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`MarkedUp report sync failed: ${JSON.stringify(err)}`);
  }

  const doc = await res.json();
  return { documentId: doc.id };
}

/**
 * Push pipeline metrics to MarkedUp as KPIs.
 */
export async function syncMetricsToMarkedUp(params: {
  workspaceId: string;
  clerkToken: string;
  userId: string;
  week: string; // ISO week format e.g., "2026-W11"
  metrics: {
    leadsCapured: number;
    emailsSent: number;
    callsMade: number;
    repliesReceived: number;
    meetingsBooked: number;
    dealsWon: number;
  };
}): Promise<void> {
  const base = getMarkedUpBase();

  const kpis = [
    { name: "Leads Captured", target: 50, actual: params.metrics.leadsCapured, unit: "leads", category: "outreach" },
    { name: "Emails Sent", target: 100, actual: params.metrics.emailsSent, unit: "emails", category: "outreach" },
    { name: "Calls Made", target: 20, actual: params.metrics.callsMade, unit: "calls", category: "outreach" },
    { name: "Replies Received", target: 15, actual: params.metrics.repliesReceived, unit: "replies", category: "outreach" },
    { name: "Meetings Booked", target: 5, actual: params.metrics.meetingsBooked, unit: "meetings", category: "sales" },
    { name: "Deals Won", target: 2, actual: params.metrics.dealsWon, unit: "deals", category: "sales" },
  ];

  for (const kpi of kpis) {
    await fetch(`${base}/api/kpis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.clerkToken}`,
      },
      body: JSON.stringify({
        workspaceId: params.workspaceId,
        userId: params.userId,
        name: kpi.name,
        target: kpi.target,
        actual: kpi.actual,
        unit: kpi.unit,
        week: params.week,
        category: kpi.category,
      }),
    });
  }
}

/**
 * Build a TipTap JSON document for a campaign report.
 */
export function buildReportDocument(report: {
  period: string;
  totalLeads: number;
  bySource: Record<string, number>;
  emailsSent: number;
  callsMade: number;
  openRate: number;
  replyRate: number;
  meetingsBooked: number;
  topPerformingLeads: { name: string; company: string | null; score: number }[];
  topSubjectLines: { subject: string; openRate: number }[];
  recommendations: string[];
}): object {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: `Scraped Campaign Report — ${report.period}` }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Overview" }],
      },
      {
        type: "bulletList",
        content: [
          bulletItem(`${report.totalLeads} leads captured (${Object.entries(report.bySource).map(([k, v]) => `${v} from ${k}`).join(", ")})`),
          bulletItem(`${report.emailsSent} emails sent, ${report.callsMade} calls made`),
          bulletItem(`${(report.openRate * 100).toFixed(1)}% open rate, ${(report.replyRate * 100).toFixed(1)}% reply rate`),
          bulletItem(`${report.meetingsBooked} meetings booked`),
        ],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Top Performing Leads" }],
      },
      {
        type: "bulletList",
        content: report.topPerformingLeads.slice(0, 5).map((lead) =>
          bulletItem(`${lead.name}${lead.company ? ` (${lead.company})` : ""} — Score: ${lead.score}`)
        ),
      },
      ...(report.topSubjectLines.length > 0 ? [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Best Subject Lines" }],
        },
        {
          type: "bulletList",
          content: report.topSubjectLines.slice(0, 5).map((sl) =>
            bulletItem(`"${sl.subject}" — ${(sl.openRate * 100).toFixed(1)}% open rate`)
          ),
        },
      ] : []),
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "AI Recommendations" }],
      },
      {
        type: "bulletList",
        content: report.recommendations.map((rec) => bulletItem(rec)),
      },
    ],
  };
}

function bulletItem(text: string) {
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}
