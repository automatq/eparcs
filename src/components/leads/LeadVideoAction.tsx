"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Video, Loader2, Copy, ExternalLink } from "lucide-react";

const SCRIPT_TYPES = [
  { value: "cold_intro", label: "Cold Introduction" },
  { value: "follow_up", label: "Follow Up" },
  { value: "case_study", label: "Case Study" },
  { value: "thank_you", label: "Thank You" },
];

export function LeadVideoAction({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [scriptType, setScriptType] = useState("cold_intro");
  const [polling, setPolling] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, scriptType }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        if (data.videoId && data.videoStatus === "processing") {
          pollVideoStatus(data.videoId);
        }
        router.refresh();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function pollVideoStatus(videoId: string) {
    setPolling(true);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      try {
        const res = await fetch(`/api/video/generate?videoId=${videoId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed") {
            setResult((prev: any) => ({ ...prev, videoUrl: data.videoUrl, videoStatus: "completed", thumbnailUrl: data.thumbnailUrl }));
            setPolling(false);
            return;
          }
          if (data.status === "failed") {
            setResult((prev: any) => ({ ...prev, videoStatus: "failed" }));
            setPolling(false);
            return;
          }
        }
      } catch { break; }
    }
    setPolling(false);
  }

  function copyEmailBody() {
    if (!result?.emailBody) return;
    const body = result.emailBody.replace("[VIDEO_URL]", result.videoUrl ?? "[VIDEO_URL]");
    navigator.clipboard.writeText(body);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Video className="h-4 w-4" />
          AI Video Message
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Select value={scriptType} onValueChange={(v) => { if (v) setScriptType(v); }}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
            {generating ? "Generating..." : "Create Video"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3">
            {/* Script preview */}
            <div className="rounded-lg bg-muted p-3">
              <span className="text-xs font-medium text-muted-foreground">Script ({result.estimatedDuration}s)</span>
              <p className="text-sm mt-1">{result.script}</p>
            </div>

            {/* Thumbnail text */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Thumbnail:</span>
              <Badge variant="secondary">{result.thumbnailText}</Badge>
            </div>

            {/* Video status */}
            {result.videoId && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Video:</span>
                {result.videoStatus === "processing" || polling ? (
                  <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Rendering...
                  </Badge>
                ) : result.videoStatus === "completed" ? (
                  <a href={result.videoUrl} target="_blank" rel="noopener noreferrer">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-500 cursor-pointer">
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Watch Video
                    </Badge>
                  </a>
                ) : (
                  <Badge variant="secondary" className="bg-red-500/10 text-red-500">Failed</Badge>
                )}
              </div>
            )}

            {/* Email body with video */}
            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Email (with video)</span>
                <Button size="sm" variant="ghost" onClick={copyEmailBody} className="h-6 px-2">
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <p className="text-sm">{result.emailBody}</p>
            </div>

            {!result.videoId && (
              <p className="text-xs text-muted-foreground">
                Requires HEYGEN_API_KEY in .env. Get one at heygen.com
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
