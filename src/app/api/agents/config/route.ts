import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const agents = await db.outreachAgent.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  const agent = await db.outreachAgent.create({
    data: {
      ownerId: userId,
      name: body.name ?? "Sales Agent",
      agencyDescription: body.agencyDescription ?? null,
      targetIndustries: body.targetIndustries ?? null,
      tone: body.tone ?? "professional",
      differentiators: body.differentiators ?? null,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Agent ID required" }, { status: 400 });
  }

  const existing = await db.outreachAgent.findFirst({
    where: { id: body.id, ownerId: userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agent = await db.outreachAgent.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.agencyDescription !== undefined && { agencyDescription: body.agencyDescription }),
      ...(body.targetIndustries !== undefined && { targetIndustries: body.targetIndustries }),
      ...(body.tone !== undefined && { tone: body.tone }),
      ...(body.differentiators !== undefined && { differentiators: body.differentiators }),
    },
  });

  return NextResponse.json(agent);
}
