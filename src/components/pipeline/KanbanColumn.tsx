"use client";

import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { KanbanCard, type KanbanLead } from "./KanbanCard";
import { cn } from "@/lib/utils";

interface Stage {
  key: string;
  label: string;
  color: string;
  bg: string;
}

export function KanbanColumn({
  stage,
  leads,
  savingId,
}: {
  stage: Stage;
  leads: KanbanLead[];
  savingId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.key });

  return (
    <div className="min-w-[260px] flex-shrink-0">
      <div className="mb-3 flex items-center gap-2">
        <h2 className={`text-sm font-semibold ${stage.color}`}>{stage.label}</h2>
        <Badge variant="secondary" className="text-xs">
          {leads.length}
        </Badge>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[200px] space-y-2 rounded-xl border border-dashed border-border p-2 transition-colors",
          stage.bg,
          isOver && "border-primary/40 bg-primary/5"
        )}
      >
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            isSaving={savingId === lead.id}
          />
        ))}
        {leads.length === 0 && !isOver && (
          <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}
