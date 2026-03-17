import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";

export default async function PipelinePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const leads = await db.lead.findMany({
    where: { ownerId: userId },
    include: { emails: true, businessProfile: true },
    orderBy: { updatedAt: "desc" },
  });

  const serialized = leads.map((l) => ({
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
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag leads between stages to update their status
        </p>
      </div>
      <KanbanBoard initialLeads={serialized} />
    </div>
  );
}
