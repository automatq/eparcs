import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { enrichLead } from "@/lib/enrichment";

export async function GET(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const pipelineStage = searchParams.get("stage");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const where: any = { ownerId: userId };
  if (source) where.source = source;
  if (pipelineStage) where.pipelineStage = pipelineStage;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        emails: true,
        businessProfile: true,
        automationSignals: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.lead.count({ where }),
  ]);

  return NextResponse.json({ leads, total, page, limit });
}

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();

  const leadData: any = {
    name: body.name ?? body.company ?? "Unknown",
    title: body.title ?? null,
    company: body.company ?? null,
    industry: body.industry ?? null,
    location: body.location ?? null,
    linkedinUrl: body.linkedinUrl ?? null,
    source: body.source ?? "manual",
    leadType: body.leadType ?? "person",
    pipelineStage: "new",
    enrichmentStatus: "pending",
    ownerId: userId,
  };

  // Check for duplicate
  if (body.linkedinUrl) {
    const existing = await db.lead.findFirst({
      where: { linkedinUrl: body.linkedinUrl, ownerId: userId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Lead already exists", lead: existing },
        { status: 409 }
      );
    }
  }

  // Check for duplicate by name for gmaps leads
  if (body.source === "gmaps" && body.googleMapsUrl) {
    const existing = await db.lead.findFirst({
      where: {
        ownerId: userId,
        businessProfile: { googleMapsUrl: body.googleMapsUrl },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Lead already exists", lead: existing },
        { status: 409 }
      );
    }
  }

  const lead = await db.lead.create({ data: leadData });

  // Create business profile for Google Maps leads
  if (body.source === "gmaps") {
    await db.businessProfile.create({
      data: {
        leadId: lead.id,
        phone: body.phone ?? null,
        website: body.website ?? null,
        address: body.address ?? null,
        rating: body.rating ?? null,
        reviewCount: body.reviewCount ?? null,
        category: body.category ?? null,
        googleMapsUrl: body.googleMapsUrl ?? null,
      },
    });

    // Also save the Maps phone number to LeadPhone immediately
    if (body.phone) {
      await db.leadPhone.create({
        data: {
          leadId: lead.id,
          phone: body.phone,
          source: "google-maps",
          type: "main",
        },
      });
    }
  }

  // Create automation signal for job board leads
  if (body.source === "jobboard" && body.signalType) {
    await db.automationSignal.create({
      data: {
        leadId: lead.id,
        jobTitle: body.jobTitle ?? null,
        jobDescription: body.jobDescription ?? null,
        jobUrl: body.jobUrl ?? null,
        signalType: body.signalType,
        signalStrength: body.signalStrength ?? "medium",
      },
    });
  }

  // Re-fetch with relations for the response
  const fullLead = await db.lead.findUnique({
    where: { id: lead.id },
    include: {
      emails: true,
      phones: true,
      businessProfile: true,
      automationSignals: true,
    },
  });

  // ── Auto-enrich in the background (fire-and-forget) ──
  // This runs AFTER the response is sent so the save feels instant
  const website = body.website ?? null;
  const companyDomain = body.companyDomain ?? (website ? website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null);

  if (website || body.company || companyDomain) {
    runBackgroundEnrichment(lead.id, {
      name: leadData.name,
      company: body.company ?? body.name ?? null,
      companyDomain,
      website,
      linkedinUrl: body.linkedinUrl ?? null,
      category: body.category ?? null,
      rating: body.rating ?? null,
      reviewCount: body.reviewCount ?? null,
      location: body.location ?? null,
    }).catch(() => {
      // Background enrichment failed silently — user can retry manually
      db.lead.update({
        where: { id: lead.id },
        data: { enrichmentStatus: "failed" },
      }).catch(() => {});
    });
  } else {
    // No website or company info to enrich from
    await db.lead.update({
      where: { id: lead.id },
      data: { enrichmentStatus: "none" },
    });
  }

  return NextResponse.json(fullLead, { status: 201 });
}

/**
 * Run enrichment in the background after lead save.
 * Finds emails, phones, and decision makers automatically.
 */
async function runBackgroundEnrichment(
  leadId: string,
  input: {
    name: string;
    company: string | null;
    companyDomain: string | null;
    website: string | null;
    linkedinUrl: string | null;
    category?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    location?: string | null;
  }
) {
  try {
    const results = await enrichLead(input);

    // Save emails
    for (const result of results.emails) {
      try {
        await db.leadEmail.create({
          data: {
            leadId,
            email: result.email,
            source: result.source,
            confidence: result.confidence,
            verified: result.verified,
            verifiedAt: result.verified ? new Date() : null,
            personName: result.personName,
            personTitle: result.personTitle,
          },
        });
      } catch { /* skip duplicates */ }
    }

    // Save phones
    const existingPhones = await db.leadPhone.findMany({ where: { leadId } });
    const existingNormalized = new Set(existingPhones.map((p) => p.phone.replace(/\D/g, "")));

    for (const phone of results.phones) {
      const normalized = phone.phone.replace(/\D/g, "");
      if (!existingNormalized.has(normalized)) {
        try {
          await db.leadPhone.create({
            data: {
              leadId,
              phone: phone.phone,
              source: phone.source,
              type: phone.type,
              personName: phone.personName,
            },
          });
        } catch { /* skip duplicates */ }
      }
    }

    // Update domain if found
    if (results.emails[0]) {
      const domain = results.emails[0].email.split("@")[1];
      if (domain) {
        await db.lead.update({
          where: { id: leadId },
          data: { companyDomain: domain },
        });
      }
    }

    // Save company profile
    if (results.company) {
      const cp = results.company;
      try {
        await db.companyProfile.upsert({
          where: { leadId },
          create: {
            leadId,
            companyName: cp.companyName,
            domain: cp.domain,
            employeeCount: cp.employeeCount,
            employeeRange: cp.employeeRange,
            estimatedRevenue: cp.estimatedRevenue,
            revenueConfidence: cp.revenueConfidence,
            foundedYear: cp.foundedYear,
            industry: cp.industry,
            linkedinUrl: cp.linkedinUrl,
            twitterUrl: cp.twitterUrl,
            facebookUrl: cp.facebookUrl,
            jobPostingCount: cp.hiringSignals.jobPostingCount,
            hiringSignals: cp.hiringSignals.signals as any,
            recentNews: cp.recentNews as any,
            techStack: cp.techStack as any,
          },
          update: {
            employeeCount: cp.employeeCount,
            estimatedRevenue: cp.estimatedRevenue,
            foundedYear: cp.foundedYear,
            industry: cp.industry,
            jobPostingCount: cp.hiringSignals.jobPostingCount,
            hiringSignals: cp.hiringSignals.signals as any,
            recentNews: cp.recentNews as any,
            techStack: cp.techStack as any,
            enrichedAt: new Date(),
          },
        });
      } catch { /* continue */ }
    }

    await db.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: "complete" },
    });
  } catch {
    await db.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: "failed" },
    }).catch(() => {});
  }
}
