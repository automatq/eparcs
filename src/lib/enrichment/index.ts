/**
 * Full Enrichment Engine — Apollo/ZoomInfo/Clay-grade
 *
 * Chains every available method:
 * 1. Waterfall email enrichment (7+ sources)
 * 2. Decision maker discovery
 * 3. Phone enrichment
 * 4. Company intelligence (employee count, revenue, hiring, news, social)
 *
 * All results stored in the database with source attribution.
 */

import { waterfallEmailEnrichment, type WaterfallEmailResult } from "./waterfall";
import { findPhoneNumbers, type PhoneResult } from "./phone-enrichment";
import { enrichCompany, type CompanyIntelligence } from "./company-enricher";
import { guessDomain } from "./pattern-generator";

export interface EnrichmentResult {
  email: string;
  confidence: number;
  source: string;
  verified: boolean;
  method: string;
  personName: string | null;
  personTitle: string | null;
}

export interface FullEnrichmentResult {
  emails: WaterfallEmailResult[];
  phones: PhoneResult[];
  company: CompanyIntelligence | null;
}

export interface EnrichmentInput {
  name: string;
  company?: string | null;
  companyDomain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
}

/**
 * Run the complete enrichment pipeline for a lead.
 */
export async function enrichLead(
  input: EnrichmentInput
): Promise<FullEnrichmentResult> {
  // Determine domain
  let domain: string | null = null;
  if (input.companyDomain) {
    domain = cleanDomain(input.companyDomain);
  } else if (input.website) {
    domain = cleanDomain(input.website);
  } else if (input.company) {
    const guesses = guessDomain(input.company);
    domain = guesses[0] ?? null;
  }

  // Run all enrichments in parallel
  const [emailResults, phoneResults, companyResults] = await Promise.allSettled([
    // Waterfall email enrichment
    waterfallEmailEnrichment({
      name: input.name,
      company: input.company ?? null,
      domain,
    }),

    // Phone enrichment
    domain ? findPhoneNumbers(domain) : Promise.resolve([]),

    // Company intelligence
    input.company ? enrichCompany({
      companyName: input.company ?? input.name,
      domain,
      category: input.category ?? null,
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      location: input.location ?? null,
    }) : Promise.resolve(null),
  ]);

  return {
    emails: emailResults.status === "fulfilled" ? emailResults.value : [],
    phones: phoneResults.status === "fulfilled" ? phoneResults.value : [],
    company: companyResults.status === "fulfilled" ? companyResults.value : null,
  };
}

function cleanDomain(input: string): string {
  return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}
