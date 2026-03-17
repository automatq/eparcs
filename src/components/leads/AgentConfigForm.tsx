"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgentConfig {
  id: string;
  name: string;
  agencyDescription: string | null;
  targetIndustries: string | null;
  tone: string;
  differentiators: string | null;
}

export function AgentConfigForm({ agent }: { agent: AgentConfig | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: agent?.name ?? "",
    agencyDescription: agent?.agencyDescription ?? "",
    targetIndustries: agent?.targetIndustries ?? "",
    tone: agent?.tone ?? "professional",
    differentiators: agent?.differentiators ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/agents/config", {
        method: agent ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(agent && { id: agent.id }),
          ...form,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Agent Name</label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., Sales Agent"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Agency Description</label>
        <textarea
          className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.agencyDescription}
          onChange={(e) => setForm({ ...form, agencyDescription: e.target.value })}
          placeholder="Describe your agency and the services you offer..."
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Target Industries</label>
        <Input
          value={form.targetIndustries}
          onChange={(e) => setForm({ ...form, targetIndustries: e.target.value })}
          placeholder="e.g., Real estate, Healthcare, E-commerce"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Tone</label>
        <Select
          value={form.tone}
          onValueChange={(value) => { if (value) setForm({ ...form, tone: value }); }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Key Differentiators</label>
        <textarea
          className="flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.differentiators}
          onChange={(e) => setForm({ ...form, differentiators: e.target.value })}
          placeholder="What makes your agency different?"
        />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : agent ? "Update Agent" : "Create Agent"}
      </Button>
    </form>
  );
}
