import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LeadTable } from "@/components/leads/LeadTable";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; stage?: string; search?: string; page?: string; workspace?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const page = parseInt(params.page ?? "1");
  const limit = 50;

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
        outreachMessages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [
        { fitScore: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.lead.count({ where }),
  ]);

  // Get counts by source for the filter tabs
  const [linkedinCount, gmapsCount, jobboardCount, yelpCount] = await Promise.all([
    db.lead.count({ where: { ownerId: userId, source: "linkedin", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "gmaps", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "jobboard", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
    db.lead.count({ where: { ownerId: userId, source: "yelp", ...(workspaceLeadIds ? { id: { in: workspaceLeadIds } } : {}) } }),
  ]);

  // Get workspaces for the selector
  const workspaces = await db.workspace.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { leads: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {workspaceName ? workspaceName : "Leads"}
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          {total} leads {workspaceName ? `in "${workspaceName}"` : "captured across all sources"}
        </p>
      </div>

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
    </div>
  );
}
