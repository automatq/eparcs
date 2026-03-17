/**
 * Smart Daily Queue
 *
 * Generates a prioritized list of "who to contact today" by combining:
 * - ICP score (how well they match your ideal customer)
 * - Lead score (engagement, signals, contactability)
 * - Freshness decay (older untouched leads drop in priority)
 * - Urgency signals (opened email recently, replied, going cold)
 * - Revenue estimate (higher value = higher priority)
 *
 * Also provides a reason for each lead explaining WHY it's prioritized.
 */

import { scoreAgainstICP, estimateRevenue, type ICPConfig, type ICPScore } from "./engine";
import { computeLeadScore, type LeadScore, type LeadScoreInput } from "../scoring/lead-scorer";

export interface QueuedLead {
  leadId: string;
  name: string;
  company: string | null;
  source: string;
  pipelineStage: string;

  // Scores
  queueScore: number;          // 0-100 combined priority
  icpScore: ICPScore;
  leadScore: LeadScore;
  freshnessScore: number;      // 0-100 (100 = fresh, decays over time)
  urgencyScore: number;        // 0-100 (high = needs immediate attention)

  // Context
  estimatedRevenue: number;
  revenueConfidence: string;
  reason: string;              // "Why contact this lead today"
  suggestedAction: string;     // "Call", "Email", "Follow up", etc.
  suggestedChannel: string;    // "phone", "email", "linkedin"
  daysSinceLastContact: number | null;
  daysSinceCreated: number;
}

export interface QueueInput {
  leadId: string;
  name: string;
  company: string | null;
  source: string;
  pipelineStage: string;
  category: string | null;
  industry: string | null;
  rating: number | null;
  reviewCount: number | null;
  location: string | null;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  createdAt: Date;
  lastContactedAt: Date | null;
  lastOpenedAt: Date | null;
  lastRepliedAt: Date | null;
  // For lead scoring
  leadScoreInput: LeadScoreInput;
}

/**
 * Calculate freshness score — leads decay over time if not contacted.
 * Fresh leads (< 24 hrs) = 100
 * 1-3 days = 85
 * 3-7 days = 65
 * 1-2 weeks = 40
 * 2-4 weeks = 20
 * > 1 month = 5
 */
function calculateFreshness(createdAt: Date, lastContactedAt: Date | null): number {
  const referenceDate = lastContactedAt ?? createdAt;
  const daysSince = (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince < 1) return 100;
  if (daysSince < 3) return 85;
  if (daysSince < 7) return 65;
  if (daysSince < 14) return 40;
  if (daysSince < 30) return 20;
  return 5;
}

/**
 * Calculate urgency — certain signals mean "contact NOW."
 */
function calculateUrgency(input: QueueInput): { score: number; reason: string } {
  // Recently opened an email (within 24 hrs) — they're looking at you right now
  if (input.lastOpenedAt) {
    const hoursSinceOpen = (Date.now() - input.lastOpenedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceOpen < 1) return { score: 100, reason: "Opened your email in the last hour — call NOW" };
    if (hoursSinceOpen < 6) return { score: 90, reason: "Opened your email today — strike while hot" };
    if (hoursSinceOpen < 24) return { score: 75, reason: "Opened your email yesterday" };
  }

  // Replied recently — need to follow up
  if (input.lastRepliedAt) {
    const hoursSinceReply = (Date.now() - input.lastRepliedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceReply < 2) return { score: 100, reason: "Just replied — respond immediately" };
    if (hoursSinceReply < 24) return { score: 85, reason: "Replied today — follow up ASAP" };
    if (hoursSinceReply < 72) return { score: 70, reason: "Replied recently — keep momentum" };
  }

  // New lead, never contacted — fresh opportunity
  if (input.pipelineStage === "new") {
    const daysSinceCreated = (Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 1) return { score: 65, reason: "New lead captured today" };
    if (daysSinceCreated < 3) return { score: 50, reason: "New lead — contact before going stale" };
    if (daysSinceCreated < 7) return { score: 35, reason: "New lead going stale — contact soon" };
    return { score: 15, reason: "Old uncontacted lead — may be too late" };
  }

  // Contacted but no reply — follow up
  if (input.pipelineStage === "contacted") {
    const daysSinceContact = input.lastContactedAt
      ? (Date.now() - input.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    if (daysSinceContact >= 3 && daysSinceContact < 7) return { score: 55, reason: "Due for follow-up (3-7 days since last contact)" };
    if (daysSinceContact >= 7) return { score: 40, reason: "Overdue for follow-up" };
  }

  return { score: 30, reason: "Standard priority" };
}

/**
 * Determine the best action and channel for this lead.
 */
function suggestAction(input: QueueInput, urgency: number): { action: string; channel: string } {
  // If they just replied — respond on same channel
  if (input.lastRepliedAt) {
    const hoursSince = (Date.now() - input.lastRepliedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 48) return { action: "Respond to their reply", channel: "email" };
  }

  // If they opened email — call them (they're warm)
  if (input.lastOpenedAt) {
    const hoursSince = (Date.now() - input.lastOpenedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24 && input.hasPhone) return { action: "Call — they opened your email", channel: "phone" };
  }

  // New lead with phone — call first (highest conversion)
  if (input.pipelineStage === "new" && input.hasPhone && input.source === "gmaps") {
    return { action: "Cold call introduction", channel: "phone" };
  }

  // New lead with email — send email
  if (input.pipelineStage === "new" && input.hasEmail) {
    return { action: "Send personalized intro email", channel: "email" };
  }

  // Contacted, no reply — try different channel
  if (input.pipelineStage === "contacted") {
    if (input.hasPhone) return { action: "Follow up by phone", channel: "phone" };
    return { action: "Send follow-up email", channel: "email" };
  }

  // Default
  if (input.hasEmail) return { action: "Send outreach email", channel: "email" };
  if (input.hasPhone) return { action: "Call the business", channel: "phone" };
  return { action: "Enrich contact info first", channel: "email" };
}

/**
 * Generate the daily priority queue.
 * Returns leads ranked by combined score with reasons.
 */
export function generateDailyQueue(
  leads: QueueInput[],
  icpConfig: ICPConfig,
  maxResults: number = 20
): QueuedLead[] {
  const queue: QueuedLead[] = [];

  for (const lead of leads) {
    // Skip won/lost leads
    if (lead.pipelineStage === "won" || lead.pipelineStage === "lost") continue;

    // ICP score
    const revenue = estimateRevenue({
      category: lead.category,
      reviewCount: lead.reviewCount,
      rating: lead.rating,
      location: lead.location,
    });

    const icpScore = scoreAgainstICP({
      name: lead.name,
      category: lead.category,
      industry: lead.industry,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      location: lead.location,
      hasWebsite: lead.hasWebsite,
      hasPhone: lead.hasPhone,
      hasEmail: lead.hasEmail,
      estimatedRevenue: revenue.estimate,
      competitorDetected: null,
    }, icpConfig);

    // Skip excluded leads
    if (icpScore.matchLevel === "excluded") continue;

    // Lead score
    const leadScore = computeLeadScore(lead.leadScoreInput);

    // Freshness
    const freshnessScore = calculateFreshness(lead.createdAt, lead.lastContactedAt);

    // Urgency
    const urgency = calculateUrgency(lead);

    // Suggested action
    const action = suggestAction(lead, urgency.score);

    // Combined queue score (weighted)
    const queueScore = Math.round(
      icpScore.total * 0.25 +
      leadScore.total * 0.20 +
      urgency.score * 0.25 +
      freshnessScore * 0.15 +
      Math.min(100, revenue.estimate / 5000) * 0.15 // Revenue normalized to 0-100 (cap at $500K)
    );

    const daysSinceCreated = Math.floor(
      (Date.now() - lead.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastContact = lead.lastContactedAt
      ? Math.floor((Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    queue.push({
      leadId: lead.leadId,
      name: lead.name,
      company: lead.company,
      source: lead.source,
      pipelineStage: lead.pipelineStage,
      queueScore,
      icpScore,
      leadScore,
      freshnessScore,
      urgencyScore: urgency.score,
      estimatedRevenue: revenue.estimate,
      revenueConfidence: revenue.confidence,
      reason: urgency.reason,
      suggestedAction: action.action,
      suggestedChannel: action.channel,
      daysSinceLastContact,
      daysSinceCreated,
    });
  }

  // Sort by queue score descending
  queue.sort((a, b) => b.queueScore - a.queueScore);

  return queue.slice(0, maxResults);
}
