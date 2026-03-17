/**
 * AI Call Analyzer
 *
 * Analyzes completed call transcripts to extract:
 * - Call outcome (interested, objection, not interested, voicemail, etc.)
 * - Summary for quick review
 * - Action items / next steps
 * - Sentiment and engagement level
 * - Key quotes from the prospect
 * - Score (0-100) on how well the call went
 * - Tags for categorization
 *
 * Output format matches MarkedUp's CallLog analysis format
 * so we can sync directly.
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface CallAnalysis {
  summary: string;
  actionItems: string;
  outcome: "positive" | "neutral" | "negative";
  score: number;
  tags: string;
  // Scraped-specific fields
  prospectSentiment: string;
  keyQuotes: string[];
  nextStep: string;
  followUpType: "book_meeting" | "send_info" | "call_back" | "add_to_sequence" | "mark_lost" | "none";
  followUpDraft: string | null;
}

export async function analyzeCallTranscript(params: {
  transcript: string;
  leadName: string;
  leadCompany: string | null;
  callType: string;
  duration: number;
  answeredBy: string;
}): Promise<CallAnalysis> {
  // If it was a voicemail, simple analysis
  if (params.answeredBy === "voicemail") {
    return {
      summary: `Voicemail left for ${params.leadName}${params.leadCompany ? ` at ${params.leadCompany}` : ""}. Duration: ${params.duration}s.`,
      actionItems: "- Follow up by email referencing the voicemail\n- Try calling again in 2-3 days",
      outcome: "neutral",
      score: 30,
      tags: "voicemail,follow-up-needed",
      prospectSentiment: "unknown",
      keyQuotes: [],
      nextStep: "Follow up by email",
      followUpType: "send_info",
      followUpDraft: null,
    };
  }

  const text = await aiComplete({
    prompt: `Analyze this sales call transcript and respond in JSON.

Call to: ${params.leadName}${params.leadCompany ? ` at ${params.leadCompany}` : ""}
Call type: ${params.callType}
Duration: ${params.duration} seconds
Answered by: ${params.answeredBy}

Transcript:
---
${params.transcript.slice(0, 5000)}
---

Respond in JSON:
{
  "summary": "<2-3 sentence summary of what happened on the call>",
  "actionItems": "<markdown bulleted list of next steps>",
  "outcome": "positive" | "neutral" | "negative",
  "score": <0-100, how well did the call go>,
  "tags": "<comma-separated tags: e.g., qualified,interested,objection-price,demo-booked>",
  "prospectSentiment": "<how the prospect felt: enthusiastic, curious, skeptical, annoyed, neutral>",
  "keyQuotes": ["<important thing they said 1>", "<important thing 2>"],
  "nextStep": "<single most important next action>",
  "followUpType": "book_meeting" | "send_info" | "call_back" | "add_to_sequence" | "mark_lost" | "none",
  "followUpDraft": "<if followUpType is send_info or call_back: draft the follow-up email. null otherwise>"
}`,
    maxTokens: 1500,
  });

  const parsed = parseAIJson<CallAnalysis>(text);
  if (parsed) return parsed;

  {
    return {
      summary: `Call with ${params.leadName}. Duration: ${params.duration}s.`,
      actionItems: "- Review transcript manually",
      outcome: "neutral",
      score: 50,
      tags: "needs-review",
      prospectSentiment: "unknown",
      keyQuotes: [],
      nextStep: "Review call recording",
      followUpType: "none",
      followUpDraft: null,
    };
  }
}
