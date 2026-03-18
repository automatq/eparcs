"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2, Sparkles, ChevronDown, Search, Loader2, CheckCircle2, Clock, X } from "lucide-react";

const AI_PROVIDERS = [
  { id: "claude", label: "Claude (Sonnet)", model: "claude-sonnet-4-20250514" },
  { id: "openai", label: "OpenAI (GPT-4.1)", model: "gpt-4.1" },
  { id: "openai-mini", label: "OpenAI (o4-mini)", model: "o4-mini" },
];

const ENRICHMENT_SOURCES = [
  { key: "teamPages", label: "Team pages" },
  { key: "website", label: "Website emails" },
  { key: "google", label: "Google search" },
  { key: "github", label: "GitHub profiles" },
  { key: "patterns", label: "Email patterns" },
  { key: "company", label: "Company intel" },
];

export function LeadActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [emailsFound, setEmailsFound] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Elapsed timer during enrichment
  useEffect(() => {
    if (enriching) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [enriching]);

  async function handleDraft(provider: string, model: string) {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel: "email", provider, model }),
      });
      if (res.ok) router.refresh();
    } finally {
      setDrafting(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichResult(null);
    setElapsed(0);
    setEmailsFound(0);

    try {
      const res = await fetch("/api/enrich/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailsFound(data.emails?.length ?? 0);
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
          {enriching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Search className="mr-1 h-3 w-3" />}
          {enriching ? "Enriching..." : "Find Email"}
        </Button>
        <div className="flex">
          <Button
            size="sm"
            className="rounded-r-none"
            onClick={() => handleDraft("openai", "gpt-4.1")}
            disabled={drafting}
          >
            {drafting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
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
                  onClick={() => handleDraft(p.id.replace("-mini", "").replace("-gpt4", ""), p.model)}
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

      {/* Enrichment Progress */}
      {enriching && (
        <div className="w-full max-w-sm animate-in-up">
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium">Searching {ENRICHMENT_SOURCES.length} sources...</span>
              <span className="text-[10px] text-muted-foreground">{elapsed}s</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(95, (elapsed / 20) * 100)}%` }}
              />
            </div>

            {/* Source checklist */}
            <div className="grid grid-cols-2 gap-1">
              {ENRICHMENT_SOURCES.map((source, i) => {
                // Estimate which sources are done based on elapsed time
                const estimatedDone = elapsed > (i + 1) * 3;
                return (
                  <div key={source.key} className="flex items-center gap-1.5">
                    {estimatedDone ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : elapsed > i * 3 ? (
                      <Loader2 className="h-3 w-3 text-primary animate-spin" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground/40" />
                    )}
                    <span className={`text-[10px] ${estimatedDone ? "text-foreground" : "text-muted-foreground"}`}>
                      {source.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Result message */}
      {enrichResult && !enriching && (
        <div className="flex items-center gap-2 animate-in-up">
          <span className="text-xs text-muted-foreground">{enrichResult}</span>
          <button onClick={() => setEnrichResult(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
