/**
 * HeyGen AI Video Prospecting
 *
 * Generates personalized video messages for outreach.
 * Each video features an AI avatar saying a custom script
 * tailored to the lead — their name, company, pain points.
 *
 * Flow:
 * 1. Generate a personalized video script (using Claude)
 * 2. Send to HeyGen API to render the video
 * 3. Get back a video URL
 * 4. Embed in email or LinkedIn message
 *
 * HeyGen API docs: https://docs.heygen.com
 */

const HEYGEN_API_BASE = "https://api.heygen.com/v2";

function getHeaders() {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY not configured");
  return {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
  };
}

export interface VideoRequest {
  script: string;
  avatarId?: string; // HeyGen avatar ID (default: professional business avatar)
  voiceId?: string; // HeyGen voice ID
  backgroundUrl?: string; // Custom background image
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface VideoResult {
  videoId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

/**
 * Create a personalized video via HeyGen.
 */
export async function createVideo(params: VideoRequest): Promise<{ videoId: string }> {
  const response = await fetch(`${HEYGEN_API_BASE}/video/generate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: params.avatarId ?? "default",
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: params.script,
            voice_id: params.voiceId ?? "en-US-professional",
          },
          background: params.backgroundUrl
            ? { type: "image", url: params.backgroundUrl }
            : { type: "color", value: "#1a1a1a" },
        },
      ],
      dimension: params.aspectRatio === "9:16"
        ? { width: 1080, height: 1920 }
        : params.aspectRatio === "1:1"
        ? { width: 1080, height: 1080 }
        : { width: 1920, height: 1080 },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`HeyGen error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return { videoId: data.data?.video_id ?? data.video_id };
}

/**
 * Check video generation status.
 */
export async function getVideoStatus(videoId: string): Promise<VideoResult> {
  const response = await fetch(`${HEYGEN_API_BASE}/video_status.get?video_id=${videoId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get video status: ${response.status}`);
  }

  const data = await response.json();
  const videoData = data.data ?? data;

  return {
    videoId,
    status: videoData.status ?? "pending",
    videoUrl: videoData.video_url ?? null,
    thumbnailUrl: videoData.thumbnail_url ?? null,
    duration: videoData.duration ?? null,
  };
}

/**
 * Wait for video generation to complete (polls every 10 seconds, max 5 minutes).
 */
export async function waitForVideo(videoId: string): Promise<VideoResult> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const result = await getVideoStatus(videoId);
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  return {
    videoId,
    status: "failed",
    videoUrl: null,
    thumbnailUrl: null,
    duration: null,
  };
}
