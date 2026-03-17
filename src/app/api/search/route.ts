import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parseSearchQuery } from "@/lib/search/query-parser";
import { runParallelSearch } from "@/lib/search/parallel-runner";
import { canStartAgent } from "@/lib/search/agent-queue";

/**
 * POST /api/search — Start an AI search agent.
 * Body: { query: string }
 *
 * The AI parses the natural language query, creates a workspace,
 * and kicks off parallel scrape jobs across multiple sources.
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return NextResponse.json(
      { error: "Please describe your ideal customer (at least 3 characters)" },
      { status: 400 }
    );
  }

  // Check concurrent agent limit
  const allowed = await canStartAgent(userId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You have too many searches running. Wait for one to finish." },
      { status: 429 }
    );
  }

  // Parse the natural language query with AI
  const parsed = await parseSearchQuery(query.trim());

  // Create workspace for results
  const workspace = await db.workspace.create({
    data: {
      name: query.trim().slice(0, 100),
      description: `AI search: ${query.trim()}`,
      ownerId: userId,
    },
  });

  // Create search agent record
  const searchAgent = await db.searchAgent.create({
    data: {
      ownerId: userId,
      query: query.trim(),
      status: "running",
      sources: JSON.stringify(parsed.sources),
      sourceProgress: JSON.stringify(
        Object.fromEntries(parsed.sources.map((s) => [s, { status: "pending", found: 0 }]))
      ),
      workspaceId: workspace.id,
    },
  });

  // Fire and forget — run parallel search in background
  runParallelSearch({
    searchAgentId: searchAgent.id,
    workspaceId: workspace.id,
    query: query.trim(),
    parsed,
    ownerId: userId,
  }).catch((err) => {
    console.error("Background search failed:", err);
    db.searchAgent
      .update({ where: { id: searchAgent.id }, data: { status: "failed" } })
      .catch(() => {});
  });

  return NextResponse.json({
    searchAgentId: searchAgent.id,
    workspaceId: workspace.id,
    sources: parsed.sources,
    parsed,
    message: `Searching ${parsed.sources.length} sources for: "${query.trim()}"`,
  });
}

/**
 * GET /api/search — List recent search agents.
 */
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const agents = await db.searchAgent.findMany({
    where: { ownerId: userId },
    include: { workspace: { include: { _count: { select: { leads: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(agents);
}
