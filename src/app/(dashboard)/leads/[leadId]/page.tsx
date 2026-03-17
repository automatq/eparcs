import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LeadActions } from "@/components/leads/LeadActions";
import { LeadIntelligence } from "@/components/leads/LeadIntelligence";
import { LeadCallActions } from "@/components/leads/LeadCallActions";
import { LeadVideoAction } from "@/components/leads/LeadVideoAction";
import {
  Linkedin,
  MapPin,
  Briefcase,
  Mail,
  Phone,
  Globe,
  Star,
  MessageSquare,
} from "lucide-react";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { leadId } = await params;

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      automationSignals: true,
      outreachMessages: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!lead) notFound();

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-in">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
            <Badge variant="secondary" className="text-[11px]">
              {lead.source === "linkedin" && <Linkedin className="mr-1 h-3 w-3" />}
              {lead.source === "gmaps" && <MapPin className="mr-1 h-3 w-3" />}
              {lead.source === "jobboard" && <Briefcase className="mr-1 h-3 w-3" />}
              {lead.source}
            </Badge>
            <Badge variant="secondary" className="text-[11px]">{lead.pipelineStage}</Badge>
            {lead.enrichmentStatus === "pending" && (
              <Badge variant="secondary" className="text-[11px] bg-yellow-500/10 text-yellow-500 badge-live">
                Enriching...
              </Badge>
            )}
          </div>
          {lead.title && (
            <p className="text-[13px] text-muted-foreground">{lead.title}</p>
          )}
          {lead.company && (
            <p className="text-[13px] text-muted-foreground">{lead.company}</p>
          )}
        </div>
        <LeadActions leadId={lead.id} />
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.emails.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{e.email}</span>
                {e.verified && (
                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-500">
                    Verified
                  </Badge>
                )}
              </div>
            ))}
            {lead.phones.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{p.phone}</span>
              </div>
            ))}
            {lead.linkedinUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Linkedin className="h-4 w-4 text-muted-foreground" />
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  LinkedIn Profile
                </a>
              </div>
            )}
            {lead.emails.length === 0 && lead.phones.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No contact info yet. Enrich this lead to find their email.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Business Profile (for Google Maps leads) */}
        {lead.businessProfile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.businessProfile.category && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Category: </span>
                  {lead.businessProfile.category}
                </div>
              )}
              {lead.businessProfile.rating && (
                <div className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 text-yellow-500" />
                  {lead.businessProfile.rating}/5 ({lead.businessProfile.reviewCount} reviews)
                </div>
              )}
              {lead.businessProfile.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={lead.businessProfile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    {lead.businessProfile.website}
                  </a>
                </div>
              )}
              {lead.businessProfile.address && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {lead.businessProfile.address}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Automation Signals (for Job Board leads) */}
        {lead.automationSignals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Automation Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lead.automationSignals.map((signal) => (
                <div key={signal.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{signal.jobTitle}</span>
                    <Badge
                      variant="secondary"
                      className={
                        signal.signalStrength === "high"
                          ? "bg-red-500/10 text-red-500"
                          : signal.signalStrength === "medium"
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-green-500/10 text-green-500"
                      }
                    >
                      {signal.signalStrength}
                    </Badge>
                  </div>
                  {signal.jobDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {signal.jobDescription}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* AI Voice Call */}
        <LeadCallActions
        leadId={lead.id}
        phoneNumber={lead.phones[0]?.phone ?? lead.businessProfile?.phone ?? null}
      />

        {/* AI Video Message */}
        <LeadVideoAction leadId={lead.id} />
      </div>

      {/* AI Intelligence */}
      <LeadIntelligence leadId={lead.id} />

      {/* Outreach History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outreach History</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.outreachMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outreach yet. Draft a message to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {lead.outreachMessages.map((msg) => (
                <div key={msg.id} className="border-l-2 border-border pl-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {msg.channel} — {msg.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {msg.subject && (
                    <p className="mt-1 text-sm font-medium">{msg.subject}</p>
                  )}
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
