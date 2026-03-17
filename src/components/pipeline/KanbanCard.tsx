"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GripVertical, Loader2, Star } from "lucide-react";
import Link from "next/link";

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

const sourceColors: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-500",
  gmaps: "bg-green-500/10 text-green-500",
  jobboard: "bg-purple-500/10 text-purple-500",
  manual: "bg-muted text-muted-foreground",
};

export function KanbanCard({
  lead,
  isDragging = false,
  isSaving = false,
}: {
  lead: KanbanLead;
  isDragging?: boolean;
  isSaving?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: lead.id,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-border bg-card p-3 transition-shadow",
        isDragging && "shadow-lg shadow-primary/10 opacity-90 rotate-2 scale-105",
        isSaving && "opacity-70",
        !isDragging && "hover:border-foreground/20 hover:shadow-sm"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <Link href={`/leads/${lead.id}`} className="hover:underline">
            <div className="font-medium text-sm truncate">{lead.name}</div>
          </Link>
          {lead.title && (
            <div className="text-xs text-muted-foreground truncate">{lead.title}</div>
          )}
          {lead.company && (
            <div className="text-xs text-muted-foreground truncate">{lead.company}</div>
          )}
          {lead.category && (
            <div className="text-xs text-muted-foreground mt-1">{lead.category}</div>
          )}
          {lead.rating && (
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs text-muted-foreground">
                {lead.rating} ({lead.reviewCount})
              </span>
            </div>
          )}
          <div className="mt-2 flex gap-1">
            <Badge variant="secondary" className={cn("text-[10px]", sourceColors[lead.source])}>
              {lead.source}
            </Badge>
            {lead.hasEmail && (
              <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-500">
                email
              </Badge>
            )}
            {isSaving && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
