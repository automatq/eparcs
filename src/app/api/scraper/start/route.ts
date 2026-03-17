import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  startScrapeJob,
  generateSearchQueries,
  type ScrapedBusiness,
} from "@/lib/scraper/maps-agent";
import {
  startLinkedInScrapeJob,
  generateLinkedInSearchUrls,
} from "@/lib/scraper/linkedin-agent";
import { enrichLead } from "@/lib/enrichment";

/**
 * POST /api/scraper/start — Start an autonomous scraping job.
 *
 * Body: {
 *   source: "gmaps" | "linkedin",
 *   categories: ["dentist", "real estate"],
 *   locations: ["Toronto", "Vancouver"],
 *   titles: ["CEO", "Owner"],              // LinkedIn only
 *   maxResults: 20,
 * }
 */
export async function POST(request: NextRequest) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const {
    source = "gmaps",
    categories = [],
    locations = [],
    titles = [],
    maxResults = 20,
  } = body;

  if (categories.length === 0) {
    return NextResponse.json(
      { error: "At least one category/industry is required" },
      { status: 400 }
    );
  }

  if (source === "gmaps") {
    const queries = generateSearchQueries({ categories, locations });

    const jobId = await startScrapeJob(
      {
        queries,
        maxResultsPerQuery: maxResults,
        ownerId: userId,
        delayBetweenMs: 2500,
      },
      async (biz: ScrapedBusiness) => {
        // Save lead
        const lead = await db.lead.create({
          data: {
            name: biz.name,
            source: "gmaps",
            leadType: "business",
            pipelineStage: "new",
            enrichmentStatus: "pending",
            ownerId: userId,
          },
        });

        await db.businessProfile.create({
          data: {
            leadId: lead.id,
            phone: biz.phone,
            website: biz.website,
            address: biz.address,
            rating: biz.rating,
            reviewCount: biz.reviewCount,
            category: biz.category,
            googleMapsUrl: biz.googleMapsUrl,
          },
        });

        if (biz.phone) {
          await db.leadPhone.create({
            data: {
              leadId: lead.id,
              phone: biz.phone,
              source: "google-maps",
              type: "main",
            },
          });
        }

        // Auto-enrich in background
        if (biz.website) {
          const domain = biz.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
          enrichLead({
            name: biz.name,
            company: biz.name,
            companyDomain: domain,
            website: biz.website,
          }).then(async (results) => {
            for (const email of results.emails) {
              try {
                await db.leadEmail.create({
                  data: {
                    leadId: lead.id,
                    email: email.email,
                    source: email.source,
                    confidence: email.confidence,
                    verified: email.verified,
                    personName: email.personName,
                    personTitle: email.personTitle,
                  },
                });
              } catch { /* skip dupes */ }
            }
            for (const phone of results.phones) {
              try {
                await db.leadPhone.create({
                  data: {
                    leadId: lead.id,
                    phone: phone.phone,
                    source: phone.source,
                    type: phone.type,
                    personName: phone.personName,
                  },
                });
              } catch { /* skip dupes */ }
            }
            await db.lead.update({
              where: { id: lead.id },
              data: { enrichmentStatus: "complete", companyDomain: domain },
            });
          }).catch(async () => {
            await db.lead.update({ where: { id: lead.id }, data: { enrichmentStatus: "failed" } }).catch(() => {});
          });
        }
      }
    );

    return NextResponse.json({
      jobId,
      source: "gmaps",
      queries,
      maxResultsPerQuery: maxResults,
      message: `Scraping started. ${queries.length} queries, up to ${maxResults} results each.`,
    });
  }

  if (source === "linkedin") {
    const searchUrls = generateLinkedInSearchUrls({ titles, locations, categories });

    const jobId = await startLinkedInScrapeJob(
      {
        searchUrls,
        maxResultsPerUrl: maxResults,
        ownerId: userId,
        delayBetweenMs: 3000,
      },
      async (person) => {
        // Check for duplicate
        if (person.linkedinUrl) {
          const existing = await db.lead.findFirst({
            where: { linkedinUrl: person.linkedinUrl, ownerId: userId },
          });
          if (existing) return;
        }

        const lead = await db.lead.create({
          data: {
            name: person.name,
            title: person.title,
            company: person.company,
            location: person.location,
            linkedinUrl: person.linkedinUrl,
            source: "linkedin",
            leadType: "person",
            pipelineStage: "new",
            enrichmentStatus: "pending",
            ownerId: userId,
          },
        });

        // Auto-enrich if we have a company
        if (person.company) {
          enrichLead({
            name: person.name,
            company: person.company,
          }).then(async (results) => {
            for (const email of results.emails) {
              try {
                await db.leadEmail.create({
                  data: {
                    leadId: lead.id,
                    email: email.email,
                    source: email.source,
                    confidence: email.confidence,
                    verified: email.verified,
                    personName: email.personName,
                    personTitle: email.personTitle,
                  },
                });
              } catch { /* skip */ }
            }
            await db.lead.update({
              where: { id: lead.id },
              data: { enrichmentStatus: "complete" },
            });
          }).catch(async () => {
            await db.lead.update({ where: { id: lead.id }, data: { enrichmentStatus: "failed" } }).catch(() => {});
          });
        }
      }
    );

    return NextResponse.json({
      jobId,
      source: "linkedin",
      searchUrls,
      message: `LinkedIn scraping started. ${searchUrls.length} searches.`,
    });
  }

  return NextResponse.json({ error: "Invalid source. Use 'gmaps' or 'linkedin'." }, { status: 400 });
}
