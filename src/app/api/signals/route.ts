import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { runSignalMonitoring, dismissSignal } from "@/lib/signals/intent-monitor";

/**
 * GET /api/signals — Get intent signal feed.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const signals = await db.intentSignal.findMany({
    where: { ownerId: userId, dismissed: false },
    orderBy: { detectedAt: "desc" },
    take: 50,
  });

  const counts = {
    total: signals.length,
    critical: signals.filter((s) => s.severity === "critical").length,
    high: signals.filter((s) => s.severity === "high").length,
    medium: signals.filter((s) => s.severity === "medium").length,
  };

  return NextResponse.json({ signals, counts });
}

/**
 * POST /api/signals — Manually trigger signal monitoring.
 */
export async function POST() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const detected = await runSignalMonitoring(userId);
  return NextResponse.json({ detected, message: `${detected} new signals detected` });
}

/**
 * PATCH /api/signals — Dismiss a signal.
 */
export async function PATCH(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  if (body.signalId) {
    await dismissSignal(body.signalId);
  }

  return NextResponse.json({ success: true });
}
