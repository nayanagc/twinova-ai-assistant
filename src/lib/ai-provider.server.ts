import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * OpenAI, called directly with the project's own key. No Lovable AI Gateway involved.
 *
 * Required env var (set it in Vercel → Project → Settings → Environment Variables):
 *   OPENAI_API_KEY
 * Optional:
 *   OPENAI_CHAT_MODEL (defaults to gpt-4o)
 */
export const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export class MissingAiKeyError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured on the server");
    this.name = "MissingAiKeyError";
  }
}

export function getAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new MissingAiKeyError();
  return key;
}

export function createAiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai",
    baseURL: OPENAI_BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/** Structured server-side log helper so failures are attributable. */
export function logAi(
  scope: "openai" | "supabase" | "network" | "chat" | "gnani",
  message: string,
  meta?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), scope, message, ...(meta ?? {}) }),
  );
}
