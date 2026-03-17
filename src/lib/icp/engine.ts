/**
 * Ideal Customer Profile (ICP) Engine
 *
 * Lets the user define exactly what a good lead looks like,
 * then auto-scores every lead against that profile.
 *
 * Criteria:
 * - Industries / categories (weighted match)
 * - Review count range (sweet spot: 10-200)
 * - Rating range (3.0-4.0 = struggling = needs automation)
 * - Location targeting (cities, states, countries)
 * - Has website (required for enrichment)
 * - Has phone (more reachable)
 * - Company size signals
 * - Tech stack must-haves / red flags
 * - Revenue estimation tier
 */

export interface ICPConfig {
  // Category/industry matching
  targetCategories: string[];     // e.g., ["dentist", "real estate", "restaurant"]
  excludeCategories: string[];    // e.g., ["franchise", "chain"]

  // Review/rating sweet spots
  minReviews: number;             // default: 5
  maxReviews: number;             // default: 500
  idealReviewRange: [number, number]; // default: [10, 200] — sweet spot
  minRating: number;              // default: 2.0
  maxRating: number;              // default: 4.5
  idealRatingRange: [number, number]; // default: [3.0, 4.2] — struggling but not dead

  // Location
  targetLocations: string[];      // e.g., ["Toronto", "Ontario", "Canada"]
  excludeLocations: string[];

  // Requirements
  requireWebsite: boolean;
  requirePhone: boolean;
  requireEmail: boolean;

  // Revenue tier
  minEstimatedRevenue: number;    // default: 0
  maxEstimatedRevenue: number;    // default: Infinity

  // Competitor detection
  competitorKeywords: string[];   // if found on website, flag but don't exclude
}

export interface ICPScore {
  total: number;           // 0-100
  matchLevel: "perfect" | "good" | "partial" | "poor" | "excluded";
  breakdown: {
    categoryMatch: number;
    reviewFit: number;
    ratingFit: number;
    locationMatch: number;
    contactability: number;
    revenueFit: number;
  };
  flags: string[];         // warnings like "has competitor tool", "no website"
  recommendation: string;  // "Contact immediately" | "Add to sequence" | "Low priority" | "Skip"
}

export interface LeadForICP {
  name: string;
  category: string | null;
  industry: string | null;
  rating: number | null;
  reviewCount: number | null;
  location: string | null;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  estimatedRevenue: number | null;
  competitorDetected: string | null;
}

const DEFAULT_ICP: ICPConfig = {
  targetCategories: [],
  excludeCategories: [],
  minReviews: 5,
  maxReviews: 500,
  idealReviewRange: [10, 200],
  minRating: 2.0,
  maxRating: 4.8,
  idealRatingRange: [3.0, 4.2],
  targetLocations: [],
  excludeLocations: [],
  requireWebsite: false,
  requirePhone: false,
  requireEmail: false,
  minEstimatedRevenue: 0,
  maxEstimatedRevenue: Infinity,
  competitorKeywords: [],
};

/**
 * Score a lead against an ICP config.
 */
export function scoreAgainstICP(lead: LeadForICP, config: ICPConfig = DEFAULT_ICP): ICPScore {
  const breakdown = {
    categoryMatch: scoreCategoryMatch(lead, config),
    reviewFit: scoreReviewFit(lead, config),
    ratingFit: scoreRatingFit(lead, config),
    locationMatch: scoreLocationMatch(lead, config),
    contactability: scoreContactability(lead, config),
    revenueFit: scoreRevenueFit(lead, config),
  };

  const flags: string[] = [];

  // Check exclusions
  if (lead.category && config.excludeCategories.length > 0) {
    const catLower = lead.category.toLowerCase();
    if (config.excludeCategories.some((e) => catLower.includes(e.toLowerCase()))) {
      flags.push("Excluded category");
      return {
        total: 0,
        matchLevel: "excluded",
        breakdown,
        flags,
        recommendation: "Skip — excluded category",
      };
    }
  }

  if (lead.location && config.excludeLocations.length > 0) {
    const locLower = lead.location.toLowerCase();
    if (config.excludeLocations.some((e) => locLower.includes(e.toLowerCase()))) {
      flags.push("Excluded location");
      return {
        total: 0,
        matchLevel: "excluded",
        breakdown,
        flags,
        recommendation: "Skip — excluded location",
      };
    }
  }

  // Requirements check
  if (config.requireWebsite && !lead.hasWebsite) flags.push("No website (required)");
  if (config.requirePhone && !lead.hasPhone) flags.push("No phone (required)");
  if (config.requireEmail && !lead.hasEmail) flags.push("No email (required)");
  if (lead.competitorDetected) flags.push(`Uses competitor: ${lead.competitorDetected}`);
  if (!lead.hasWebsite) flags.push("No website — can't enrich");

  // Weighted total
  const total = Math.round(
    breakdown.categoryMatch * 0.25 +
    breakdown.reviewFit * 0.15 +
    breakdown.ratingFit * 0.15 +
    breakdown.locationMatch * 0.15 +
    breakdown.contactability * 0.15 +
    breakdown.revenueFit * 0.15
  );

  const matchLevel =
    total >= 80 ? "perfect" :
    total >= 60 ? "good" :
    total >= 40 ? "partial" : "poor";

  const recommendation =
    total >= 80 ? "Contact immediately — perfect ICP match" :
    total >= 60 ? "Add to outreach sequence — good fit" :
    total >= 40 ? "Low priority — partial match" :
    "Skip or deprioritize — poor fit";

  return { total, matchLevel, breakdown, flags, recommendation };
}

function scoreCategoryMatch(lead: LeadForICP, config: ICPConfig): number {
  if (config.targetCategories.length === 0) return 60; // No filter = neutral

  const text = `${lead.category ?? ""} ${lead.industry ?? ""}`.toLowerCase();
  if (!text.trim()) return 30;

  for (const target of config.targetCategories) {
    if (text.includes(target.toLowerCase())) return 100;
  }

  // Partial match — check if any words overlap
  const targetWords = config.targetCategories.flatMap((t) => t.toLowerCase().split(/\s+/));
  const leadWords = text.split(/\s+/);
  const overlap = targetWords.filter((tw) => leadWords.some((lw) => lw.includes(tw) || tw.includes(lw)));
  if (overlap.length > 0) return 60;

  return 20;
}

function scoreReviewFit(lead: LeadForICP, config: ICPConfig): number {
  if (!lead.reviewCount) return 30;

  if (lead.reviewCount < config.minReviews) return 10; // Too small
  if (lead.reviewCount > config.maxReviews) return 40; // Too big (might be a chain)

  const [idealMin, idealMax] = config.idealReviewRange;
  if (lead.reviewCount >= idealMin && lead.reviewCount <= idealMax) return 100; // Sweet spot

  // Close to sweet spot
  if (lead.reviewCount < idealMin) {
    return 50 + (lead.reviewCount / idealMin) * 30;
  }
  return 60; // Above ideal but within max
}

function scoreRatingFit(lead: LeadForICP, config: ICPConfig): number {
  if (!lead.rating) return 40;

  if (lead.rating < config.minRating) return 10; // Too bad — might be going under
  if (lead.rating > config.maxRating) return 50; // Too good — less pain

  const [idealMin, idealMax] = config.idealRatingRange;
  if (lead.rating >= idealMin && lead.rating <= idealMax) return 100; // Struggling = needs help

  if (lead.rating < idealMin) return 60; // Below ideal but above min
  return 70; // Above ideal but below max
}

function scoreLocationMatch(lead: LeadForICP, config: ICPConfig): number {
  if (config.targetLocations.length === 0) return 60; // No filter
  if (!lead.location) return 30;

  const locLower = lead.location.toLowerCase();
  for (const target of config.targetLocations) {
    if (locLower.includes(target.toLowerCase())) return 100;
  }
  return 20;
}

function scoreContactability(lead: LeadForICP, config: ICPConfig): number {
  let score = 20;
  if (lead.hasEmail) score += 35;
  if (lead.hasPhone) score += 25;
  if (lead.hasWebsite) score += 20;
  return Math.min(100, score);
}

function scoreRevenueFit(lead: LeadForICP, config: ICPConfig): number {
  if (!lead.estimatedRevenue) return 50; // No data = neutral

  if (lead.estimatedRevenue < config.minEstimatedRevenue) return 15;
  if (lead.estimatedRevenue > config.maxEstimatedRevenue) return 30;

  return 80;
}

/**
 * Estimate annual revenue for a business based on available signals.
 * This is a rough estimate — not financial advice.
 */
export function estimateRevenue(params: {
  category: string | null;
  reviewCount: number | null;
  rating: number | null;
  location: string | null;
}): { estimate: number; confidence: "low" | "medium" | "high"; reasoning: string } {
  if (!params.reviewCount || !params.category) {
    return { estimate: 0, confidence: "low", reasoning: "Insufficient data" };
  }

  // Revenue estimation heuristic based on category and reviews
  // Reviews roughly correlate with customer volume
  const categoryMultipliers: Record<string, number> = {
    // High revenue per customer
    "dentist": 800, "dental": 800,
    "lawyer": 1200, "attorney": 1200, "law firm": 1200,
    "real estate": 2000, "realtor": 2000,
    "doctor": 600, "medical": 600, "clinic": 600,
    "veterinarian": 400, "vet": 400,
    "accountant": 600, "cpa": 600,
    "insurance": 800,
    "financial": 1000,
    "contractor": 1500, "plumber": 800, "electrician": 800,
    "hvac": 1000,
    "auto repair": 400, "mechanic": 400,
    // Medium revenue per customer
    "restaurant": 150, "cafe": 100,
    "salon": 200, "spa": 300, "barber": 150,
    "gym": 300, "fitness": 300,
    "hotel": 500,
    "photography": 500,
    // Lower revenue per customer
    "retail": 100, "store": 100,
    "cleaning": 200,
    "landscaping": 300,
  };

  const catLower = params.category.toLowerCase();
  let multiplier = 200; // default
  for (const [key, value] of Object.entries(categoryMultipliers)) {
    if (catLower.includes(key)) {
      multiplier = value;
      break;
    }
  }

  // Reviews = rough proxy for annual customers (each review ≈ 10-30 customers)
  const estimatedCustomers = params.reviewCount * 20;
  const estimate = Math.round(estimatedCustomers * multiplier);

  const confidence = params.reviewCount > 20 ? "medium" : "low";
  const reasoning = `~${estimatedCustomers} estimated annual customers × $${multiplier} avg revenue per customer (${params.category})`;

  return { estimate, confidence, reasoning };
}
