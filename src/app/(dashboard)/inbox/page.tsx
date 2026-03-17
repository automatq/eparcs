"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Inbox,
  Mail,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Send,
  Loader2,
  ArrowRight,
  User,
} from "lucide-react";

interface InboxItem {
  id: string;
  lead: {
    id: string;
    name: string;
    title: string | null;
    company: string | null;
    pipelineStage: string;
  };
  channel: string;
  subject: string | null;
  content: string;
  repliedAt: string | null;
  classification: {
    category: string;
    sentiment: string;
    summary: string | null;
    objectionType: string | null;
  } | null;
  suggestedFollowUp: {
    id: string;
    subject: string | null;
    content: string;
  } | null;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  interested: { label: "Interested", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-500" },
  objection: { label: "Objection", icon: AlertTriangle, color: "bg-yellow-500/10 text-yellow-500" },
  not_interested: { label: "Not Interested", icon: XCircle, color: "bg-red-500/10 text-red-500" },
  out_of_office: { label: "Out of Office", icon: Mail, color: "bg-blue-500/10 text-blue-500" },
  question: { label: "Question", icon: MessageSquare, color: "bg-purple-500/10 text-purple-500" },
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/inbox")
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? items.filter((item) => item.classification?.category === filter)
    : items;

  const counts = {
    all: items.length,
    interested: items.filter((i) => i.classification?.category === "interested").length,
    objection: items.filter((i) => i.classification?.category === "objection").length,
    not_interested: items.filter((i) => i.classification?.category === "not_interested").length,
  };

  async function approveFollowUp(messageId: string) {
    setSendingFollowUp(messageId);
    try {
      await fetch(`/api/outreach/${messageId}/approve`, { method: "POST" });
      setItems((prev) =>
        prev.map((item) =>
          item.suggestedFollowUp?.id === messageId
            ? { ...item, suggestedFollowUp: null }
            : item
        )
      );
    } finally {
      setSendingFollowUp(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          All replies across channels with AI classification
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <Button variant={!filter ? "default" : "secondary"} size="sm" onClick={() => setFilter(null)}>
          All ({counts.all})
        </Button>
        <Button
          variant={filter === "interested" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("interested")}
        >
          <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />
          Interested ({counts.interested})
        </Button>
        <Button
          variant={filter === "objection" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("objection")}
        >
          <AlertTriangle className="mr-1 h-3 w-3 text-yellow-500" />
          Objections ({counts.objection})
        </Button>
        <Button
          variant={filter === "not_interested" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("not_interested")}
        >
          <XCircle className="mr-1 h-3 w-3 text-red-500" />
          Not Interested ({counts.not_interested})
        </Button>
      </div>

      {/* Reply list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No replies yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Replies will appear here when leads respond to your outreach
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const catConfig = CATEGORY_CONFIG[item.classification?.category ?? ""] ?? CATEGORY_CONFIG.question;
            const CatIcon = catConfig?.icon ?? MessageSquare;
            const expanded = expandedId === item.id;

            return (
              <Card key={item.id} className="card-hover">
                <CardContent className="p-4">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${catConfig?.color ?? "bg-muted"}`}>
                      <CatIcon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/leads/${item.lead.id}`}
                          className="text-sm font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.lead.name}
                        </Link>
                        {item.classification && (
                          <Badge variant="secondary" className={`text-[10px] ${catConfig?.color ?? ""}`}>
                            {catConfig?.label ?? item.classification.category}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          {item.channel}
                        </Badge>
                      </div>

                      {item.lead.title && (
                        <p className="text-[11px] text-muted-foreground">
                          {item.lead.title}{item.lead.company ? ` at ${item.lead.company}` : ""}
                        </p>
                      )}

                      {item.classification?.summary && (
                        <p className="text-[12px] text-muted-foreground mt-1">
                          {item.classification.summary}
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {item.repliedAt ? new Date(item.repliedAt).toLocaleDateString() : ""}
                    </span>
                  </div>

                  {/* Expanded view */}
                  {expanded && (
                    <div className="mt-4 space-y-3 animate-in-up">
                      {/* Reply content */}
                      <div className="rounded-lg bg-muted p-3">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Their reply:</p>
                        <p className="text-[13px] whitespace-pre-wrap">{item.content}</p>
                      </div>

                      {/* Suggested follow-up */}
                      {item.suggestedFollowUp && (
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-[11px] font-medium text-muted-foreground mb-1">
                            AI-suggested follow-up:
                          </p>
                          {item.suggestedFollowUp.subject && (
                            <p className="text-[12px] font-medium">
                              Subject: {item.suggestedFollowUp.subject}
                            </p>
                          )}
                          <p className="text-[13px] whitespace-pre-wrap mt-1">
                            {item.suggestedFollowUp.content}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              className="h-7"
                              onClick={() => approveFollowUp(item.suggestedFollowUp!.id)}
                              disabled={sendingFollowUp === item.suggestedFollowUp.id}
                            >
                              {sendingFollowUp === item.suggestedFollowUp.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-3 w-3" />
                              )}
                              Approve & Send
                            </Button>
                            <Link href={`/leads/${item.lead.id}`}>
                              <Button variant="secondary" size="sm" className="h-7">
                                View Lead <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
