/**
 * AI Lead Scoring Engine
 *
 * Scores leads 0-100 based on multiple signals:
 * - Source quality (job board signals > Maps reviews > LinkedIn profile)
 * - Automation signal strength (from job postings)
 * - Business profile indicators (rating, review count, category)
 * - Company size signals
 * - Industry fit to the user's target industries
 * - Engagement history (opened emails, clicked, replied)
 *
 * Scores are computed deterministically (fast) with an optional AI analysis pass.
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface LeadScoreInput {
  name: string;
  title: string | null;
  company: string | null;
  industry: string | null;
  source: string;
  leadType: string;
  businessProfile: {
    category: string | null;
    rating: number | null;
    reviewCount: number | null;
    website: string | null;
    phone: string | null;
  } | null;
  automationSignals: {
    signalType: string;
    signalStrength: string;
    jobTitle: string | null;
    jobDescription: string | null;
  }[];
  emails: { verified: boolean }[];
  outreachMessages: { status: string; openedAt: Date | null; clickedAt: Date | null; repliedAt: Date | null }[];
  targetIndustries: string | null;
}

export interface LeadScore {
  total: number; // 0-100
  breakdown: {
    sourceQuality: number;
    automationSignal: number;
    businessFit: number;
    contactability: number;
    engagement: number;
    industryFit: number;
  };
  reasoning: string;
  tier: "hot" | "warm" | "cold" | "dead";
}

/**
 * Compute a deterministic lead score from available signals.
 * Fast — no API calls needed.
 */
export function computeLeadScore(input: LeadScoreInput): LeadScore {
  const breakdown = {
    sourceQuality: scoreSourceQuality(input),
    automationSignal: scoreAutomationSignal(input),
    businessFit: scoreBusinessFit(input),
    contactability: scoreContactability(input),
    engagement: scoreEngagement(input),
    industryFit: scoreIndustryFit(input),
  };

  // Weighted total
  const total = Math.round(
    breakdown.sourceQuality * 0.15 +
    breakdown.automationSignal * 0.25 +
    breakdown.businessFit * 0.15 +
    breakdown.contactability * 0.15 +
    breakdown.engagement * 0.15 +
    breakdown.industryFit * 0.15
  );

  const tier =
    total >= 75 ? "hot" :
    total >= 50 ? "warm" :
    total >= 25 ? "cold" : "dead";

  const reasons: string[] = [];
  if (breakdown.automationSignal >= 70) reasons.push("Strong automation signal from job posting");
  if (breakdown.businessFit >= 70) reasons.push("Business profile indicates good fit");
  if (breakdown.engagement >= 70) reasons.push("Engaged with previous outreach");
  if (breakdown.contactability >= 70) reasons.push("Verified contact info available");
  if (breakdown.industryFit >= 70) reasons.push("Matches target industry");
  if (breakdown.sourceQuality >= 70) reasons.push("High-quality lead source");
  if (reasons.length === 0) reasons.push("Limited signals available");

  return {
    total,
    breakdown,
    reasoning: reasons.join(". ") + ".",
    tier,
  };
}

function scoreSourceQuality(input: LeadScoreInput): number {
  // Job board leads with automation signals are the best
  if (input.source === "jobboard") return 80;
  // Google Maps businesses are directly reachable
  if (input.source === "gmaps") return 65;
  // LinkedIn profiles need more enrichment
  if (input.source === "linkedin") return 50;
  return 30;
}

function scoreAutomationSignal(input: LeadScoreInput): number {
  if (input.automationSignals.length === 0) return 20;

  const strongest = input.automationSignals.reduce((best, sig) => {
    const strength = sig.signalStrength === "high" ? 3 : sig.signalStrength === "medium" ? 2 : 1;
    return strength > best ? strength : best;
  }, 0);

  if (strongest >= 3) return 95;
  if (strongest >= 2) return 70;
  return 45;
}

function scoreBusinessFit(input: LeadScoreInput): number {
  if (!input.businessProfile) return 40;

  let score = 40;
  const bp = input.businessProfile;

  // Businesses with moderate reviews (10-200) are the sweet spot
  // Too few = too small, too many = too big
  if (bp.reviewCount) {
    if (bp.reviewCount >= 10 && bp.reviewCount <= 200) score += 25;
    else if (bp.reviewCount > 200) score += 10;
    else score += 5;
  }

  // Lower ratings suggest pain points (bad customer experience = needs automation)
  if (bp.rating) {
    if (bp.rating <= 3.5) score += 20; // struggling = needs help
    else if (bp.rating <= 4.0) score += 15;
    else score += 5; // already doing well
  }

  // Has a website = more established
  if (bp.website) score += 10;

  // Has a phone = directly reachable
  if (bp.phone) score += 5;

  return Math.min(100, score);
}

function scoreContactability(input: LeadScoreInput): number {
  let score = 10;

  // Verified email is the gold standard
  const hasVerifiedEmail = input.emails.some((e) => e.verified);
  if (hasVerifiedEmail) score += 50;
  else if (input.emails.length > 0) score += 30;

  // Business with phone
  if (input.businessProfile?.phone) score += 20;

  // Has company domain (can try enrichment)
  if (input.businessProfile?.website) score += 10;

  return Math.min(100, score);
}

function scoreEngagement(input: LeadScoreInput): number {
  if (input.outreachMessages.length === 0) return 50; // neutral — no data yet

  const messages = input.outreachMessages;

  // Replied = extremely engaged
  if (messages.some((m) => m.repliedAt)) return 100;

  // Clicked link in email
  if (messages.some((m) => m.clickedAt)) return 85;

  // Opened email
  if (messages.some((m) => m.openedAt)) return 70;

  // Sent but no engagement
  if (messages.some((m) => m.status === "sent")) return 30;

  return 50;
}

function scoreIndustryFit(input: LeadScoreInput): number {
  if (!input.targetIndustries || !input.industry) return 50;

  const targets = input.targetIndustries.toLowerCase().split(/[,;]+/).map((t) => t.trim());
  const leadIndustry = input.industry.toLowerCase();
  const leadCategory = input.businessProfile?.category?.toLowerCase() ?? "";

  for (const target of targets) {
    if (!target) continue;
    if (leadIndustry.includes(target) || target.includes(leadIndustry)) return 90;
    if (leadCategory.includes(target) || target.includes(leadCategory)) return 85;
  }

  return 30;
}

/**
 * Deep AI analysis of a lead — uses Claude to analyze all available context
 * and provide detailed reasoning about fit + recommended approach.
 */
export async function aiLeadAnalysis(input: LeadScoreInput & {
  reviewExcerpts?: string[];
  jobDescriptionFull?: string;
}): Promise<{
  score: number;
  analysis: string;
  recommendedApproach: string;
  keyPainPoints: string[];
  objections: string[];
}> {
  let context = `Lead: ${input.name}`;
  if (input.title) context += `\nTitle: ${input.title}`;
  if (input.company) context += `\nCompany: ${input.company}`;
  if (input.industry) context += `\nIndustry: ${input.industry}`;
  if (input.businessProfile?.category) context += `\nCategory: ${input.businessProfile.category}`;
  if (input.businessProfile?.rating) context += `\nRating: ${input.businessProfile.rating}/5 (${input.businessProfile.reviewCount} reviews)`;

  if (input.reviewExcerpts?.length) {
    context += `\n\nRecent Google Reviews:\n${input.reviewExcerpts.map((r) => `- "${r}"`).join("\n")}`;
  }

  if (input.automationSignals.length > 0) {
    context += `\n\nAutomation Signals:`;
    for (const sig of input.automationSignals) {
      context += `\n- Hiring for: ${sig.jobTitle} (strength: ${sig.signalStrength})`;
      if (sig.jobDescription) context += `\n  Description: ${sig.jobDescription.slice(0, 300)}`;
    }
  }

  if (input.jobDescriptionFull) {
    context += `\n\nFull Job Description:\n${input.jobDescriptionFull.slice(0, 1000)}`;
  }

  const text = await aiComplete({
    system: "You are a sales intelligence analyst for an AI automation agency.",
    prompt: `Analyze this lead and respond in JSON format:
{
  "score": <0-100 buy likelihood>,
  "analysis": "<2-3 sentence analysis of why this lead is or isn't a good fit>",
  "recommendedApproach": "<specific outreach strategy for this lead>",
  "keyPainPoints": ["<pain point 1>", "<pain point 2>"],
  "objections": ["<likely objection 1>", "<likely objection 2>"]
}

Target industries: ${input.targetIndustries ?? "any"}

Lead context:
${context}`,
    maxTokens: 1024,
  });

  const parsed = parseAIJson<{
    score: number;
    analysis: string;
    recommendedApproach: string;
    keyPainPoints: string[];
    objections: string[];
  }>(text);
  if (parsed) return parsed;

  {
    return {
      score: 50,
      analysis: text,
      recommendedApproach: "Standard outreach sequence",
      keyPainPoints: [],
      objections: [],
    };
  }
}
