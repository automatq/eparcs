import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LeadTable } from "@/components/leads/LeadTable";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; stage?: string; search?: string; page?: string; workspace?: string; view?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const limit = 50;
  const view = params.view ?? "table";

  // If filtering by workspace, get lead IDs first
  let workspaceLeadIds: string[] | null = null;
  let workspaceName: string | null = null;
  if (params.workspace) {
    const workspace = await db.workspace.findUnique({
      where: { id: params.workspace },
      include: { leads: { select: { leadId: true } } },
    });
    if (workspace && workspace.ownerId === userId) {
      workspaceLeadIds = workspace.leads.map((wl) => wl.leadId);
      workspaceName = workspace.name;
    }
  }

  const where: any = { ownerId: userId };
  if (workspaceLeadIds) where.id = { in: workspaceLeadIds };
  if (params.source) where.source = params.source;
  if (params.stage) where.pipelineStage = params.stage;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { company: { contains: params.search, mode: "insensitive" } },
      { title: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        emails: true,
        businessProfile: true,
        automationSignals: true,
        outreachMessages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [
        { fitScore: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: view === "table" ? (page - 1) * limit : 0,
      take: view === "table" ? limit : 500,
    }),
    db.lead.count({ where }),
  ]);

  const [linkedinCount, gmapsCount, jobboardCount, yelpCount] = await Promise.all([
    db.lead.count({ where: { ownerId: userId, source: "linkedin", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "gmaps", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "jobboard", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "yelp", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
  ]);

  const workspaces = await db.workspace.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { leads: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // Serialize for kanban
  const kanbanLeads = leads.map((l) => ({
    id: l.id,
    name: l.name,
    title: l.title,
    company: l.company,
    source: l.source,
    pipelineStage: l.pipelineStage,
    hasEmail: l.emails.length > 0,
    category: l.businessProfile?.category ?? null,
    rating: l.businessProfile?.rating ?? null,
    reviewCount: l.businessProfile?.reviewCount ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {workspaceName ?? "Leads"}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {total} leads {workspaceName ? `in "${workspaceName}"` : "across all sources"}
          </p>
        </div>
        {/* View toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <a
            href={`/leads?${new URLSearchParams({ ...params, view: "table" }).toString()}`}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "table" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Table
          </a>
          <a
            href={`/leads?${new URLSearchParams({ ...params, view: "kanban" }).toString()}`}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
              view === "kanban" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Kanban
          </a>
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard initialLeads={kanbanLeads} />
      ) : (
        <LeadTable
          leads={leads as any}
          total={total}
          page={page}
          limit={limit}
          counts={{
            all: total,
            linkedin: linkedinCount,
            gmaps: gmapsCount,
            jobboard: jobboardCount,
            yelp: yelpCount,
          }}
          filters={{
            source: params.source,
            stage: params.stage,
            search: params.search,
            workspace: params.workspace,
          }}
          workspaces={workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            leadCount: w._count.leads,
          }))}
        />
      )}
    </div>
  );
}
