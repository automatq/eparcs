"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowRight,
  MapPin,
  Globe,
  Star,
  Users,
  Mail,
  ExternalLink,
  Clock,
  Wrench,
  Stethoscope,
  UtensilsCrossed,
  TrendingUp,
  Rocket,
  Megaphone,
  Heart,
  Home,
  ShoppingCart,
  Code,
  Scissors,
  Droplets,
  Activity,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  Wrench, Stethoscope, UtensilsCrossed, TrendingUp, Star: Star,
  Rocket, Megaphone, Heart, Home, ShoppingCart, Code, Scissors,
  Droplets, Activity, Sparkles,
};

interface SearchTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  query: string;
  icon: string;
}

interface SearchResult {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  source: string;
  fitScore?: number;
  fitScoreReason?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  website?: string;
  email?: string;
  emailVerified?: boolean;
}

interface SourceProgress {
  [source: string]: { status: string; found: number };
}

const SOURCE_LABELS: Record<string, string> = {
  gmaps: "Google Maps",
  linkedin: "LinkedIn",
  yelp: "Yelp",
  bbb: "BBB",
  indeed: "Indeed",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchAgentId, setSearchAgentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sourceProgress, setSourceProgress] = useState<SourceProgress>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [templates, setTemplates] = useState<SearchTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches + inline templates
  useEffect(() => {
    setTemplates([
      { id: "hvac", category: "Local Services", name: "HVAC companies with bad reviews", description: "Prime for service improvement", query: "Find HVAC companies with less than 4 stars on Google Maps in [location]", icon: "Wrench" },
      { id: "dentists", category: "Local Services", name: "Dentists without websites", description: "Easy web design upsell", query: "Find dental offices with no website on Google Maps in [location]", icon: "Stethoscope" },
      { id: "restaurants", category: "Local Services", name: "Restaurants needing online ordering", description: "Great reviews but no website", query: "Find restaurants with 50+ reviews but no website in [location]", icon: "UtensilsCrossed" },
      { id: "hiring", category: "Growth Signals", name: "Companies actively hiring", description: "Likely need automation", query: "Find companies posting data entry or customer support jobs in [industry] in [location]", icon: "TrendingUp" },
      { id: "no-tech", category: "Growth Signals", name: "Great reviews, no tech", description: "Haven't invested in technology yet", query: "Find businesses with 4.5+ stars and 100+ reviews but no website in [location]", icon: "Star" },
      { id: "founders", category: "SaaS & Tech", name: "Startup founders", description: "Decision makers at early-stage companies", query: "Find founders and CEOs at startups with 10-50 employees in [industry]", icon: "Rocket" },
      { id: "marketing", category: "Agency", name: "Businesses needing marketing", description: "Mediocre reviews, few customers", query: "Find local businesses with 3-4 star ratings and fewer than 20 reviews in [location]", icon: "Megaphone" },
      { id: "medical", category: "Healthcare", name: "Medical practices needing patients", description: "Low review counts", query: "Find medical offices and clinics with fewer than 30 reviews in [location]", icon: "Heart" },
    ]);
    fetch("/api/search")
      .then((r) => r.json())
      .then(setRecentSearches)
      .catch(() => {});
  }, []);

  // Poll for search progress
  useEffect(() => {
    if (!searchAgentId || status === "completed" || status === "failed") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/search/${searchAgentId}`);
        if (!res.ok) return;
        const data = await res.json();

        setStatus(data.status);
        setSourceProgress(data.sourceProgress ?? {});

        if (data.workspace?.leads) {
          setResults(data.workspace.leads);
        }

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(pollRef.current!);
          setSearching(false);
        }
      } catch {}
    }, 1500); // Poll faster for snappier UX

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [searchAgentId, status]);

  async function startSearch(searchQuery?: string) {
    const q = searchQuery ?? query;
    if (!q.trim()) return;

    setSearching(true);
    setError(null);
    setResults([]);
    setStatus("running");
    setSourceProgress({});

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Search failed");
        setSearching(false);
        return;
      }

      const data = await res.json();
      setSearchAgentId(data.searchAgentId);
      setWorkspaceId(data.workspaceId);

      // Initialize source progress
      const initial: SourceProgress = {};
      for (const source of data.sources) {
        initial[source] = { status: "pending", found: 0 };
      }
      setSourceProgress(initial);
    } catch {
      setError("Failed to start search");
      setSearching(false);
    }
  }

  function useTemplate(template: SearchTemplate) {
    setQuery(template.query);
    inputRef.current?.focus();
  }

  const categories = [...new Set(templates.map((t) => t.category))];
  const filteredTemplates = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  const fitScoreColor = (score?: number) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 85) return "text-emerald-500";
    if (score >= 60) return "text-yellow-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Search</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Describe your ideal customer or use manual scraper
          </p>
        </div>
        <a href="/scraper" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Manual mode →
        </a>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              className="w-full rounded-lg border border-input bg-background pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Describe your ideal customer... e.g. 'Find dentists in Toronto with bad Google reviews'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startSearch();
              }}
              disabled={searching}
            />
          </div>
          <Button
            onClick={() => startSearch()}
            disabled={searching || !query.trim()}
            className="h-[46px] px-6"
          >
            {searching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}
      </div>

      {/* Source Progress (visible during search) */}
      {Object.keys(sourceProgress).length > 0 && (
        <div className="space-y-3">
          {/* Progress bar */}
          {searching && (() => {
            const sources = Object.values(sourceProgress);
            const done = sources.filter((s: any) => s.status === "complete").length;
            const total = sources.length;
            const pct = total > 0 ? (done / total) * 100 : 0;
            return (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{done}/{total} sources complete</span>
                  <span className="text-muted-foreground">
                    {results.length} leads found
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(pct, status === "running" ? 5 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })()}
        <div className="flex flex-wrap gap-3">
          {Object.entries(sourceProgress).map(([source, progress]) => (
            <div
              key={source}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              {progress.status === "searching" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : progress.status === "complete" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : progress.status === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-[13px] font-medium">
                {SOURCE_LABELS[source] ?? source}
              </span>
              {progress.found > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {progress.found}
                </Badge>
              )}
            </div>
          ))}
        </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {results.length} leads found
                </span>
                {status === "completed" && (
                  <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-500">
                    Complete
                  </Badge>
                )}
              </div>
              {workspaceId && (
                <Link
                  href={`/leads?workspace=${workspaceId}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View all in Leads <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Fit</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Rating</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Reviews</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-2 text-[11px] font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        {lead.fitScore != null ? (
                          <span className={`text-sm font-semibold ${fitScoreColor(lead.fitScore)}`}>
                            {lead.fitScore}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div>
                          <span className="text-sm font-medium">{lead.name}</span>
                          {lead.category && (
                            <p className="text-[11px] text-muted-foreground">{lead.category}</p>
                          )}
                          {lead.title && (
                            <p className="text-[11px] text-muted-foreground">
                              {lead.title}{lead.company ? ` at ${lead.company}` : ""}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.location && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {lead.location}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.rating != null && (
                          <span className="text-xs flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            {lead.rating.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.reviewCount != null && (
                          <span className="text-xs text-muted-foreground">
                            {lead.reviewCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {lead.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.email ? (
                          <span className="text-xs flex items-center gap-1">
                            <Mail className="h-3 w-3 text-emerald-500" />
                            {lead.emailVerified && (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Use Case Templates (shown when no search is active) */}
      {!searching && results.length === 0 && (
        <>
          <div>
            <h2 className="text-sm font-medium mb-3">Use case templates</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  !selectedCategory
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => {
                const Icon = ICON_MAP[template.icon] ?? Sparkles;
                return (
                  <button
                    key={template.id}
                    onClick={() => useTemplate(template)}
                    className="group text-left rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-foreground/10 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">{template.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div>
              <h2 className="text-sm font-medium mb-3">Recent searches</h2>
              <div className="space-y-2">
                {recentSearches.slice(0, 5).map((agent: any) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[13px] font-medium">{agent.query}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              agent.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : agent.status === "running"
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {agent.status}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {agent.resultsCount} leads
                          </span>
                          {agent.workspace && (
                            <span className="text-[11px] text-muted-foreground">
                              in {agent.workspace.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setQuery(agent.query);
                          startSearch(agent.query);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Run again
                      </button>
                      {agent.workspaceId && (
                        <Link
                          href={`/leads?workspace=${agent.workspaceId}`}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          View leads <ArrowRight className="inline h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
