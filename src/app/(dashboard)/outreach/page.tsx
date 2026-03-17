import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function OutreachPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const messages = await db.outreachMessage.findMany({
    where: { ownerId: userId },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const drafts = messages.filter((m) => m.status === "draft");
  const sent = messages.filter((m) => m.status === "sent");
  const replied = messages.filter((m) => m.status === "replied");

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
                No messages yet
              </TableCell>
            </TableRow>
          ) : (
            items.map((msg) => (
              <TableRow key={msg.id}>
                <TableCell className="font-medium">{msg.lead.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{msg.channel}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                  {msg.subject ?? msg.content.slice(0, 60)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusStyle[msg.status] ?? ""}>
                    {msg.status}
                  </Badge>
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
          {messages.length} messages total
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

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
          <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="drafts">
          <div className="rounded-xl border border-border">
            <MessageTable items={drafts} />
          </div>
        </TabsContent>
        <TabsContent value="sent">
          <div className="rounded-xl border border-border">
            <MessageTable items={sent} />
          </div>
        </TabsContent>
        <TabsContent value="all">
          <div className="rounded-xl border border-border">
            <MessageTable items={messages} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
