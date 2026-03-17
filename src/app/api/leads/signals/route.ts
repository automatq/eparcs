import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { gatherSignals } from "@/lib/signals/personalization";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const { leadId } = await request.json();
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: { businessProfile: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const domain = lead.companyDomain
    ?? lead.businessProfile?.website?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
    ?? null;

  const signals = await gatherSignals({
    leadName: lead.name,
    domain,
    googleMapsUrl: lead.businessProfile?.googleMapsUrl ?? null,
  });

  return NextResponse.json(signals);
}
