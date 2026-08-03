import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * AI provider for Twinova.
 *
 * Default: Lovable AI Gateway (keyless — LOVABLE_API_KEY is provisioned automatically).
 * Optional override for self-hosting (e.g. Vercel): set OPENAI_API_KEY and the calls
 * go straight to OpenAI instead.
 */
const hasOpenAi = () => Boolean(process.env.OPENAI_API_KEY);

export const DEFAULT_CHAT_MODEL = hasOpenAi()
  ? process.env.OPENAI_CHAT_MODEL || "gpt-4o"
  : "openai/gpt-5.6-terra";

export class MissingAiKeyError extends Error {
  constructor() {
    super("No AI key configured (LOVABLE_API_KEY or OPENAI_API_KEY)");
    this.name = "MissingAiKeyError";
  }
}

export function getAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY || process.env.LOVABLE_API_KEY;
  if (!key) throw new MissingAiKeyError();
  return key;
}

export function createAiProvider(apiKey: string) {
  if (hasOpenAi()) {
    return createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
      includeUsage: true,
      supportsStructuredOutputs: true,
    });
  }
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
    includeUsage: true,
    supportsStructuredOutputs: true,
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

/** Base URL for raw REST calls (STT etc.). */
export function getAiBaseUrl(): string {
  return hasOpenAi() ? "https://api.openai.com/v1" : "https://ai.gateway.lovable.dev/v1";
}

/** Auth headers for raw REST calls. */
export function getAiAuthHeaders(apiKey: string): Record<string, string> {
  return hasOpenAi()
    ? { Authorization: `Bearer ${apiKey}` }
    : { "Lovable-API-Key": apiKey };
}

/** Speech-to-text model id for the active provider. */
export const DEFAULT_STT_MODEL = hasOpenAi()
  ? process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe"
  : "openai/gpt-4o-transcribe";
