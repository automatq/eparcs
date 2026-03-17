import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AgentConfigForm } from "@/components/leads/AgentConfigForm";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const agent = await db.outreachAgent.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your outreach agent and channel connections
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Agent</CardTitle>
          <CardDescription>
            Configure how AI drafts outreach messages on your behalf
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentConfigForm
            agent={agent ? {
              id: agent.id,
              name: agent.name,
              agencyDescription: agent.agencyDescription,
              targetIndustries: agent.targetIndustries,
              tone: agent.tone,
              differentiators: agent.differentiators,
            } : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channel Connections</CardTitle>
          <CardDescription>
            Connect your outreach channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-sm">Email (Resend)</div>
              <div className="text-xs text-muted-foreground">
                {process.env.RESEND_API_KEY ? "Connected" : "Add RESEND_API_KEY to .env"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-sm">Claude AI (Anthropic)</div>
              <div className="text-xs text-muted-foreground">
                {process.env.ANTHROPIC_API_KEY ? "Connected — Sonnet 4" : "Add ANTHROPIC_API_KEY to .env"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <div className="font-medium text-sm">OpenAI (Codex / GPT-4.1)</div>
              <div className="text-xs text-muted-foreground">
                {process.env.OPENAI_API_KEY ? "Connected — o4-mini, GPT-4.1" : "Add OPENAI_API_KEY to .env"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
