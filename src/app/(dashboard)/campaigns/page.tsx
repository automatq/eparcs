"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Linkedin,
  Plus,
  Play,
  Pause,
  Loader2,
  Users,
  UserCheck,
  MessageSquare,
  Reply,
  X,
  ChevronRight,
} from "lucide-react";

const ACTION_TYPES = [
  { value: "visit", label: "Visit Profile", icon: "👀" },
  { value: "connect", label: "Send Connection", icon: "🤝" },
  { value: "message", label: "Send Message", icon: "💬" },
  { value: "inmail", label: "Send InMail", icon: "📧" },
  { value: "endorse", label: "Endorse Skills", icon: "👍" },
  { value: "like", label: "Like Post", icon: "❤️" },
  { value: "follow", label: "Follow Profile", icon: "➕" },
];

interface CampaignStep {
  action: string;
  delayHours: number;
  messageTemplate: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // New campaign form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("free");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [steps, setSteps] = useState<CampaignStep[]>([
    { action: "visit", delayHours: 0, messageTemplate: "" },
    { action: "connect", delayHours: 48, messageTemplate: "Hi _FN_, I came across your profile and thought we should connect. I help businesses like _CN_ automate their operations with AI. Would love to connect!" },
    { action: "message", delayHours: 72, messageTemplate: "Thanks for connecting, _FN_! I noticed _CN_ might benefit from AI automation. Would you be open to a quick 10-minute call this week?" },
    { action: "like", delayHours: 48, messageTemplate: "" },
    { action: "message", delayHours: 120, messageTemplate: "Hi _FN_, just following up. We recently helped a similar business save 20+ hours/week with AI. Happy to share how — any interest?" },
  ]);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/campaign");
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/linkedin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, accountType, dailyLimit, steps }),
      });
      if (res.ok) {
        setShowForm(false);
        setName("");
        fetchCampaigns();
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleCampaign(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await fetch("/api/linkedin/campaign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchCampaigns();
  }

  function addStep() {
    setSteps([...steps, { action: "message", delayHours: 48, messageTemplate: "" }]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: keyof CampaignStep, value: any) {
    setSteps(steps.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">LinkedIn Campaigns</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Automated multi-step LinkedIn outreach sequences
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Campaign
        </Button>
      </div>

      {/* New Campaign Form */}
      {showForm && (
        <Card className="animate-in-up">
          <CardHeader>
            <CardTitle className="text-sm">Create Campaign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Campaign Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Dentists Toronto Q1"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">LinkedIn Account Type</label>
                <Select value={accountType} onValueChange={(v) => { if (v) setAccountType(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free (50/day)</SelectItem>
                    <SelectItem value="premium">Premium (100/day)</SelectItem>
                    <SelectItem value="sales_navigator">Sales Navigator (200/day)</SelectItem>
                    <SelectItem value="recruiter">Recruiter (400/day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Daily Limit</label>
                <Input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(parseInt(e.target.value) || 20)}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <label className="text-[13px] font-medium">Sequence Steps</label>
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1 pt-1.5 text-xs text-muted-foreground min-w-[24px]">
                    {i + 1}.
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Select value={step.action} onValueChange={(v) => { if (v) updateStep(i, "action", v); }}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((a) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.icon} {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Wait</span>
                        <Input
                          type="number"
                          className="w-16"
                          value={step.delayHours}
                          onChange={(e) => updateStep(i, "delayHours", parseInt(e.target.value) || 0)}
                        />
                        <span className="text-xs text-muted-foreground">hrs</span>
                      </div>
                    </div>
                    {["connect", "message", "inmail"].includes(step.action) && (
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={2}
                        placeholder="Message template... Use _FN_ for first name, _CN_ for company"
                        value={step.messageTemplate}
                        onChange={(e) => updateStep(i, "messageTemplate", e.target.value)}
                      />
                    )}
                  </div>
                  <button onClick={() => removeStep(i)} className="text-muted-foreground hover:text-foreground pt-1.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addStep}>
                <Plus className="mr-1 h-3 w-3" /> Add Step
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={createCampaign} disabled={creating || !name}>
                {creating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Linkedin className="mr-1 h-3 w-3" />}
                Create Campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 skeleton" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Linkedin className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No campaigns yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create your first LinkedIn campaign to start automated outreach
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="card-hover">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <Linkedin className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{campaign.name}</span>
                        <Badge
                          variant="secondary"
                          className={
                            campaign.status === "active"
                              ? "bg-green-500/10 text-green-500 text-[10px]"
                              : campaign.status === "paused"
                              ? "bg-yellow-500/10 text-yellow-500 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {campaign.steps.length} steps
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {campaign.accountType} account
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {campaign.dailyLimit}/day limit
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Funnel stats */}
                    {campaign.stats && (
                      <div className="flex items-center gap-3 text-[11px]">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {campaign.stats.total}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                        <div className="flex items-center gap-1 text-blue-500">
                          <UserCheck className="h-3 w-3" />
                          {campaign.stats.connected}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                        <div className="flex items-center gap-1 text-green-500">
                          <MessageSquare className="h-3 w-3" />
                          {campaign.stats.messaged}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                        <div className="flex items-center gap-1 text-emerald-500">
                          <Reply className="h-3 w-3" />
                          {campaign.stats.responded}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => toggleCampaign(campaign.id, campaign.status)}
                    >
                      {campaign.status === "active" ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Step visualization */}
                <div className="flex items-center gap-1 mt-3 overflow-x-auto">
                  {campaign.steps.map((step: any, i: number) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                        <span className="text-[10px]">
                          {ACTION_TYPES.find((a) => a.value === step.action)?.icon ?? "📌"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {ACTION_TYPES.find((a) => a.value === step.action)?.label ?? step.action}
                        </span>
                      </div>
                      {i < campaign.steps.length - 1 && (
                        <span className="text-[9px] text-muted-foreground/50 mx-0.5">
                          {step.delayHours}h →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
