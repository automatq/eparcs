/**
 * Parallel Search Runner
 *
 * Runs multiple scrapers concurrently for a single search query.
 * Streams results into a workspace as they arrive.
 * Deduplicates across sources.
 */

import { db } from "@/lib/db";
import {
  startScrapeJob,
  generateSearchQueries,
  getJobStatus,
  type ScrapedBusiness,
} from "@/lib/scraper/maps-agent";
import {
  startLinkedInScrapeJob,
  generateLinkedInSearchUrls,
} from "@/lib/scraper/linkedin-agent";
import { scrapeYelp } from "@/lib/scrapers/yelp";
import { scrapeBBB } from "@/lib/scrapers/bbb";
// Inline simple dedup (removed separate module)
function deduplicateLeads(candidates: any[]): any[] {
  const seen = new Map<string, any>();
  for (const c of candidates) {
    const key = c.phone?.replace(/\D/g, "").slice(-10) ?? c.name?.toLowerCase();
    if (key && !seen.has(key)) seen.set(key, c);
  }
  return Array.from(seen.values());
}
import { enrichLead } from "@/lib/enrichment";
import type { ParsedSearch } from "./query-parser";

interface RunnerParams {
  searchAgentId: string;
  workspaceId: string;
  query: string;
  parsed: ParsedSearch;
  ownerId: string;
}

/**
 * Run all relevant scrapers in parallel for a search query.
 * This is a fire-and-forget function — runs in background.
 */
export async function runParallelSearch(params: RunnerParams): Promise<void> {
  const { searchAgentId, workspaceId, query, parsed, ownerId } = params;

  const sourcePromises: Promise<any[]>[] = [];
  const sourceNames: string[] = [];

  // Update progress helper
  async function updateProgress(source: string, status: string, found: number) {
    try {
      const agent = await db.searchAgent.findUnique({ where: { id: searchAgentId } });
      if (!agent) return;
      const progress = JSON.parse(agent.sourceProgress || "{}");
      progress[source] = { status, found };
      await db.searchAgent.update({
        where: { id: searchAgentId },
        data: { sourceProgress: JSON.stringify(progress) },
      });
    } catch {}
  }

  // ── Google Maps ──
  if (parsed.sources.includes("gmaps")) {
    sourceNames.push("gmaps");
    sourcePromises.push(
      (async () => {
        await updateProgress("gmaps", "searching", 0);
        const queries = generateSearchQueries({
          categories: parsed.categories,
          locations: parsed.locations,
        });
        const results: any[] = [];
        const jobId = await startScrapeJob(
          {
            queries,
            maxResultsPerQuery: parsed.maxResults,
            ownerId,
            delayBetweenMs: 2500,
          },
          async (biz: ScrapedBusiness) => {
            results.push({
              name: biz.name,
              phone: biz.phone,
              website: biz.website,
              address: biz.address,
              rating: biz.rating,
              reviewCount: biz.reviewCount,
              category: biz.category,
              googleMapsUrl: biz.googleMapsUrl,
              source: "gmaps",
            });
          }
        );

        // Poll until complete
        while (true) {
          const status = getJobStatus(jobId);
          if (!status || status.status !== "running") break;
          await new Promise((r) => setTimeout(r, 3000));
        }

        await updateProgress("gmaps", "complete", results.length);
        return results;
      })()
    );
  }

  // ── LinkedIn ──
  if (parsed.sources.includes("linkedin")) {
    sourceNames.push("linkedin");
    sourcePromises.push(
      (async () => {
        await updateProgress("linkedin", "searching", 0);
        const searchUrls = generateLinkedInSearchUrls({
          titles: parsed.titles,
          locations: parsed.locations,
          categories: parsed.categories,
        });
        const results: any[] = [];
        const jobId = await startLinkedInScrapeJob(
          {
            searchUrls,
            maxResultsPerUrl: parsed.maxResults,
            ownerId,
            delayBetweenMs: 3000,
          },
          async (person) => {
            results.push({
              name: person.name,
              title: person.title,
              company: person.company,
              location: person.location,
              linkedinUrl: person.linkedinUrl,
              source: "linkedin",
            });
          }
        );

        // Poll until complete or timeout
        const startTime = Date.now();
        while (true) {
          await new Promise((r) => setTimeout(r, 3000));
          if (results.length > 0) break;
          if (Date.now() - startTime > 60000) break; // 60s timeout
        }

        await updateProgress("linkedin", "complete", results.length);
        return results;
      })()
    );
  }

  // ── Yelp ──
  if (parsed.sources.includes("yelp")) {
    sourceNames.push("yelp");
    sourcePromises.push(
      (async () => {
        await updateProgress("yelp", "searching", 0);
        const allResults: any[] = [];
        for (const category of parsed.categories) {
          for (const location of parsed.locations.length > 0 ? parsed.locations : [""]) {
            const yelpResults = await scrapeYelp({
              category,
              location,
              maxResults: parsed.maxResults,
            });
            allResults.push(
              ...yelpResults.map((biz) => ({
                name: biz.name,
                phone: biz.phone,
                website: biz.website,
                address: biz.address,
                rating: biz.rating,
                reviewCount: biz.reviewCount,
                category: biz.category,
                yelpUrl: biz.yelpUrl,
                source: "yelp",
              }))
            );
          }
        }
        await updateProgress("yelp", "complete", allResults.length);
        return allResults;
      })()
    );
  }

  // ── BBB ──
  if (parsed.sources.includes("bbb")) {
    sourceNames.push("bbb");
    sourcePromises.push(
      (async () => {
        await updateProgress("bbb", "searching", 0);
        const allResults: any[] = [];
        for (const category of parsed.categories) {
          for (const location of parsed.locations.length > 0 ? parsed.locations : [""]) {
            const bbbResults = await scrapeBBB({
              category,
              location,
              maxResults: parsed.maxResults,
            });
            allResults.push(
              ...bbbResults.map((biz) => ({
                name: biz.name,
                phone: biz.phone,
                website: biz.website,
                address: biz.address,
                bbbRating: biz.bbbRating,
                isAccredited: biz.isAccredited,
                complaintsCount: biz.complaintsCount,
                category: biz.category,
                bbbUrl: biz.bbbUrl,
                source: "bbb",
              }))
            );
          }
        }
        await updateProgress("bbb", "complete", allResults.length);
        return allResults;
      })()
    );
  }

  try {
    // Run all sources in parallel
    const results = await Promise.allSettled(sourcePromises);

    // Collect all leads from all sources
    const allLeads = results
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // Deduplicate across sources
    const uniqueLeads = deduplicateLeads(allLeads);

    // Apply filters
    let filtered = uniqueLeads;
    if (parsed.filters.maxRating != null) {
      filtered = filtered.filter(
        (l) => l.rating == null || l.rating <= parsed.filters.maxRating!
      );
    }
    if (parsed.filters.minRating != null) {
      filtered = filtered.filter(
        (l) => l.rating == null || l.rating >= parsed.filters.minRating!
      );
    }
    if (parsed.filters.minReviews != null) {
      filtered = filtered.filter(
        (l) => l.reviewCount == null || l.reviewCount >= parsed.filters.minReviews!
      );
    }
    if (parsed.filters.hasWebsite === false) {
      filtered = filtered.filter((l) => !l.website);
    }
    if (parsed.filters.hasWebsite === true) {
      filtered = filtered.filter((l) => !!l.website);
    }

    // Save leads to database + workspace
    const savedLeadIds: string[] = [];
    for (const lead of filtered) {
      const isLinkedIn = lead.source === "linkedin" || lead.source?.includes("linkedin");
      const leadData = await db.lead.create({
        data: {
          name: lead.name,
          title: lead.title ?? null,
          company: lead.company ?? lead.name,
          location: lead.location ?? lead.address ?? null,
          linkedinUrl: lead.linkedinUrl ?? null,
          source: lead.source?.split(",")[0] ?? "gmaps",
          leadType: isLinkedIn ? "person" : "business",
          pipelineStage: "new",
          enrichmentStatus: "pending",
          ownerId,
        },
      });

      savedLeadIds.push(leadData.id);

      // Save business profile if applicable
      if (!isLinkedIn && (lead.phone || lead.website || lead.rating != null)) {
        await db.businessProfile
          .create({
            data: {
              leadId: leadData.id,
              phone: lead.phone,
              website: lead.website,
              address: lead.address,
              rating: lead.rating,
              reviewCount: lead.reviewCount,
              category: lead.category,
              googleMapsUrl: lead.googleMapsUrl ?? null,
            },
          })
          .catch(() => {});
      }

      // Save phone
      if (lead.phone) {
        await db.leadPhone
          .create({
            data: {
              leadId: leadData.id,
              phone: lead.phone,
              source: lead.source?.split(",")[0] ?? "manual",
              type: "main",
            },
          })
          .catch(() => {});
      }

      // Add to workspace
      await db.workspaceLead
        .create({
          data: { workspaceId, leadId: leadData.id },
        })
        .catch(() => {});

      // Auto-enrich in background
      const domain = lead.website
        ? lead.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
        : null;
      if (domain) {
        enrichLead({
          name: lead.name,
          company: lead.company ?? lead.name,
          companyDomain: domain,
          website: lead.website,
        })
          .then(async (enrichResults) => {
            for (const email of enrichResults.emails) {
              await db.leadEmail
                .create({
                  data: {
                    leadId: leadData.id,
                    email: email.email,
                    source: email.source,
                    confidence: email.confidence,
                    verified: email.verified,
                    personName: email.personName,
                    personTitle: email.personTitle,
                  },
                })
                .catch(() => {});
            }
            await db.lead
              .update({
                where: { id: leadData.id },
                data: { enrichmentStatus: "complete", companyDomain: domain },
              })
              .catch(() => {});
          })
          .catch(() => {
            db.lead
              .update({ where: { id: leadData.id }, data: { enrichmentStatus: "failed" } })
              .catch(() => {});
          });
      }
    }

    // Update search agent as complete
    await db.searchAgent.update({
      where: { id: searchAgentId },
      data: {
        status: "completed",
        resultsCount: filtered.length,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Parallel search failed:", err);
    await db.searchAgent
      .update({
        where: { id: searchAgentId },
        data: { status: "failed", completedAt: new Date() },
      })
      .catch(() => {});
  }
}
