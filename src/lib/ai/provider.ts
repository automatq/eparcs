/**
 * Unified AI Provider
 *
 * Single function to call whichever AI is configured.
 * Defaults to OpenAI. Falls back to Anthropic if OpenAI isn't available.
 */

import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function aiComplete(params: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const openai = getOpenAI();

  const messages: any[] = [];
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  messages.push({ role: "user", content: params.prompt });

  const response = await openai.chat.completions.create({
    model: params.model ?? "o4-mini",
    messages,
    max_completion_tokens: params.maxTokens ?? 1024,
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Helper to parse JSON from AI response.
 * Handles markdown code blocks and extracts the JSON object/array.
 */
export function parseAIJson<T>(text: string): T | null {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Extract JSON from markdown or surrounding text
    const jsonMatch = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
