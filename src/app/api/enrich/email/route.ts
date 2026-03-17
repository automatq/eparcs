import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { enrichLead } from "@/lib/enrichment";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { leadId } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, ownerId: userId },
    include: { businessProfile: true, emails: true, phones: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Mark enrichment as pending
  await db.lead.update({
    where: { id: leadId },
    data: { enrichmentStatus: "pending" },
  });

  try {
    // Run full enrichment (waterfall + company intelligence)
    const results = await enrichLead({
      name: lead.name,
      company: lead.company,
      companyDomain: lead.companyDomain,
      website: lead.businessProfile?.website,
      linkedinUrl: lead.linkedinUrl,
      category: lead.businessProfile?.category,
      rating: lead.businessProfile?.rating,
      reviewCount: lead.businessProfile?.reviewCount,
      location: lead.location,
    });

    // Save discovered emails (skip duplicates)
    const existingEmails = new Set(lead.emails.map((e) => e.email.toLowerCase()));
    let newEmailCount = 0;

    for (const result of results.emails) {
      if (!existingEmails.has(result.email.toLowerCase())) {
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
        existingEmails.add(result.email.toLowerCase());
        newEmailCount++;
      }
    }

    // Save discovered phones (skip duplicates)
    const existingPhones = new Set(lead.phones.map((p) => p.phone.replace(/\D/g, "")));
    let newPhoneCount = 0;

    for (const phone of results.phones) {
      const normalized = phone.phone.replace(/\D/g, "");
      if (!existingPhones.has(normalized)) {
        await db.leadPhone.create({
          data: {
            leadId,
            phone: phone.phone,
            source: phone.source,
            type: phone.type,
            personName: phone.personName,
          },
        });
        existingPhones.add(normalized);
        newPhoneCount++;
      }
    }

    // Update companyDomain if discovered
    if (!lead.companyDomain && results.emails[0]) {
      const domain = results.emails[0].email.split("@")[1];
      if (domain) {
        await db.lead.update({
          where: { id: leadId },
          data: { companyDomain: domain },
        });
      }
    }

    // Save company profile if enriched
    if (results.company) {
      const cp = results.company;
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
          employeeRange: cp.employeeRange,
          estimatedRevenue: cp.estimatedRevenue,
          foundedYear: cp.foundedYear,
          industry: cp.industry,
          linkedinUrl: cp.linkedinUrl,
          twitterUrl: cp.twitterUrl,
          facebookUrl: cp.facebookUrl,
          jobPostingCount: cp.hiringSignals.jobPostingCount,
          hiringSignals: cp.hiringSignals.signals as any,
          recentNews: cp.recentNews as any,
          techStack: cp.techStack as any,
          enrichedAt: new Date(),
        },
      });
    }

    // Mark enrichment complete
    await db.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: "complete" },
    });

    return NextResponse.json({
      message: `Found ${results.emails.length} email(s) (${newEmailCount} new), ${results.phones.length} phone(s) (${newPhoneCount} new)${results.company ? `, company intel enriched` : ""}`,
      emails: results.emails,
      phones: results.phones,
      company: results.company,
      saved: { emails: newEmailCount, phones: newPhoneCount },
    });
  } catch (err: any) {
    await db.lead.update({
      where: { id: leadId },
      data: { enrichmentStatus: "failed" },
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
