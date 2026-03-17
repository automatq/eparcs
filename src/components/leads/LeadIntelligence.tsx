"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Brain,
  Globe,
  Users,
  Zap,
  Target,
  Loader2,
} from "lucide-react";

export function LeadIntelligence({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState<any>(null);
  const [signals, setSignals] = useState<any>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [warmPaths, setWarmPaths] = useState<any>(null);
  const [loadingWarm, setLoadingWarm] = useState(false);
  const [lookalike, setLookalike] = useState<any>(null);
  const [loadingLookalike, setLoadingLookalike] = useState(false);

  async function handleScore(deep = false) {
    setScoring(true);
    try {
      const res = await fetch("/api/leads/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, deep }),
      });
      if (res.ok) setScore(await res.json());
    } finally {
      setScoring(false);
    }
  }

  async function handleSignals() {
    setLoadingSignals(true);
    try {
      const res = await fetch("/api/leads/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (res.ok) setSignals(await res.json());
    } finally {
      setLoadingSignals(false);
    }
  }

  async function handleWarmPaths() {
    setLoadingWarm(true);
    try {
      const res = await fetch("/api/leads/warmpath", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (res.ok) setWarmPaths(await res.json());
    } finally {
      setLoadingWarm(false);
    }
  }

  const tierColors: Record<string, string> = {
    hot: "bg-red-500/10 text-red-500",
    warm: "bg-yellow-500/10 text-yellow-500",
    cold: "bg-blue-500/10 text-blue-500",
    dead: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Intelligence</h2>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => handleScore(false)} disabled={scoring}>
          {scoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BarChart3 className="mr-1 h-3 w-3" />}
          Score Lead
        </Button>
        <Button size="sm" variant="secondary" onClick={() => handleScore(true)} disabled={scoring}>
          {scoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
          Deep Analysis
        </Button>
        <Button size="sm" variant="secondary" onClick={handleSignals} disabled={loadingSignals}>
          {loadingSignals ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Globe className="mr-1 h-3 w-3" />}
          Scan Signals
        </Button>
        <Button size="sm" variant="secondary" onClick={handleWarmPaths} disabled={loadingWarm}>
          {loadingWarm ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Users className="mr-1 h-3 w-3" />}
          Find Warm Path
        </Button>
      </div>

      {/* Score Results */}
      {score && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Lead Score</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{score.score.total}</span>
                <Badge className={tierColors[score.score.tier] ?? ""}>
                  {score.score.tier}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{score.score.reasoning}</p>

            {/* Score breakdown bars */}
            <div className="space-y-2">
              {Object.entries(score.score.breakdown as Record<string, number>).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-28 capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <span className="text-xs w-8 text-right">{value}</span>
                </div>
              ))}
            </div>

            {/* AI Deep Analysis */}
            {score.aiAnalysis && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="flex items-center gap-1">
                  <Brain className="h-3 w-3 text-chart-1" />
                  <span className="text-xs font-semibold">AI Analysis</span>
                </div>
                <p className="text-sm">{score.aiAnalysis.analysis}</p>
                <div className="text-sm">
                  <span className="font-medium">Recommended approach: </span>
                  <span className="text-muted-foreground">{score.aiAnalysis.recommendedApproach}</span>
                </div>
                {score.aiAnalysis.keyPainPoints?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium">Pain points: </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {score.aiAnalysis.keyPainPoints.map((p: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {score.aiAnalysis.objections?.length > 0 && (
                  <div>
                    <span className="text-xs font-medium">Likely objections: </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {score.aiAnalysis.objections.map((o: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-500">{o}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Personalization Signals */}
      {signals && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Personalization Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {signals.bestHook && (
              <div className="rounded-lg bg-chart-1/10 border border-chart-1/20 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="h-3 w-3 text-chart-1" />
                  <span className="text-xs font-semibold text-chart-1">Best Hook</span>
                </div>
                <p className="text-sm">{signals.bestHook}</p>
              </div>
            )}

            {signals.techStack?.length > 0 && (
              <div>
                <span className="text-xs font-medium">Tech Stack</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {signals.techStack.map((t: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {t.technology}
                      {t.automationRelevance && (
                        <span className="ml-1 text-chart-1">*</span>
                      )}
                    </Badge>
                  ))}
                </div>
                {signals.techStack.filter((t: any) => t.automationRelevance).map((t: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground mt-1">
                    * {t.technology}: {t.automationRelevance}
                  </p>
                ))}
              </div>
            )}

            {signals.socialPresence?.length > 0 && (
              <div>
                <span className="text-xs font-medium">Social Presence</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {signals.socialPresence.map((s: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {s.platform}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {signals.websiteInsights && (
              <div>
                <span className="text-xs font-medium">Website Analysis</span>
                <p className="text-xs text-muted-foreground mt-1">{signals.websiteInsights.businessDescription}</p>
                {signals.websiteInsights.automationOpportunities?.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-chart-1">Automation Opportunities:</span>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                      {signals.websiteInsights.automationOpportunities.map((o: string, i: number) => (
                        <li key={i}>• {o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Warm Paths */}
      {warmPaths && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Warm Introduction</CardTitle>
              <Badge variant="secondary" className={
                warmPaths.coldVsWarmRecommendation === "warm_intro" ? "bg-green-500/10 text-green-500" :
                warmPaths.coldVsWarmRecommendation === "warm_reference" ? "bg-yellow-500/10 text-yellow-500" :
                "bg-muted text-muted-foreground"
              }>
                {warmPaths.coldVsWarmRecommendation.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{warmPaths.bestApproach}</p>
            {warmPaths.paths?.map((path: any, i: number) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-[10px]">{path.strength}</Badge>
                  <span className="text-xs font-medium">{path.type.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{path.description}</p>
                {path.introRequestDraft && (
                  <div className="mt-2 rounded bg-muted p-2">
                    <span className="text-[10px] font-medium">Draft intro request:</span>
                    <p className="text-xs mt-1">{path.introRequestDraft}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
