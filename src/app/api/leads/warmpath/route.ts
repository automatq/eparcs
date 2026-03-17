import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { findWarmPaths } from "@/lib/signals/warm-intro";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const { leadId } = await request.json();
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get past successful clients
  const pastClients = await db.lead.findMany({
    where: {
      ownerId: userId,
      pipelineStage: { in: ["meeting", "won"] },
      id: { not: leadId },
    },
    select: {
      name: true,
      company: true,
      industry: true,
      location: true,
    },
  });

  const agentConfig = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  const result = await findWarmPaths({
    leadName: lead.name,
    leadCompany: lead.company,
    leadIndustry: lead.industry,
    leadLocation: lead.location,
    pastClients,
    agencyName: agentConfig?.name ?? undefined,
  });

  return NextResponse.json(result);
}
