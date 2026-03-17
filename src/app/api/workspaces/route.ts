import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/workspaces — List workspaces with lead counts.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const workspaces = await db.workspace.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { leads: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(workspaces);
}

/**
 * POST /api/workspaces — Create a workspace.
 * Body: { name: string, description?: string }
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const workspace = await db.workspace.create({
    data: { name, description, ownerId: userId },
  });

  return NextResponse.json(workspace);
}

/**
 * PATCH /api/workspaces — Update a workspace.
 * Body: { id: string, name?: string, description?: string }
 */
export async function PATCH(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { id, name, description, addLeadIds, removeLeadIds } = body;

  if (!id) {
    return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
  }

  // Verify ownership
  const workspace = await db.workspace.findUnique({ where: { id } });
  if (!workspace || workspace.ownerId !== userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Update name/description
  if (name || description) {
    await db.workspace.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description && { description }),
      },
    });
  }

  // Add leads to workspace
  if (addLeadIds && Array.isArray(addLeadIds)) {
    for (const leadId of addLeadIds) {
      await db.workspaceLead
        .create({ data: { workspaceId: id, leadId } })
        .catch(() => {}); // Skip duplicates
    }
  }

  // Remove leads from workspace
  if (removeLeadIds && Array.isArray(removeLeadIds)) {
    await db.workspaceLead.deleteMany({
      where: { workspaceId: id, leadId: { in: removeLeadIds } },
    });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/workspaces — Delete a workspace.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { id } = body;

  const workspace = await db.workspace.findUnique({ where: { id } });
  if (!workspace || workspace.ownerId !== userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await db.workspace.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
