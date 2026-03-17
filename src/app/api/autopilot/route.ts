import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { runAutopilotCycle, generateDailyReport } from "@/lib/autopilot/engine";

/**
 * GET /api/autopilot — Get autopilot config + recent activity.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const config = await db.autopilotConfig.findUnique({ where: { ownerId: userId } });
  const recentLogs = await db.autopilotLog.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const report = await generateDailyReport(userId);

  return NextResponse.json({ config, logs: recentLogs, report });
}

/**
 * POST /api/autopilot — Update autopilot config.
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  const config = await db.autopilotConfig.upsert({
    where: { ownerId: userId },
    create: {
      ownerId: userId,
      enabled: body.enabled ?? false,
      maxLeadsPerDay: body.maxLeadsPerDay ?? 50,
      maxEmailsPerDay: body.maxEmailsPerDay ?? 100,
      autoSendThreshold: body.autoSendThreshold ?? 70,
      approvalThreshold: body.approvalThreshold ?? 90,
      calendarLink: body.calendarLink ?? null,
      channels: JSON.stringify(body.channels ?? ["email"]),
      pauseOnNegative: body.pauseOnNegative ?? true,
    },
    update: {
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.maxLeadsPerDay && { maxLeadsPerDay: body.maxLeadsPerDay }),
      ...(body.maxEmailsPerDay && { maxEmailsPerDay: body.maxEmailsPerDay }),
      ...(body.autoSendThreshold && { autoSendThreshold: body.autoSendThreshold }),
      ...(body.approvalThreshold && { approvalThreshold: body.approvalThreshold }),
      ...(body.calendarLink !== undefined && { calendarLink: body.calendarLink }),
      ...(body.channels && { channels: JSON.stringify(body.channels) }),
      ...(body.pauseOnNegative !== undefined && { pauseOnNegative: body.pauseOnNegative }),
    },
  });

  return NextResponse.json(config);
}

/**
 * PATCH /api/autopilot — Manually trigger a cycle (for testing).
 */
export async function PATCH() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const result = await runAutopilotCycle(userId);
  return NextResponse.json(result);
}
