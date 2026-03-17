/**
 * AI Call Script Generator
 *
 * Generates personalized call scripts for outbound AI voice calls.
 * Scripts adapt based on:
 * - Lead source (LinkedIn/Maps/Job Board)
 * - Personalization signals (tech stack, reviews, pain points)
 * - Previous outreach history (what they've seen/opened/replied to)
 * - Lead score and AI analysis
 * - Whether this is a cold call, warm follow-up, or meeting confirmation
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export type CallType =
  | "cold_intro"
  | "follow_up_no_reply"
  | "follow_up_opened"
  | "follow_up_interested"
  | "meeting_confirm"
  | "voicemail_drop";

export interface CallScript {
  type: CallType;
  greeting: string;
  mainPitch: string;
  objectionHandlers: Record<string, string>;
  closingCTA: string;
  voicemailScript: string;
  toneNotes: string;
  maxDurationSecs: number;
  fullScript: string; // Complete script for the AI voice agent
}

export interface ScriptInput {
  leadName: string;
  leadTitle: string | null;
  leadCompany: string | null;
  leadIndustry: string | null;
  leadSource: string;
  callType: CallType;
  personalizationHook?: string;
  painPoints?: string[];
  techStack?: string[];
  previousOutreach?: {
    channel: string;
    content: string;
    status: string;
  }[];
  agentConfig?: {
    agencyDescription: string | null;
    tone: string;
    differentiators: string | null;
    name: string;
  };
  callerName?: string;
}

export async function generateCallScript(input: ScriptInput): Promise<CallScript> {
  const callTypeInstructions: Record<CallType, string> = {
    cold_intro:
      "This is a cold call. The lead hasn't heard from you before (or hasn't engaged with emails). Be brief, respectful of their time, and get to the point in under 30 seconds. Ask permission to continue.",
    follow_up_no_reply:
      "You've emailed them but got no reply. Reference the email briefly ('I sent you a note last week about...'). Don't be pushy about why they didn't reply.",
    follow_up_opened:
      "They opened your email but didn't reply — they're at least curious. Reference what you sent and ask if they had a chance to look at it.",
    follow_up_interested:
      "They replied with interest or questions. This is a warm call to deepen the conversation and book a meeting.",
    meeting_confirm:
      "They agreed to a meeting. Confirm the time, set expectations for the call, and ask if there's anything specific they'd like to cover.",
    voicemail_drop:
      "Generate a voicemail script only. Max 30 seconds. Leave your name, one hook, and a callback number or mention you'll follow up by email.",
  };

  let context = `Lead: ${input.leadName}`;
  if (input.leadTitle) context += `\nTitle: ${input.leadTitle}`;
  if (input.leadCompany) context += `\nCompany: ${input.leadCompany}`;
  if (input.leadIndustry) context += `\nIndustry: ${input.leadIndustry}`;
  context += `\nSource: ${input.leadSource}`;

  if (input.personalizationHook) {
    context += `\n\nPersonalization hook: ${input.personalizationHook}`;
  }
  if (input.painPoints?.length) {
    context += `\nPain points: ${input.painPoints.join(", ")}`;
  }
  if (input.techStack?.length) {
    context += `\nTheir tech stack: ${input.techStack.join(", ")}`;
  }
  if (input.previousOutreach?.length) {
    context += `\n\nPrevious outreach:`;
    for (const msg of input.previousOutreach.slice(-3)) {
      context += `\n- ${msg.channel} (${msg.status}): "${msg.content.slice(0, 100)}..."`;
    }
  }

  const callerName = input.callerName ?? input.agentConfig?.name ?? "your sales rep";
  const agency = input.agentConfig?.agencyDescription ?? "an AI automation agency";
  const tone = input.agentConfig?.tone ?? "professional";
  const diff = input.agentConfig?.differentiators ?? "custom AI solutions";

  const text = await aiComplete({
    prompt: `Generate an AI voice call script in JSON format.

You are ${callerName} from ${agency}. Tone: ${tone}. Differentiators: ${diff}.

Call type: ${input.callType}
Instructions: ${callTypeInstructions[input.callType]}

${context}

Respond in JSON:
{
  "greeting": "<opening line — introduce yourself and ask if it's a good time>",
  "mainPitch": "<the core pitch — 2-3 sentences max. Reference personalization hook if available>",
  "objectionHandlers": {
    "not_interested": "<response if they say not interested>",
    "bad_timing": "<response if they say it's not a good time>",
    "already_have_solution": "<response if they already have something>",
    "too_expensive": "<response if they bring up cost>",
    "send_info": "<response if they ask you to send info instead>"
  },
  "closingCTA": "<how to end the call — book a meeting, send info, etc.>",
  "voicemailScript": "<30-second voicemail if they don't answer>",
  "toneNotes": "<brief instruction for the AI voice agent on how to sound>",
  "maxDurationSecs": <recommended max call duration in seconds>
}`,
    maxTokens: 2048,
  });

  try {
    const parsed = parseAIJson<any>(text);
    if (!parsed) throw new Error("No JSON");

    // Build the full script for Bland.ai
    const fullScript = buildFullScript(parsed, input);

    return {
      type: input.callType,
      ...parsed,
      fullScript,
    };
  } catch {
    return {
      type: input.callType,
      greeting: `Hi ${input.leadName}, this is ${callerName}. Do you have a quick moment?`,
      mainPitch: `I help businesses like ${input.leadCompany ?? "yours"} automate their operations with AI. I noticed you might benefit from some of the solutions we offer.`,
      objectionHandlers: {
        not_interested: "No problem at all. Would it be okay if I sent you a quick email with some info in case things change?",
        bad_timing: "Totally understand. When would be a better time for a 2-minute call?",
        already_have_solution: "That's great. Out of curiosity, what are you using? We often complement existing solutions.",
        too_expensive: "I hear you. Most of our clients see ROI within the first month. Would a quick case study help?",
        send_info: "Absolutely, I'll send that right over. What's the best email?",
      },
      closingCTA: "Would you be open to a quick 15-minute call this week to see if there's a fit?",
      voicemailScript: `Hi ${input.leadName}, this is ${callerName} from ${agency}. I help businesses automate their operations with AI and thought it could be relevant for ${input.leadCompany ?? "your business"}. I'll follow up by email. Have a great day.`,
      toneNotes: `${tone}, conversational, not salesy`,
      maxDurationSecs: 180,
      fullScript: "",
    };
  }
}

/**
 * Build the complete prompt/script for the Bland.ai voice agent.
 */
function buildFullScript(parsed: any, input: ScriptInput): string {
  const callerName = input.callerName ?? input.agentConfig?.name ?? "the agent";
  const agency = input.agentConfig?.agencyDescription ?? "an AI automation agency";

  return `You are ${callerName}, a friendly and professional sales representative from ${agency}.

You are calling ${input.leadName}${input.leadCompany ? ` at ${input.leadCompany}` : ""}.

TONE: ${parsed.toneNotes ?? "Professional but warm. Conversational, not robotic. Pause naturally."}

OPENING:
${parsed.greeting}

IF THEY HAVE TIME — MAIN PITCH:
${parsed.mainPitch}

OBJECTION HANDLING:
${Object.entries(parsed.objectionHandlers as Record<string, string>)
  .map(([key, value]) => `- If "${key.replace(/_/g, " ")}": ${value}`)
  .join("\n")}

CLOSING:
${parsed.closingCTA}

VOICEMAIL (if no answer):
${parsed.voicemailScript}

RULES:
- Never be pushy or aggressive
- If they ask you to stop calling, immediately apologize and end the call
- Keep the call under ${Math.floor((parsed.maxDurationSecs ?? 180) / 60)} minutes
- If they're interested, try to book a specific time for a follow-up call
- Always be honest — you are an AI assistant making calls on behalf of ${callerName}
- End every call politely regardless of outcome`;
}
