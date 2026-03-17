"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Users,
  Mail,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  Calendar,
  Trophy,
} from "lucide-react";

interface PipelineStage {
  stage: string;
  count: number;
  percentage: number;
}

interface SourceROI {
  source: string;
  totalLeads: number;
  contacted: number;
  replied: number;
  meetings: number;
  won: number;
  replyRate: number;
  meetingRate: number;
  winRate: number;
}

const SOURCE_LABELS: Record<string, string> = {
  gmaps: "Google Maps",
  linkedin: "LinkedIn",
  yelp: "Yelp",
  bbb: "BBB",
  jobboard: "Job Board",
  import: "Import",
  manual: "Manual",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-zinc-500",
  contacted: "bg-blue-500",
  replied: "bg-green-500",
  meeting: "bg-yellow-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 skeleton" />)}
        </div>
        <div className="h-64 skeleton" />
      </div>
    );
  }

  const pipeline = data?.pipeline;
  const sourceROI: SourceROI[] = data?.sourceROI ?? [];
  const outreach = data?.outreach;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Pipeline performance, source ROI, and outreach metrics
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold stat-number">{pipeline?.totalLeads ?? 0}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold stat-number text-emerald-500">
                  {pipeline?.winRate?.toFixed(1) ?? 0}%
                </p>
              </div>
              <Trophy className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Reply Rate</p>
                <p className="text-2xl font-bold stat-number text-blue-500">
                  {outreach?.replyRate?.toFixed(1) ?? 0}%
                </p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Avg Deal Cycle</p>
                <p className="text-2xl font-bold stat-number">
                  {pipeline?.avgDealCycle?.toFixed(0) ?? 0}d
                </p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(pipeline?.stages ?? []).map((stage: PipelineStage) => (
              <div key={stage.stage} className="flex items-center gap-3">
                <span className="text-[11px] font-medium w-20 capitalize">{stage.stage}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${STAGE_COLORS[stage.stage] ?? "bg-primary"} transition-all duration-500`}
                    style={{ width: `${Math.max(stage.percentage, 2)}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold w-12 text-right">{stage.count}</span>
                <span className="text-[10px] text-muted-foreground w-12 text-right">
                  {stage.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          {/* Conversion flow */}
          {(pipeline?.conversions ?? []).length > 0 && (
            <div className="flex items-center gap-2 mt-6 overflow-x-auto">
              {(pipeline?.conversions ?? []).map((conv: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground capitalize">{conv.from}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                    <Badge variant="secondary" className="text-[10px]">
                      {conv.rate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source ROI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Source ROI</CardTitle>
        </CardHeader>
        <CardContent>
          {sourceROI.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No lead data yet. Start scraping to see source performance.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground">Source</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Leads</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Contacted</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Replied</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Meetings</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Won</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Reply %</th>
                    <th className="pb-2 text-[11px] font-medium text-muted-foreground text-right">Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceROI.map((source) => (
                    <tr key={source.source} className="border-b border-border last:border-0">
                      <td className="py-2.5 text-[13px] font-medium">
                        {SOURCE_LABELS[source.source] ?? source.source}
                      </td>
                      <td className="py-2.5 text-[13px] text-right">{source.totalLeads}</td>
                      <td className="py-2.5 text-[13px] text-right text-blue-500">{source.contacted}</td>
                      <td className="py-2.5 text-[13px] text-right text-green-500">{source.replied}</td>
                      <td className="py-2.5 text-[13px] text-right text-yellow-500">{source.meetings}</td>
                      <td className="py-2.5 text-[13px] text-right text-emerald-500 font-semibold">{source.won}</td>
                      <td className="py-2.5 text-[13px] text-right">
                        <Badge variant="secondary" className="text-[10px]">
                          {source.replyRate.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="py-2.5 text-[13px] text-right">
                        <Badge variant="secondary" className={`text-[10px] ${source.winRate > 0 ? "bg-emerald-500/10 text-emerald-500" : ""}`}>
                          {source.winRate.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outreach Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outreach Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{outreach?.sent ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Sent</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{outreach?.opened ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Opened</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-green-500">{outreach?.replied ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Replied</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-blue-500">{outreach?.replyRate?.toFixed(1) ?? 0}%</p>
              <p className="text-[11px] text-muted-foreground">Reply Rate</p>
            </div>
          </div>

          {(outreach?.byChannel ?? []).length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">By Channel</p>
              {outreach.byChannel.map((ch: any) => (
                <div key={ch.channel} className="flex items-center justify-between text-[13px]">
                  <span className="capitalize">{ch.channel}</span>
                  <span>
                    {ch.sent} sent, {ch.replied} replied
                    {ch.sent > 0 && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        {((ch.replied / ch.sent) * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
