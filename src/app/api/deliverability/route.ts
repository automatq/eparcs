import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { checkDomainAuth } from "@/lib/deliverability/domain-checker";
import { checkSpamScore } from "@/lib/deliverability/spam-scorer";
import { getWarmupStatus } from "@/lib/deliverability/warmup";

/**
 * GET /api/deliverability — Get all deliverability data.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const warmupStatus = await getWarmupStatus(userId);
  return NextResponse.json({ inboxes: warmupStatus });
}

/**
 * POST /api/deliverability — Actions: check domain, check spam, add inbox.
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  if (body.action === "check_domain") {
    const result = await checkDomainAuth(body.domain);
    return NextResponse.json(result);
  }

  if (body.action === "check_spam") {
    const result = checkSpamScore(body.subject ?? "", body.body ?? "");
    return NextResponse.json(result);
  }

  if (body.action === "add_inbox") {
    const inbox = await db.connectedInbox.create({
      data: {
        ownerId: userId,
        email: body.email,
        provider: body.provider ?? "imap",
        credentials: body.credentials ?? "{}",
        warmupEnabled: body.warmupEnabled ?? true,
        dailySendLimit: body.dailySendLimit ?? 30,
      },
    });
    return NextResponse.json(inbox);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
