import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Google Gemini only. No Lovable AI Gateway involved.
 * Uses Gemini's OpenAI-compatible endpoint so the AI SDK can talk to it directly.
 *
 * Required env var (set it in Vercel → Project → Settings → Environment Variables):
 *   GEMINI_API_KEY
 */
export const GEMINI_CHAT_MODEL = "gemini-2.5-pro";

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not configured on the server");
    this.name = "MissingGeminiKeyError";
  }
}

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new MissingGeminiKeyError();
  return key;
}

export function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "gemini",
    baseURL: GEMINI_BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/** Structured server-side log helper so failures are attributable. */
export function logAi(
  scope: "gemini" | "supabase" | "network" | "chat",
  message: string,
  meta?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), scope, message, ...(meta ?? {}) }),
  );
}
