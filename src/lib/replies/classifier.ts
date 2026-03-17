/**
 * AI Reply Classifier
 *
 * Classifies inbound email replies into categories:
 * - interested: wants to learn more, asks questions, requests a call
 * - objection: has concerns (price, timing, already have solution, etc.)
 * - not_interested: explicit rejection, unsubscribe request
 * - out_of_office: auto-reply, vacation, leave notice
 * - wrong_person: forwarded to someone else, "I'm not the right contact"
 * - question: asking for more info but not clearly interested/disinterested
 * - positive_referral: "talk to my colleague X about this"
 *
 * Also generates a recommended follow-up action and draft.
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export type ReplyCategory =
  | "interested"
  | "objection"
  | "not_interested"
  | "out_of_office"
  | "wrong_person"
  | "question"
  | "positive_referral";

export interface ReplyClassification {
  category: ReplyCategory;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  objectionType?: string;
  referredTo?: string;
  recommendedAction: string;
  followUpDraft: string | null;
  urgency: "immediate" | "same_day" | "next_day" | "wait" | "none";
}

export async function classifyReply(params: {
  replyContent: string;
  originalMessage: string;
  leadName: string;
  leadCompany: string | null;
  channel: string;
  agencyDescription?: string;
}): Promise<ReplyClassification> {
  const text = await aiComplete({
    system: `You are a sales reply analyst for an AI automation agency${params.agencyDescription ? `: ${params.agencyDescription}` : ""}.`,
    prompt: `Classify this reply and respond in JSON:

{
  "category": "interested" | "objection" | "not_interested" | "out_of_office" | "wrong_person" | "question" | "positive_referral",
  "confidence": <0-100>,
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "<one sentence summary of the reply>",
  "objectionType": "<if objection: price/timing/competitor/no_need/no_authority, else null>",
  "referredTo": "<if referral/wrong_person: name of referred person, else null>",
  "recommendedAction": "<specific next step>",
  "followUpDraft": "<if follow-up is warranted: draft the follow-up message for ${params.channel}. null if no follow-up needed>",
  "urgency": "immediate" | "same_day" | "next_day" | "wait" | "none"
}

Original outreach to ${params.leadName}${params.leadCompany ? ` at ${params.leadCompany}` : ""}:
---
${params.originalMessage}
---

Their reply:
---
${params.replyContent}
---`,
    maxTokens: 1024,
  });

  const parsed = parseAIJson<ReplyClassification>(text);
  if (parsed) return parsed;

  {
    return {
      category: "question",
      confidence: 30,
      sentiment: "neutral",
      summary: "Could not classify reply",
      recommendedAction: "Review manually",
      followUpDraft: null,
      urgency: "same_day",
    };
  }
}

/**
 * Generate an objection-handling response based on the objection type.
 */
export async function handleObjection(params: {
  objectionType: string;
  replyContent: string;
  leadName: string;
  leadCompany: string | null;
  channel: string;
  agencyDescription?: string;
  differentiators?: string;
}): Promise<string> {
  const objectionStrategies: Record<string, string> = {
    price: "Reframe around ROI and cost of NOT automating. Offer a small pilot project.",
    timing: "Acknowledge timing, offer to schedule for later, but plant urgency about competitor adoption.",
    competitor: "Don't bash competitors. Focus on what's unique about your approach and offer a comparison call.",
    no_need: "Reference specific pain points from their profile. Show what they're losing by not automating.",
    no_authority: "Ask who the right person is. Offer to send materials they can forward.",
  };

  const strategy = objectionStrategies[params.objectionType] ?? "Address their concern directly and provide value.";

  return await aiComplete({
    prompt: `Draft a reply handling this objection for ${params.channel}.

Agency: ${params.agencyDescription ?? "AI automation agency"}
Differentiators: ${params.differentiators ?? "Custom AI solutions"}
Objection type: ${params.objectionType}
Strategy: ${strategy}

Their message: "${params.replyContent}"

Lead: ${params.leadName}${params.leadCompany ? ` at ${params.leadCompany}` : ""}

Keep it concise, empathetic, and not pushy. Focus on value.`,
    maxTokens: 512,
  });
}
