"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2, Sparkles, ChevronDown, Search } from "lucide-react";

const AI_PROVIDERS = [
  { id: "claude", label: "Claude (Sonnet)", model: "claude-sonnet-4-20250514" },
  { id: "openai", label: "OpenAI (o4-mini)", model: "o4-mini" },
  { id: "openai-gpt4", label: "OpenAI (GPT-4.1)", model: "gpt-4.1" },
];

export function LeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);

  async function handleDraft(provider: string, model: string) {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel: "email", provider, model }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDrafting(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const res = await fetch("/api/enrich/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnrichResult(data.message);
        router.refresh();
      } else {
        setEnrichResult(data.error ?? "Enrichment failed");
      }
    } catch {
      setEnrichResult("Connection error");
    } finally {
      setEnriching(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    router.push("/leads");
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={handleEnrich} disabled={enriching}>
          <Search className="mr-1 h-3 w-3" />
          {enriching ? "Finding emails..." : "Find Email"}
        </Button>
        <div className="flex">
          <Button
            size="sm"
            className="rounded-r-none"
            onClick={() => handleDraft("claude", "claude-sonnet-4-20250514")}
            disabled={drafting}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {drafting ? "Drafting..." : "AI Draft"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" disabled={drafting} />}
            >
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {AI_PROVIDERS.map((p) => (
                <DropdownMenuItem
                  key={p.id + p.model}
                  onClick={() => handleDraft(p.id.replace("-gpt4", ""), p.model)}
                >
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button size="sm" variant="secondary" onClick={handleDelete}>
          <Trash2 className="mr-1 h-3 w-3" />
          Delete
        </Button>
      </div>
      {enrichResult && (
        <span className="text-xs text-muted-foreground">{enrichResult}</span>
      )}
    </div>
  );
}
