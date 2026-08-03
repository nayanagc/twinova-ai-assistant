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

const FALLBACK_CHAT_MODEL = "openai/gpt-5.6-terra";

/**
 * Fetch that talks to OpenAI first, and transparently retries on the built-in
 * (keyless) AI gateway when OpenAI rejects the key or the account is out of
 * quota — so chat keeps working instead of hard-failing.
 */
async function openAiWithFallbackFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.ok) return res;

  const lovableKey = process.env.LOVABLE_API_KEY;
  const retryable = [401, 402, 403, 429].includes(res.status) || res.status >= 500;
  const bodyText = await res.clone().text().catch(() => "");
  const quota = bodyText.includes("insufficient_quota") || bodyText.includes("exceeded your current quota");

  if (!lovableKey || (!retryable && !quota)) {
    logAi("openai", "OpenAI request failed", { status: res.status, body: bodyText.slice(0, 300) });
    return res;
  }

  logAi("openai", "OpenAI unavailable — falling back to built-in AI", {
    status: res.status,
    quota,
  });

  const url = new URL(String(input instanceof Request ? input.url : input));
  const path = url.pathname.replace(/^\/v1/, "");
  let body = init?.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      parsed.model = FALLBACK_CHAT_MODEL;
      parsed.reasoning_effort = "none";
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

  return fetch(`https://ai.gateway.lovable.dev/v1${path}`, { ...init, headers, body });
}

export function createAiProvider(apiKey: string) {
  if (hasOpenAi()) {
    return createOpenAICompatible({
      name: "openai",
      baseURL: "https://api.openai.com/v1",
      headers: { Authorization: `Bearer ${apiKey}` },
      includeUsage: true,
      supportsStructuredOutputs: true,
      fetch: openAiWithFallbackFetch,
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
