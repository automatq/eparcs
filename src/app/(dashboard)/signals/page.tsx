"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Zap,
  TrendingUp,
  Star,
  Code,
  DollarSign,
  Globe,
  Briefcase,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface Signal {
  id: string;
  leadId: string | null;
  signalType: string;
  title: string;
  description: string;
  severity: string;
  data: any;
  triggered: boolean;
  detectedAt: string;
}

const SIGNAL_CONFIG: Record<string, { icon: any; color: string }> = {
  review_drop: { icon: Star, color: "bg-yellow-500/10 text-yellow-500" },
  hiring_surge: { icon: Briefcase, color: "bg-blue-500/10 text-blue-500" },
  tech_gap: { icon: Code, color: "bg-purple-500/10 text-purple-500" },
  funding_round: { icon: DollarSign, color: "bg-emerald-500/10 text-emerald-500" },
  job_change: { icon: TrendingUp, color: "bg-orange-500/10 text-orange-500" },
  website_visit: { icon: Globe, color: "bg-cyan-500/10 text-cyan-500" },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500",
  high: "bg-orange-500/10 text-orange-500",
  medium: "bg-yellow-500/10 text-yellow-500",
  low: "bg-muted text-muted-foreground",
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [counts, setCounts] = useState({ total: 0, critical: 0, high: 0, medium: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchSignals();
  }, []);

  async function fetchSignals() {
    setLoading(true);
    try {
      const res = await fetch("/api/signals");
      const data = await res.json();
      setSignals(data.signals ?? []);
      setCounts(data.counts ?? { total: 0, critical: 0, high: 0, medium: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      await fetch("/api/signals", { method: "POST" });
      await fetchSignals();
    } finally {
      setScanning(false);
    }
  }

  async function dismiss(signalId: string) {
    await fetch("/api/signals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signalId }),
    });
    setSignals((prev) => prev.filter((s) => s.id !== signalId));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Intent Signals</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Buying signals detected across your leads
          </p>
        </div>
        <Button size="sm" onClick={runScan} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Scan Now
        </Button>
      </div>

      {/* Signal counts */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold">{counts.total}</p>
              <p className="text-[10px] text-muted-foreground">Total Signals</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <Zap className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-red-500">{counts.critical}</p>
              <p className="text-[10px] text-muted-foreground">Critical</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
              <Zap className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-orange-500">{counts.high}</p>
              <p className="text-[10px] text-muted-foreground">High</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10">
              <Zap className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-500">{counts.medium}</p>
              <p className="text-[10px] text-muted-foreground">Medium</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signal feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 skeleton" />)}
        </div>
      ) : signals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No signals detected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Scan Now" to check your leads for buying signals
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => {
            const config = SIGNAL_CONFIG[signal.signalType] ?? { icon: Zap, color: "bg-muted" };
            const Icon = config.icon;

            return (
              <Card key={signal.id} className="card-hover">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{signal.title}</span>
                        <Badge variant="secondary" className={`text-[10px] ${SEVERITY_COLORS[signal.severity] ?? ""}`}>
                          {signal.severity}
                        </Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {signal.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(signal.detectedAt).toLocaleDateString()}
                        </span>
                        {signal.leadId && (
                          <Link
                            href={`/leads/${signal.leadId}`}
                            className="text-[10px] text-primary hover:underline"
                          >
                            View lead
                          </Link>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => dismiss(signal.id)}
                      className="text-muted-foreground hover:text-foreground p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
