import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const record = await db.unsubscribe.findUnique({
    where: { token },
  });

  if (!record) {
    return new Response(
      `<html><body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; background: #000; color: #fff;">
        <div style="text-align: center;">
          <h1>Invalid Link</h1>
          <p>This unsubscribe link is not valid.</p>
        </div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  // Update the unsubscribe timestamp
  await db.unsubscribe.update({
    where: { token },
    data: { unsubscribedAt: new Date() },
  });

  return new Response(
    `<html><body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; background: #000; color: #fff;">
      <div style="text-align: center;">
        <h1>Unsubscribed</h1>
        <p>You have been unsubscribed and will no longer receive emails from us.</p>
      </div>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

// Support one-click unsubscribe via POST
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const record = await db.unsubscribe.findUnique({ where: { token } });
  if (!record) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  await db.unsubscribe.update({
    where: { token },
    data: { unsubscribedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
