/**
 * AI Query Parser
 *
 * Takes a natural language description of an ideal customer and
 * extracts structured search parameters using AI.
 *
 * "Find HVAC companies in Dallas with bad reviews and no website"
 * →
 * {
 *   sources: ["gmaps", "yelp"],
 *   categories: ["HVAC", "heating and cooling"],
 *   locations: ["Dallas, TX"],
 *   leadType: "business",
 *   filters: { maxRating: 3.5, hasWebsite: false },
 *   maxResults: 25,
 * }
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface ParsedSearch {
  sources: ("gmaps" | "linkedin" | "yelp" | "bbb" | "indeed")[];
  categories: string[];
  locations: string[];
  titles: string[];
  leadType: "person" | "business";
  filters: {
    minRating?: number;
    maxRating?: number;
    minReviews?: number;
    maxReviews?: number;
    hasWebsite?: boolean;
    hiringSignals?: boolean;
    keywords?: string[];
  };
  maxResults: number;
}

const SYSTEM_PROMPT = `You are an AI search query parser for a B2B lead generation platform.

The user describes their ideal customer in plain English. You must extract structured search parameters.

Available data sources:
- "gmaps": Google Maps — best for local businesses (restaurants, dentists, HVAC, plumbers, salons, etc.)
- "linkedin": LinkedIn — best for people search (founders, CTOs, managers by title/industry)
- "yelp": Yelp — best for service businesses with review data (restaurants, home services, health, auto)
- "bbb": BBB (Better Business Bureau) — best for trust/accreditation signals
- "indeed": Indeed job boards — best for finding companies that are hiring (growth signal)

Rules:
1. Choose ALL relevant sources. If they want local businesses, include gmaps + yelp. If they mention hiring, include indeed.
2. Extract locations as specific as possible (city + state/province).
3. Extract business categories/industries as search terms.
4. If the query is about PEOPLE (founders, CEOs, developers), set leadType to "person" and include linkedin.
5. If the query is about BUSINESSES (companies, stores, restaurants), set leadType to "business" and include gmaps.
6. Extract any rating/review filters from the query.
7. Default maxResults to 25 if not specified.

Respond with ONLY a JSON object matching this schema:
{
  "sources": ["gmaps", "yelp"],
  "categories": ["HVAC", "heating and cooling"],
  "locations": ["Dallas, TX"],
  "titles": [],
  "leadType": "business",
  "filters": {
    "minRating": null,
    "maxRating": 3.5,
    "minReviews": null,
    "maxReviews": null,
    "hasWebsite": false,
    "hiringSignals": false,
    "keywords": []
  },
  "maxResults": 25
}`;

export async function parseSearchQuery(query: string): Promise<ParsedSearch> {
  const response = await aiComplete({
    system: SYSTEM_PROMPT,
    prompt: query,
    maxTokens: 512,
  });

  const parsed = parseAIJson<any>(response);

  if (!parsed) {
    // Fallback: treat the whole query as a Google Maps search
    return {
      sources: ["gmaps"],
      categories: [query],
      locations: [],
      titles: [],
      leadType: "business",
      filters: {},
      maxResults: 25,
    };
  }

  return {
    sources: parsed.sources ?? ["gmaps"],
    categories: parsed.categories ?? [],
    locations: parsed.locations ?? [],
    titles: parsed.titles ?? [],
    leadType: parsed.leadType ?? "business",
    filters: {
      minRating: parsed.filters?.minRating ?? undefined,
      maxRating: parsed.filters?.maxRating ?? undefined,
      minReviews: parsed.filters?.minReviews ?? undefined,
      maxReviews: parsed.filters?.maxReviews ?? undefined,
      hasWebsite: parsed.filters?.hasWebsite ?? undefined,
      hiringSignals: parsed.filters?.hiringSignals ?? undefined,
      keywords: parsed.filters?.keywords ?? [],
    },
    maxResults: parsed.maxResults ?? 25,
  };
}
