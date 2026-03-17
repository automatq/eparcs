"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Linkedin, MapPin, Briefcase, Mail, ExternalLink, Star as StarIcon, FolderOpen } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  source: string;
  leadType: string;
  pipelineStage: string;
  fitScore: number | null;
  fitScoreReason: string | null;
  createdAt: string;
  emails: { email: string; verified: boolean }[];
  businessProfile: {
    category: string | null;
    rating: number | null;
    reviewCount: number | null;
  } | null;
  automationSignals: {
    jobTitle: string | null;
    signalStrength: string;
  }[];
  outreachMessages: { status: string }[];
}

const sourceConfig: Record<string, { label: string; icon: any; className: string }> = {
  linkedin: { label: "LinkedIn", icon: Linkedin, className: "bg-blue-500/10 text-blue-500" },
  gmaps: { label: "Google Maps", icon: MapPin, className: "bg-green-500/10 text-green-500" },
  yelp: { label: "Yelp", icon: StarIcon, className: "bg-red-500/10 text-red-500" },
  bbb: { label: "BBB", icon: Briefcase, className: "bg-orange-500/10 text-orange-500" },
  jobboard: { label: "Job Board", icon: Briefcase, className: "bg-purple-500/10 text-purple-500" },
  manual: { label: "Manual", icon: Mail, className: "bg-muted text-muted-foreground" },
  import: { label: "Import", icon: Mail, className: "bg-muted text-muted-foreground" },
};

const stageConfig: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  contacted: "bg-blue-500/10 text-blue-500",
  replied: "bg-green-500/10 text-green-500",
  meeting: "bg-yellow-500/10 text-yellow-500",
  won: "bg-emerald-500/10 text-emerald-500",
  lost: "bg-red-500/10 text-red-500",
};

function fitScoreColor(score: number | null): string {
  if (score == null) return "";
  if (score >= 85) return "text-emerald-500 bg-emerald-500/10";
  if (score >= 60) return "text-yellow-500 bg-yellow-500/10";
  if (score >= 30) return "text-orange-500 bg-orange-500/10";
  return "text-muted-foreground bg-muted";
}

export function LeadTable({
  leads,
  total,
  page,
  limit,
  counts,
  filters,
  workspaces = [],
}: {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; linkedin: number; gmaps: number; jobboard: number; yelp?: number };
  filters: { source?: string; stage?: string; search?: string; workspace?: string };
  workspaces?: { id: string; name: string; leadCount: number }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(filters.search ?? "");

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateFilter("search", searchQuery || null);
  }

  const hasFitScores = leads.some((l) => l.fitScore != null);

  return (
    <div className="space-y-4">
      {/* Workspace selector + Source filter tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={!filters.source ? "default" : "secondary"}
            size="sm"
            onClick={() => updateFilter("source", null)}
          >
            All ({counts.all})
          </Button>
          <Button
            variant={filters.source === "linkedin" ? "default" : "secondary"}
            size="sm"
            onClick={() => updateFilter("source", "linkedin")}
          >
            <Linkedin className="mr-1 h-3 w-3" />
            LinkedIn ({counts.linkedin})
          </Button>
          <Button
            variant={filters.source === "gmaps" ? "default" : "secondary"}
            size="sm"
            onClick={() => updateFilter("source", "gmaps")}
          >
            <MapPin className="mr-1 h-3 w-3" />
            Maps ({counts.gmaps})
          </Button>
          {(counts.yelp ?? 0) > 0 && (
            <Button
              variant={filters.source === "yelp" ? "default" : "secondary"}
              size="sm"
              onClick={() => updateFilter("source", "yelp")}
            >
              <StarIcon className="mr-1 h-3 w-3" />
              Yelp ({counts.yelp})
            </Button>
          )}
          <Button
            variant={filters.source === "jobboard" ? "default" : "secondary"}
            size="sm"
            onClick={() => updateFilter("source", "jobboard")}
          >
            <Briefcase className="mr-1 h-3 w-3" />
            Jobs ({counts.jobboard})
          </Button>
        </div>

        {/* Workspace selector */}
        {workspaces.length > 0 && (
          <Select
            value={filters.workspace ?? "all"}
            onValueChange={(v) => updateFilter("workspace", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-48 h-8 text-xs">
              <FolderOpen className="mr-1.5 h-3 w-3" />
              <SelectValue placeholder="All Leads" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name} ({ws.leadCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search leads by name, company, or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
      </form>

      {/* Table */}
      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {hasFitScores && <TableHead className="w-14">Fit</TableHead>}
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={hasFitScores ? 7 : 6} className="h-32 text-center text-muted-foreground">
                  No leads found. Use AI Search or the Scraper to capture leads.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const source = sourceConfig[lead.source] ?? sourceConfig.manual;
                const SourceIcon = source.icon;
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/leads/${lead.id}`)}
                  >
                    {hasFitScores && (
                      <TableCell>
                        {lead.fitScore != null ? (
                          <Badge
                            variant="secondary"
                            className={`text-[11px] font-semibold ${fitScoreColor(lead.fitScore)}`}
                          >
                            {lead.fitScore}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">--</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div>
                        <div className="font-medium">{lead.name}</div>
                        {lead.title && (
                          <div className="text-xs text-muted-foreground">
                            {lead.title}
                          </div>
                        )}
                        {lead.company && (
                          <div className="text-xs text-muted-foreground">
                            {lead.company}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={source.className}>
                        <SourceIcon className="mr-1 h-3 w-3" />
                        {source.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lead.businessProfile?.category && (
                        <div>{lead.businessProfile.category}</div>
                      )}
                      {lead.businessProfile?.rating && (
                        <div>
                          {lead.businessProfile.rating}/5 ({lead.businessProfile.reviewCount} reviews)
                        </div>
                      )}
                      {lead.automationSignals[0] && (
                        <div>
                          Signal: {lead.automationSignals[0].signalStrength} —{" "}
                          {lead.automationSignals[0].jobTitle}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={stageConfig[lead.pipelineStage] ?? ""}
                      >
                        {lead.pipelineStage}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.emails[0] ? (
                        <span className="text-xs">{lead.emails[0].email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No email</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateFilter("page", String(page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page * limit >= total}
              onClick={() => updateFilter("page", String(page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
