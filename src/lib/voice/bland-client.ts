/**
 * Bland.ai Voice Agent Client
 *
 * Bland.ai is the AI phone calling platform.
 * We use their API to:
 * 1. Initiate outbound calls with a personalized script
 * 2. Drop voicemails
 * 3. Receive call completion webhooks with transcripts
 *
 * API docs: https://docs.bland.ai
 */

const BLAND_API_BASE = "https://api.bland.ai/v1";

function getHeaders() {
  const apiKey = process.env.BLAND_API_KEY;
  if (!apiKey) throw new Error("BLAND_API_KEY not configured");
  return {
    "Content-Type": "application/json",
    Authorization: apiKey,
  };
}

export interface InitiateCallParams {
  phoneNumber: string;
  script: string;
  voicemailScript: string;
  voiceId?: string;
  maxDurationMins?: number;
  webhookUrl: string;
  metadata?: Record<string, string>;
  // Bland-specific options
  waitForGreeting?: boolean;
  record?: boolean;
  language?: string;
  transferPhoneNumber?: string; // Transfer to human if lead is very interested
}

export interface BlandCallResponse {
  call_id: string;
  status: string;
  message: string;
}

export interface BlandCallResult {
  call_id: string;
  to: string;
  from: string;
  status: "completed" | "no-answer" | "busy" | "failed" | "voicemail";
  duration: number; // seconds
  transcript: string;
  recording_url: string | null;
  summary: string;
  answered_by: "human" | "voicemail" | "unknown";
  metadata: Record<string, string>;
  concatenated_transcript: string;
  call_length: number;
}

/**
 * Initiate an outbound AI call via Bland.ai
 */
export async function initiateCall(
  params: InitiateCallParams
): Promise<BlandCallResponse> {
  const response = await fetch(`${BLAND_API_BASE}/calls`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      phone_number: params.phoneNumber,
      task: params.script,
      voice: params.voiceId ?? "maya", // Natural-sounding female voice
      max_duration: params.maxDurationMins ?? 3,
      wait_for_greeting: params.waitForGreeting ?? true,
      record: params.record ?? true,
      language: params.language ?? "en",
      webhook: params.webhookUrl,
      metadata: params.metadata ?? {},
      voicemail_message: params.voicemailScript,
      // If lead is very interested, transfer to the actual human
      ...(params.transferPhoneNumber && {
        transfer_phone_number: params.transferPhoneNumber,
      }),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Bland.ai error: ${error.message ?? response.status}`);
  }

  return response.json();
}

/**
 * Get call details/status from Bland.ai
 */
export async function getCallDetails(callId: string): Promise<BlandCallResult> {
  const response = await fetch(`${BLAND_API_BASE}/calls/${callId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get call details: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the recording URL for a completed call
 */
export async function getRecordingUrl(callId: string): Promise<string | null> {
  const details = await getCallDetails(callId);
  return details.recording_url;
}
