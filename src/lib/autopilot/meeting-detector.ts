/**
 * Meeting Intent Detector
 *
 * Detects whether a reply indicates the prospect wants to book a meeting.
 */

import { aiComplete, parseAIJson } from "@/lib/ai/provider";

interface MeetingIntent {
  wantsMeeting: boolean;
  isInterested: boolean;
  isNegative: boolean;
  summary: string;
}

export async function detectMeetingIntent(replyContent: string): Promise<MeetingIntent> {
  const response = await aiComplete({
    system: `Classify this email reply. Return JSON:
{
  "wantsMeeting": true/false (they explicitly want to meet/call/chat),
  "isInterested": true/false (they show positive interest even without meeting request),
  "isNegative": true/false (they declined, unsubscribed, or are not interested),
  "summary": "one sentence summary"
}`,
    prompt: replyContent,
    maxTokens: 128,
  });

  const result = parseAIJson<MeetingIntent>(response);
  return result ?? {
    wantsMeeting: false,
    isInterested: false,
    isNegative: false,
    summary: "Could not classify reply",
  };
}
