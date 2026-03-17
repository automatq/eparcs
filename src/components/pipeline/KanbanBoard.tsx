"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";

export interface KanbanLead {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  source: string;
  pipelineStage: string;
  hasEmail: boolean;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
}

const STAGES = [
  { key: "new", label: "New", color: "text-muted-foreground", bg: "bg-muted/50" },
  { key: "contacted", label: "Contacted", color: "text-blue-500", bg: "bg-blue-500/5" },
  { key: "replied", label: "Replied", color: "text-green-500", bg: "bg-green-500/5" },
  { key: "meeting", label: "Meeting", color: "text-yellow-500", bg: "bg-yellow-500/5" },
  { key: "won", label: "Won", color: "text-emerald-500", bg: "bg-emerald-500/5" },
  { key: "lost", label: "Lost", color: "text-red-500", bg: "bg-red-500/5" },
];

export function KanbanBoard({ initialLeads }: { initialLeads: KanbanLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeLeadId = active.id as string;
    const overId = over.id as string;

    // Determine the target stage
    // overId could be a stage key (dropping on column) or a lead id (dropping on a card)
    let targetStage: string;
    const isStage = STAGES.some((s) => s.key === overId);
    if (isStage) {
      targetStage = overId;
    } else {
      const overLead = leads.find((l) => l.id === overId);
      if (!overLead) return;
      targetStage = overLead.pipelineStage;
    }

    const activeLead = leads.find((l) => l.id === activeLeadId);
    if (!activeLead || activeLead.pipelineStage === targetStage) return;

    // Optimistically move the lead
    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLeadId ? { ...l, pipelineStage: targetStage } : l
      )
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Save to API
    setSaving(leadId);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStage: lead.pipelineStage }),
      });
    } catch {
      // Revert on failure
      setLeads(initialLeads);
    } finally {
      setSaving(null);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.key}
            stage={stage}
            leads={leads.filter((l) => l.pipelineStage === stage.key)}
            savingId={saving}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? <KanbanCard lead={activeLead} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
