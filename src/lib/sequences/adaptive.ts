/**
 * Multi-Touch Adaptive Sequence Engine
 *
 * Sequences are not static — they adapt based on engagement:
 * - Opened but no reply → switch pain point angle
 * - Clicked link → fast-track to call CTA
 * - No engagement after 3 touches → try completely different approach
 * - Replied with objection → route to objection handler
 *
 * Also A/B tests subject lines and tracks what works per industry.
 */

import { aiComplete } from "@/lib/ai/provider";

export interface SequenceContext {
  leadName: string;
  leadCompany: string | null;
  leadIndustry: string | null;
  leadSource: string;
  channel: string;
  stepNumber: number;
  previousMessages: {
    content: string;
    subject: string | null;
    sentAt: Date | null;
    openedAt: Date | null;
    clickedAt: Date | null;
    repliedAt: Date | null;
  }[];
  personalizationHook?: string;
  agentConfig?: {
    agencyDescription: string | null;
    tone: string;
    differentiators: string | null;
  };
}

export type AdaptiveStrategy =
  | "initial_outreach"
  | "opened_no_reply"
  | "clicked_fast_track"
  | "no_engagement_pivot"
  | "breakup"
  | "re_engage"
  | "case_study"
  | "social_proof"
  | "value_bomb";

/**
 * Determine the best strategy for the next touch based on engagement history.
 */
export function determineStrategy(ctx: SequenceContext): AdaptiveStrategy {
  const { previousMessages, stepNumber } = ctx;

  if (stepNumber === 1) return "initial_outreach";

  const lastMessage = previousMessages[previousMessages.length - 1];
  const anyOpened = previousMessages.some((m) => m.openedAt);
  const anyClicked = previousMessages.some((m) => m.clickedAt);
  const totalSent = previousMessages.filter((m) => m.sentAt).length;

  // They clicked a link → they're warm, go for the meeting
  if (anyClicked) return "clicked_fast_track";

  // They opened but didn't reply → try a different angle
  if (anyOpened && !anyClicked) {
    if (totalSent <= 2) return "opened_no_reply";
    if (totalSent === 3) return "case_study";
    if (totalSent === 4) return "social_proof";
    return "breakup";
  }

  // No engagement at all
  if (!anyOpened) {
    if (totalSent <= 2) return "no_engagement_pivot";
    if (totalSent === 3) return "value_bomb";
    if (totalSent >= 4) return "breakup";
  }

  return "re_engage";
}

/**
 * Strategy-specific prompts that guide the AI to write the right kind of follow-up.
 */
const STRATEGY_PROMPTS: Record<AdaptiveStrategy, string> = {
  initial_outreach:
    "Write the first outreach message. Lead with the personalization hook if available. Focus on one specific pain point.",

  opened_no_reply:
    "They opened your previous email but didn't reply. Try a different angle — reference a different pain point or share a quick insight. Keep it shorter than the first message. Don't say 'I noticed you opened my email'.",

  clicked_fast_track:
    "They clicked a link in your previous email — they're interested but haven't committed. Go direct: propose a specific time for a 15-minute call. Make it easy to say yes.",

  no_engagement_pivot:
    "Previous messages got no opens. The subject line or first line isn't working. Try a completely different subject line style (question, stat, name-drop, or provocative statement). Change the angle entirely.",

  case_study:
    "Share a brief case study or result. One specific example: 'We helped [similar company] achieve [result] in [timeframe].' Keep it to 3-4 sentences max.",

  social_proof:
    "Lead with social proof: industry stats about AI adoption, or mention how many businesses in their industry are already automating. Create FOMO without being salesy.",

  value_bomb:
    "Give away genuine value for free — a specific insight about their business, a quick audit of their website, or a relevant industry trend with actionable advice. No ask. Just give. The CTA is subtle: 'Happy to share more if useful.'",

  breakup:
    "This is the final message in the sequence. Be honest: 'I've reached out a few times and don't want to be a nuisance. If the timing isn't right, no worries. If you ever want to explore AI automation for [their industry], my door is open.' Keep it classy.",

  re_engage:
    "Re-engage a lead who went cold. Reference something new: a recent change in their industry, a new capability you've built, or a time-sensitive opportunity.",
};

/**
 * Generate the next adaptive message in a sequence.
 */
export async function generateAdaptiveMessage(ctx: SequenceContext): Promise<{
  content: string;
  subject: string | null;
  strategy: AdaptiveStrategy;
  modelUsed: string;
}> {
  const strategy = determineStrategy(ctx);
  const strategyPrompt = STRATEGY_PROMPTS[strategy];

  const prevContext = ctx.previousMessages
    .map((m, i) => {
      const engagement = [];
      if (m.openedAt) engagement.push("opened");
      if (m.clickedAt) engagement.push("clicked");
      if (m.repliedAt) engagement.push("replied");
      return `Message ${i + 1}${m.subject ? ` (Subject: "${m.subject}")` : ""}: ${engagement.length > 0 ? engagement.join(", ") : "no engagement"}\n${m.content.slice(0, 200)}`;
    })
    .join("\n\n");

  const channelInstructions: Record<string, string> = {
    email: "Include a Subject line prefixed with 'Subject: '. Max 150 words for the body.",
    linkedin: "Max 300 characters. Connection message or InMail format.",
    sms: "Max 160 characters.",
    twitter: "Max 280 characters.",
  };

  const content = await aiComplete({
    prompt: `You are writing step ${ctx.stepNumber} of an outreach sequence for ${ctx.channel}.

Strategy: ${strategy}
Instructions: ${strategyPrompt}

Agency: ${ctx.agentConfig?.agencyDescription ?? "AI automation agency"}
Tone: ${ctx.agentConfig?.tone ?? "professional"}
Differentiators: ${ctx.agentConfig?.differentiators ?? "custom AI solutions"}

Lead: ${ctx.leadName}${ctx.leadCompany ? ` at ${ctx.leadCompany}` : ""}
Industry: ${ctx.leadIndustry ?? "unknown"}
Source: ${ctx.leadSource}

${ctx.personalizationHook ? `Personalization hook: ${ctx.personalizationHook}` : ""}

Previous messages and their engagement:
${prevContext || "None (this is the first message)"}

${channelInstructions[ctx.channel] ?? channelInstructions.email}

Write the next message. Follow the strategy closely.`,
    maxTokens: 1024,
  });

  let subject: string | null = null;
  let body = content;
  if (ctx.channel === "email") {
    const subjectMatch = content.match(/^Subject:\s*(.+)\n/);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      body = content.replace(/^Subject:\s*.+\n\n?/, "").trim();
    }
  }

  return {
    content: body,
    subject,
    strategy,
    modelUsed: "o4-mini",
  };
}

/**
 * Generate A/B test variants for a subject line.
 */
export async function generateSubjectVariants(
  originalSubject: string,
  leadName: string,
  industry: string | null
): Promise<string[]> {
  const text = await aiComplete({
    prompt: `Generate 3 alternative email subject lines for A/B testing.

Original: "${originalSubject}"
Lead: ${leadName}
Industry: ${industry ?? "general"}

Return just the 3 alternatives, one per line. Each should use a different style:
1. Question-based
2. Stat/number-based
3. Curiosity gap`,
    maxTokens: 256,
  });
  return text.split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).slice(0, 3);
}
