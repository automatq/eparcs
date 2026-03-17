/**
 * Fit Scorer
 *
 * Scores each lead 0-100 based on how well it matches the original
 * search query (ICP description). Different from general lead scoring —
 * this is query-specific.
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

interface LeadData {
  name: string;
  title?: string | null;
  company?: string | null;
  industry?: string | null;
  location?: string | null;
  source: string;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  website?: string | null;
  employeeCount?: number | null;
}

interface FitScoreResult {
  score: number;
  reason: string;
}

export async function scoreFit(
  query: string,
  lead: LeadData
): Promise<FitScoreResult> {
  const leadSummary = [
    `Name: ${lead.name}`,
    lead.title && `Title: ${lead.title}`,
    lead.company && `Company: ${lead.company}`,
    lead.industry && `Industry: ${lead.industry}`,
    lead.location && `Location: ${lead.location}`,
    lead.category && `Category: ${lead.category}`,
    lead.rating != null && `Rating: ${lead.rating}/5`,
    lead.reviewCount != null && `Reviews: ${lead.reviewCount}`,
    lead.website && `Has website: yes`,
    !lead.website && `Has website: no`,
    lead.employeeCount && `Employees: ${lead.employeeCount}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await aiComplete({
    system: `You score how well a lead matches a search query on a 0-100 scale.

Score meaning:
- 90-100: Perfect match, exactly what was searched for
- 75-89: Strong match, meets most criteria
- 50-74: Partial match, some criteria met
- 25-49: Weak match, few criteria met
- 0-24: No match

Respond with ONLY JSON: {"score": 85, "reason": "one sentence explanation"}`,
    prompt: `Search query: "${query}"

Lead data:
${leadSummary}

Score this lead's fit to the search query.`,
    maxTokens: 128,
  });

  const result = parseAIJson<FitScoreResult>(response);
  return result ?? { score: 50, reason: "Unable to determine fit" };
}

/**
 * Batch score multiple leads against a query.
 * More efficient — sends all leads in one prompt.
 */
export async function batchScoreFit(
  query: string,
  leads: (LeadData & { id: string })[]
): Promise<Map<string, FitScoreResult>> {
  if (leads.length === 0) return new Map();

  // For small batches, score individually for accuracy
  if (leads.length <= 5) {
    const results = new Map<string, FitScoreResult>();
    for (const lead of leads) {
      const result = await scoreFit(query, lead);
      results.set(lead.id, result);
    }
    return results;
  }

  // For larger batches, use a single prompt
  const leadSummaries = leads
    .map(
      (lead, i) =>
        `[${i}] ${lead.name} | ${lead.category ?? lead.industry ?? "?"} | ${lead.location ?? "?"} | Rating: ${lead.rating ?? "?"} | Reviews: ${lead.reviewCount ?? "?"} | Website: ${lead.website ? "yes" : "no"}`
    )
    .join("\n");

  const response = await aiComplete({
    system: `You score how well leads match a search query on a 0-100 scale.
Respond with ONLY a JSON array: [{"index": 0, "score": 85, "reason": "short reason"}, ...]`,
    prompt: `Search query: "${query}"

Leads:
${leadSummaries}

Score each lead.`,
    maxTokens: leads.length * 64,
  });

  const results = new Map<string, FitScoreResult>();
  const parsed = parseAIJson<any[]>(response);

  if (parsed && Array.isArray(parsed)) {
    for (const item of parsed) {
      const lead = leads[item.index];
      if (lead) {
        results.set(lead.id, {
          score: Math.min(100, Math.max(0, item.score ?? 50)),
          reason: item.reason ?? "",
        });
      }
    }
  }

  // Fill in any missing scores
  for (const lead of leads) {
    if (!results.has(lead.id)) {
      results.set(lead.id, { score: 50, reason: "Scored by default" });
    }
  }

  return results;
}
