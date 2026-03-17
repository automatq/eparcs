/**
 * AI Video Script Generator
 *
 * Generates personalized video scripts for HeyGen.
 * Scripts must:
 * - Be 30-60 seconds when spoken (roughly 75-150 words)
 * - Sound natural and conversational (it's a video, not an email)
 * - Reference the lead by name
 * - Include one specific personalization detail
 * - End with a clear CTA
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface VideoScriptInput {
  leadName: string;
  leadCompany: string | null;
  leadIndustry: string | null;
  leadSource: string;
  personalizationHook?: string;
  painPoints?: string[];
  agentConfig?: {
    agencyDescription: string | null;
    tone: string;
    differentiators: string | null;
    name: string;
  };
  scriptType: "cold_intro" | "follow_up" | "case_study" | "thank_you";
}

export async function generateVideoScript(input: VideoScriptInput): Promise<{
  script: string;
  estimatedDuration: number;
  thumbnailText: string;
  emailBody: string;
}> {
  const callerName = input.agentConfig?.name ?? "our team";
  const agency = input.agentConfig?.agencyDescription ?? "an AI automation agency";
  const tone = input.agentConfig?.tone ?? "professional";

  const typeInstructions: Record<string, string> = {
    cold_intro:
      "Introduce yourself and your agency. Reference ONE specific thing about their business (use the personalization hook). Explain in one sentence how you could help. Ask for a quick call.",
    follow_up:
      "You've reached out before but didn't hear back. Don't be annoying about it. Share one quick insight or stat relevant to their industry. Make it easy to reply.",
    case_study:
      "Share a quick success story: 'We helped a [similar business] achieve [result].' Make it specific and relevant to their industry.",
    thank_you:
      "Thank them for their time on a recent call or meeting. Recap one key takeaway and confirm next steps.",
  };

  const text = await aiComplete({
    prompt: `Write a personalized video script for an AI avatar to record.

Speaker: ${callerName} from ${agency}
Tone: ${tone}, conversational, warm — like talking to a colleague, not reading a teleprompter
Type: ${input.scriptType}
Instructions: ${typeInstructions[input.scriptType]}

Lead: ${input.leadName}${input.leadCompany ? ` at ${input.leadCompany}` : ""}
Industry: ${input.leadIndustry ?? "business"}
${input.personalizationHook ? `Personalization hook: ${input.personalizationHook}` : ""}
${input.painPoints?.length ? `Pain points: ${input.painPoints.join(", ")}` : ""}

RULES:
- 75-150 words MAXIMUM (30-60 seconds when spoken)
- Say their name early
- Sound human, not scripted
- ONE clear call to action at the end
- No filler phrases ("I hope this finds you well")
- End with something warm and natural

Respond in JSON:
{
  "script": "<the video script, ready to speak>",
  "thumbnailText": "<5-8 word text overlay for the video thumbnail, e.g., 'Hey Chris, quick idea for you'>",
  "emailBody": "<short email to send WITH the video. 2-3 sentences max. Include [VIDEO_URL] placeholder where the video link/embed goes.>"
}`,
    maxTokens: 512,
  });

  try {
    const parsed = parseAIJson<any>(text);
    if (!parsed) throw new Error("No JSON");

    // Estimate duration: ~2.5 words per second for natural speech
    const wordCount = parsed.script.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 2.5);

    return {
      script: parsed.script,
      estimatedDuration,
      thumbnailText: parsed.thumbnailText ?? `Hey ${input.leadName}, quick message`,
      emailBody: parsed.emailBody ?? `I recorded a quick personal video for you — [VIDEO_URL]\n\nWould love to connect if you have 15 minutes this week.`,
    };
  } catch {
    return {
      script: `Hey ${input.leadName}, this is ${callerName}. I help businesses like ${input.leadCompany ?? "yours"} automate their operations with AI. I'd love to show you how — would you be open to a quick call this week?`,
      estimatedDuration: 15,
      thumbnailText: `Hey ${input.leadName}, quick idea`,
      emailBody: `I recorded a quick personal video for you — [VIDEO_URL]\n\nWould love to connect if you have 15 minutes this week.`,
    };
  }
}
