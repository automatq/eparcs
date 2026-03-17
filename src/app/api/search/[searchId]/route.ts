import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/search/:id — Poll search agent progress.
 *
 * Returns:
 * - status: running | completed | failed
 * - sourceProgress: { gmaps: { status, found }, yelp: { status, found }, ... }
 * - resultsCount: total leads found
 * - workspace with lead count
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ searchId: string }> }
) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const { searchId } = await params;

  const agent = await db.searchAgent.findUnique({
    where: { id: searchId },
    include: {
      workspace: {
        include: {
          _count: { select: { leads: true } },
          leads: {
            include: {
              lead: {
                include: {
                  businessProfile: true,
                  emails: { take: 1 },
                },
              },
            },
            orderBy: { addedAt: "desc" },
            take: 50,
          },
        },
      },
    },
  });

  if (!agent || agent.ownerId !== userId) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: agent.id,
    query: agent.query,
    status: agent.status,
    sources: JSON.parse(agent.sources),
    sourceProgress: JSON.parse(agent.sourceProgress),
    resultsCount: agent.resultsCount,
    workspaceId: agent.workspaceId,
    workspace: agent.workspace
      ? {
          id: agent.workspace.id,
          name: agent.workspace.name,
          leadCount: agent.workspace._count.leads,
          leads: agent.workspace.leads.map((wl) => ({
            id: wl.lead.id,
            name: wl.lead.name,
            title: wl.lead.title,
            company: wl.lead.company,
            location: wl.lead.location,
            source: wl.lead.source,
            fitScore: wl.lead.fitScore,
            fitScoreReason: wl.lead.fitScoreReason,
            rating: wl.lead.businessProfile?.rating,
            reviewCount: wl.lead.businessProfile?.reviewCount,
            category: wl.lead.businessProfile?.category,
            website: wl.lead.businessProfile?.website,
            email: wl.lead.emails[0]?.email,
            emailVerified: wl.lead.emails[0]?.verified,
          })),
        }
      : null,
    createdAt: agent.createdAt,
    completedAt: agent.completedAt,
  });
}
