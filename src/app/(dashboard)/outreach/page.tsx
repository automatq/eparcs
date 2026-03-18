import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const defaultTab = params.tab ?? "inbox";

  const messages = await db.outreachMessage.findMany({
    where: { ownerId: userId },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const drafts = messages.filter((m) => m.status === "draft");
  const sent = messages.filter((m) => ["sent", "queued", "approved"].includes(m.status));
  const replied = messages.filter((m) => m.status === "replied");

  // Campaign data
  const campaigns = await db.linkedInCampaign.findMany({
    where: { ownerId: userId },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { prospects: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusStyle: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    approved: "bg-blue-500/10 text-blue-500",
    queued: "bg-yellow-500/10 text-yellow-500",
    sent: "bg-green-500/10 text-green-500",
    replied: "bg-emerald-500/10 text-emerald-500",
    failed: "bg-red-500/10 text-red-500",
  };

  function MessageTable({ items }: { items: typeof messages }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Subject/Preview</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No messages
              </TableCell>
            </TableRow>
          ) : (
            items.map((msg) => (
              <TableRow key={msg.id}>
                <TableCell>
                  <Link href={`/leads/${msg.lead.id}`} className="font-medium hover:underline">
                    {msg.lead.name}
                  </Link>
                </TableCell>
                <TableCell><Badge variant="secondary">{msg.channel}</Badge></TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                  {msg.subject ?? msg.content.slice(0, 60)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusStyle[msg.status] ?? ""}>{msg.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Outreach</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Messages, replies, and campaigns in one place
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Drafts</p>
          <p className="text-2xl font-semibold mt-1 stat-number">{drafts.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sent</p>
          <p className="text-2xl font-semibold mt-1 stat-number">{sent.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Replied</p>
          <p className="text-2xl font-semibold mt-1 stat-number text-emerald-500">{replied.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Response Rate</p>
          <p className="text-2xl font-semibold mt-1 stat-number">
            {sent.length > 0 ? Math.round((replied.length / sent.length) * 100) : 0}%
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox ({replied.length})</TabsTrigger>
          <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns ({campaigns.length})</TabsTrigger>
        </TabsList>

        {/* Inbox tab — replies */}
        <TabsContent value="inbox">
          <div className="rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Reply Preview</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {replied.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No replies yet. Send outreach to start getting responses.
                    </TableCell>
                  </TableRow>
                ) : (
                  replied.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <Link href={`/leads/${msg.lead.id}`} className="font-medium hover:underline">
                          {msg.lead.name}
                        </Link>
                        {msg.lead.company && (
                          <p className="text-xs text-muted-foreground">{msg.lead.company}</p>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{msg.channel}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {msg.content.slice(0, 80)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {msg.repliedAt ? new Date(msg.repliedAt).toLocaleDateString() : ""}
                      </TableCell>
                      <TableCell>
                        <Link href={`/leads/${msg.lead.id}`} className="text-xs text-primary hover:underline">
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Drafts tab */}
        <TabsContent value="drafts">
          <div className="rounded-xl border border-border">
            <MessageTable items={drafts} />
          </div>
        </TabsContent>

        {/* Sent tab */}
        <TabsContent value="sent">
          <div className="rounded-xl border border-border">
            <MessageTable items={sent} />
          </div>
        </TabsContent>

        {/* Campaigns tab */}
        <TabsContent value="campaigns">
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <p className="text-sm font-medium">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                LinkedIn campaigns will appear here once created
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{campaign.name}</span>
                      <Badge
                        variant="secondary"
                        className={`ml-2 text-[10px] ${
                          campaign.status === "active"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-yellow-500/10 text-yellow-500"
                        }`}
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {campaign._count.prospects} prospects &middot; {campaign.steps.length} steps
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                    {campaign.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {step.action}
                        </span>
                        {i < campaign.steps.length - 1 && (
                          <span className="text-[9px] text-muted-foreground/50">{step.delayHours}h →</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
