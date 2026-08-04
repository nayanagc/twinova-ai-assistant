import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * AI provider for Twinova.
 *
 * Priority:
 *  1. Google Gemini  — GEMINI_API_KEY (or GOOGLE_API_KEY), via Google's OpenAI-compatible endpoint
 *  2. OpenAI         — OPENAI_API_KEY
 *  3. Built-in keyless AI gateway — LOVABLE_API_KEY (auto-provisioned in Lovable)
 *
 * Any upstream failure (bad key, no quota, 5xx) transparently retries on the
 * built-in gateway so chat keeps working.
 */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const LOVABLE_BASE_URL = "https://ai.gateway.lovable.dev/v1";

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const hasGemini = () => Boolean(geminiKey());
const hasOpenAi = () => !hasGemini() && Boolean(process.env.OPENAI_API_KEY);

export const DEFAULT_CHAT_MODEL = hasGemini()
  ? process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash"
  : hasOpenAi()
    ? process.env.OPENAI_CHAT_MODEL || "gpt-4o"
    : "google/gemini-3.6-flash";

export class MissingAiKeyError extends Error {
  constructor() {
    super("No AI key configured (GEMINI_API_KEY, OPENAI_API_KEY or LOVABLE_API_KEY)");
    this.name = "MissingAiKeyError";
  }
}

export function getAiApiKey(): string {
  const key = geminiKey() || process.env.OPENAI_API_KEY || process.env.LOVABLE_API_KEY;
  if (!key) throw new MissingAiKeyError();
  return key;
}

const FALLBACK_CHAT_MODEL = "google/gemini-3.6-flash";

/**
 * Fetch that talks to the primary provider first, and transparently retries on
 * the built-in (keyless) AI gateway when the key is rejected / out of quota.
 */
function withFallbackFetch(scope: "gemini" | "openai") {
  return async function fallbackFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await fetch(input, init);
    if (res.ok) return res;

    const lovableKey = process.env.LOVABLE_API_KEY;
    const retryable = [401, 402, 403, 429].includes(res.status) || res.status >= 500;
    const bodyText = await res.clone().text().catch(() => "");
    const quota =
      bodyText.includes("insufficient_quota") ||
      bodyText.includes("exceeded your current quota") ||
      bodyText.includes("RESOURCE_EXHAUSTED");

    if (!lovableKey || (!retryable && !quota)) {
      logAi(scope, "AI request failed", { status: res.status, body: bodyText.slice(0, 300) });
      return res;
    }

    logAi(scope, "primary AI unavailable — falling back to built-in AI", {
      status: res.status,
      quota,
    });

    const url = new URL(String(input instanceof Request ? input.url : input));
    const path = url.pathname.replace(/^\/v1beta\/openai/, "").replace(/^\/v1/, "");
    let body = init?.body;
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed.model = FALLBACK_CHAT_MODEL;
        delete parsed.reasoning_effort;
        delete parsed.max_tokens;
        delete parsed.temperature;
        body = JSON.stringify(parsed);
      } catch {
        /* leave body as-is */
      }
    }

    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.set("Lovable-API-Key", lovableKey);

    return fetch(`${LOVABLE_BASE_URL}${path}`, { ...init, headers, body });
  };
}

export function createAiProvider(apiKey: string) {
  if (hasGemini()) {
    return createOpenAICompatible({
      name: "gemini",
      baseURL: GEMINI_BASE_URL,
      headers: { Authorization: `Bearer ${apiKey}` },
      includeUsage: true,
      supportsStructuredOutputs: true,
      fetch: withFallbackFetch("gemini"),
    });
  }
  if (hasOpenAi()) {
    return createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
      includeUsage: true,
      supportsStructuredOutputs: true,
      fetch: withFallbackFetch("openai"),
    });
  }
  return createOpenAICompatible({
    name: "lovable",
    baseURL: LOVABLE_BASE_URL,
    headers: { "Lovable-API-Key": apiKey },
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
}

/** Structured server-side log helper so failures are attributable. */
export function logAi(
  scope: "openai" | "gemini" | "supabase" | "network" | "chat" | "gnani",
  message: string,
  meta?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), scope, message, ...(meta ?? {}) }),
  );
}

/**
 * Base URL + headers for raw REST calls (speech-to-text).
 * Gemini's OpenAI-compatible surface has no /audio/transcriptions, so STT keeps
 * using OpenAI when available, otherwise the built-in gateway.
 */
function sttProvider(): { baseUrl: string; key?: string; lovable: boolean } {
  const openai = process.env.OPENAI_API_KEY;
  if (openai) return { baseUrl: "https://api.openai.com/v1", key: openai, lovable: false };
  return { baseUrl: LOVABLE_BASE_URL, key: process.env.LOVABLE_API_KEY, lovable: true };
}

export function getAiBaseUrl(): string {
  return sttProvider().baseUrl;
}

export function getAiAuthHeaders(_apiKey: string): Record<string, string> {
  const p = sttProvider();
  return p.lovable
    ? { "Lovable-API-Key": p.key ?? "" }
    : { Authorization: `Bearer ${p.key ?? ""}` };
}

/** Speech-to-text model id for the active provider. */
export const DEFAULT_STT_MODEL = process.env.OPENAI_API_KEY
  ? process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe"
  : "openai/gpt-4o-transcribe";
