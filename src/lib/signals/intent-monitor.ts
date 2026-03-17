/**
 * Intent Signal Monitor
 *
 * Continuously monitors leads for buying signals:
 * - Job changes (promotion = new budget)
 * - Funding rounds (money to spend)
 * - Review velocity drops (pain point)
 * - Tech stack changes (opportunity)
 */

import { db } from "@/lib/db";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

/**
 * Run a monitoring cycle. Called by cron every 1-4 hours.
 */
export async function runSignalMonitoring(ownerId: string): Promise<number> {
  let signalsDetected = 0;

  // Get leads to monitor (contacted or later stages, with company data)
  const leads = await db.lead.findMany({
    where: {
      ownerId,
      pipelineStage: { in: ["new", "contacted", "replied"] },
    },
    include: { businessProfile: true, companyProfile: true },
    take: 50,
  });

  for (const lead of leads) {
    // Review velocity check (for businesses with Google reviews)
    if (lead.businessProfile?.reviewCount != null && lead.businessProfile?.rating != null) {
      const existingSignal = await db.intentSignal.findFirst({
        where: { leadId: lead.id, signalType: "review_drop", detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });

      if (!existingSignal && lead.businessProfile.rating < 3.5) {
        await db.intentSignal.create({
          data: {
            leadId: lead.id,
            ownerId,
            signalType: "review_drop",
            title: `${lead.name} has low ratings`,
            description: `${lead.name} has a ${lead.businessProfile.rating}/5 rating with ${lead.businessProfile.reviewCount} reviews — potential pain point for outreach.`,
            severity: lead.businessProfile.rating < 3.0 ? "high" : "medium",
            data: { rating: lead.businessProfile.rating, reviewCount: lead.businessProfile.reviewCount },
          },
        });
        signalsDetected++;
      }
    }

    // Hiring signal check (companies with job postings = growing = has budget)
    if (lead.companyProfile?.jobPostingCount && lead.companyProfile.jobPostingCount > 3) {
      const existingSignal = await db.intentSignal.findFirst({
        where: { leadId: lead.id, signalType: "hiring_surge", detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });

      if (!existingSignal) {
        await db.intentSignal.create({
          data: {
            leadId: lead.id,
            ownerId,
            signalType: "hiring_surge",
            title: `${lead.company ?? lead.name} is hiring aggressively`,
            description: `${lead.companyProfile.jobPostingCount} active job postings detected — company is growing and likely has budget for new tools.`,
            severity: lead.companyProfile.jobPostingCount > 10 ? "critical" : "high",
            data: { jobPostingCount: lead.companyProfile.jobPostingCount },
          },
        });
        signalsDetected++;
      }
    }

    // Tech stack signal (no modern tools = opportunity)
    if (lead.companyProfile?.techStack) {
      const techStack = lead.companyProfile.techStack as string[];
      const hasNoCRM = !techStack.some((t) =>
        /salesforce|hubspot|pipedrive|zoho/i.test(t)
      );
      const hasNoMarketing = !techStack.some((t) =>
        /mailchimp|activecampaign|marketo|pardot/i.test(t)
      );

      if (hasNoCRM || hasNoMarketing) {
        const existingSignal = await db.intentSignal.findFirst({
          where: { leadId: lead.id, signalType: "tech_gap", detectedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        });

        if (!existingSignal) {
          const gaps = [];
          if (hasNoCRM) gaps.push("No CRM detected");
          if (hasNoMarketing) gaps.push("No marketing automation");

          await db.intentSignal.create({
            data: {
              leadId: lead.id,
              ownerId,
              signalType: "tech_gap",
              title: `${lead.company ?? lead.name} has tech gaps`,
              description: `${gaps.join(", ")} — potential opportunity for tool adoption.`,
              severity: "medium",
              data: { gaps, currentStack: techStack },
            },
          });
          signalsDetected++;
        }
      }
    }
  }

  return signalsDetected;
}

/**
 * Get recent signals for the dashboard feed.
 */
export async function getSignalFeed(ownerId: string, limit = 50) {
  return db.intentSignal.findMany({
    where: { ownerId, dismissed: false },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });
}

/**
 * Dismiss a signal.
 */
export async function dismissSignal(signalId: string) {
  await db.intentSignal.update({
    where: { id: signalId },
    data: { dismissed: true },
  });
}
