import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getNextActions,
  processActionResult,
  markProspectReplied,
} from "@/lib/linkedin/campaign-engine";
import type { ActionResult } from "@/lib/linkedin/actions";

/**
 * GET /api/linkedin/actions — Extension polls this for pending actions.
 * POST /api/linkedin/actions — Extension reports action results.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const actions = await getNextActions(userId);
  return NextResponse.json({ actions });
}

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  // Handle different event types
  if (body.type === "action_result") {
    const result: ActionResult = body.result;
    await processActionResult(result);
    return NextResponse.json({ success: true });
  }

  if (body.type === "reply_detected") {
    await markProspectReplied(body.linkedinUrl, userId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
}
