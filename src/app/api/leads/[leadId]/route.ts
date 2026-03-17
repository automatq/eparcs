import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { error, userId } = await requireAuth();
  if (error) return error;
  const { leadId } = await params;

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { error, userId } = await requireAuth();
  if (error) return error;
  const { leadId } = await params;

  const body = await request.json();

  // Verify ownership
  const existing = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const lead = await db.lead.update({
    where: { id: leadId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.company !== undefined && { company: body.company }),
      ...(body.industry !== undefined && { industry: body.industry }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.pipelineStage !== undefined && {
        pipelineStage: body.pipelineStage,
      }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
    include: {
      emails: true,
      businessProfile: true,
      automationSignals: true,
    },
  });

  return NextResponse.json(lead);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { error, userId } = await requireAuth();
  if (error) return error;
  const { leadId } = await params;

  const existing = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  await db.lead.delete({ where: { id: leadId } });
  return NextResponse.json({ success: true });
}
