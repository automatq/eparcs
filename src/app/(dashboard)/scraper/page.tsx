"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, MapPin, Linkedin, Loader2, Play, CheckCircle, XCircle, Plus, X } from "lucide-react";

export default function ScraperPage() {
  const [source, setSource] = useState<"gmaps" | "linkedin">("gmaps");
  const [categories, setCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>(["Owner", "CEO", "Founder"]);
  const [maxResults, setMaxResults] = useState(15);
  const [newCategory, setNewCategory] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newTitle, setNewTitle] = useState("");

  // Job tracking
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus?.status === "complete" || jobStatus?.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraper/status?jobId=${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);
          if (data.status === "complete" || data.status === "failed") {
            setRunning(false);
          }
        }
      } catch { /* continue polling */ }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status]);

  async function startScraping() {
    if (categories.length === 0) {
      setError("Add at least one category/industry");
      return;
    }

    setRunning(true);
    setError(null);
    setJobStatus(null);

    try {
      const res = await fetch("/api/scraper/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          categories,
          locations,
          titles: source === "linkedin" ? titles : undefined,
          maxResults,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setJobId(data.jobId);
        setJobStatus({ status: "running", totalFound: 0, totalSaved: 0, errors: [] });
      } else {
        setError(data.error);
        setRunning(false);
      }
    } catch {
      setError("Failed to start scraping");
      setRunning(false);
    }
  }

  function addTag(list: string[], setList: (v: string[]) => void, value: string) {
    if (value.trim() && !list.includes(value.trim())) {
      setList([...list, value.trim()]);
    }
  }

  function removeTag(list: string[], setList: (v: string[]) => void, index: number) {
    setList(list.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scraping Agent</h1>
        <p className="text-sm text-muted-foreground">
          Autonomously find and capture leads from Google Maps and LinkedIn
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configure Scrape</CardTitle>
          <CardDescription>
            Set your target criteria and the agent will find matching leads automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source selector */}
          <div className="flex gap-2">
            <Button
              variant={source === "gmaps" ? "default" : "secondary"}
              size="sm"
              onClick={() => setSource("gmaps")}
            >
              <MapPin className="mr-1 h-3 w-3" />
              Google Maps
            </Button>
            <Button
              variant={source === "linkedin" ? "default" : "secondary"}
              size="sm"
              onClick={() => setSource("linkedin")}
            >
              <Linkedin className="mr-1 h-3 w-3" />
              LinkedIn
            </Button>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {source === "gmaps" ? "Business Categories" : "Industries"}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder={source === "gmaps" ? "e.g., dentist, real estate agent, restaurant" : "e.g., dental, real estate, SaaS"}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(categories, setCategories, newCategory);
                    setNewCategory("");
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { addTag(categories, setCategories, newCategory); setNewCategory(""); }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map((cat, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {cat}
                  <button onClick={() => removeTag(categories, setCategories, i)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Locations */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Locations</label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Toronto, Ontario, New York"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(locations, setLocations, newLocation);
                    setNewLocation("");
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { addTag(locations, setLocations, newLocation); setNewLocation(""); }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {locations.map((loc, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {loc}
                  <button onClick={() => removeTag(locations, setLocations, i)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* LinkedIn-specific: Titles */}
          {source === "linkedin" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Titles</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., CEO, Owner, Director"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(titles, setTitles, newTitle);
                      setNewTitle("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { addTag(titles, setTitles, newTitle); setNewTitle(""); }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {titles.map((t, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => removeTag(titles, setTitles, i)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Max results */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Max Results Per Search</label>
            <Select value={String(maxResults)} onValueChange={(v) => { if (v) setMaxResults(parseInt(v)); }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start button */}
          <Button
            className="w-full"
            onClick={startScraping}
            disabled={running || categories.length === 0}
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Agent Running...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Start Scraping Agent
              </>
            )}
          </Button>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Progress */}
      {jobStatus && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Scrape Progress</CardTitle>
              <Badge
                variant="secondary"
                className={
                  jobStatus.status === "running" ? "bg-yellow-500/10 text-yellow-500" :
                  jobStatus.status === "complete" ? "bg-green-500/10 text-green-500" :
                  "bg-red-500/10 text-red-500"
                }
              >
                {jobStatus.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {jobStatus.status === "complete" && <CheckCircle className="mr-1 h-3 w-3" />}
                {jobStatus.status === "failed" && <XCircle className="mr-1 h-3 w-3" />}
                {jobStatus.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobStatus.query && (
              <div className="text-sm">
                <span className="text-muted-foreground">Current search: </span>
                <span className="font-medium">{jobStatus.query}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-2xl font-bold">{jobStatus.totalFound}</div>
                <div className="text-xs text-muted-foreground">Found</div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <div className="text-2xl font-bold">{jobStatus.totalSaved}</div>
                <div className="text-xs text-muted-foreground">Saved</div>
              </div>
            </div>

            {jobStatus.errors?.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-red-500">Errors:</span>
                {jobStatus.errors.slice(-5).map((err: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">{err}</p>
                ))}
              </div>
            )}

            {jobStatus.status === "complete" && (
              <div className="text-center">
                <a href="/leads" className="text-sm text-primary hover:underline">
                  View {jobStatus.totalSaved} new leads →
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium">Google Maps</div>
                <p className="text-xs text-muted-foreground">
                  Scrapes business listings: name, phone, website, address, rating, reviews. Auto-enriches to find decision maker emails. No login needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Linkedin className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <div className="text-sm font-medium">LinkedIn</div>
                <p className="text-xs text-muted-foreground">
                  Scrapes people search results: name, title, company, location. Requires LINKEDIN_SESSION_COOKIE in .env. Uses careful delays to protect your account.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
