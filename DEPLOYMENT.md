# Twinova AI — Deployment (Vercel)

The app has **no Lovable AI dependency**. AI chat, insights, and speech-to-text
call **Google Gemini** directly with your own key; text-to-speech uses **Gnani.ai**.

## Required environment variables

| Variable | Where used | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | `/api/chat`, insights server fn | **Primary AI key** (Google AI Studio). Server-only. Takes priority over OpenAI. |
| `GEMINI_CHAT_MODEL` | chat + insights | Optional. Defaults to `gemini-2.5-flash`. |
| `OPENAI_API_KEY` | `/api/stt`, chat fallback | Optional. Only needed for voice input (speech-to-text) or if you prefer OpenAI for chat. |
| `OPENAI_CHAT_MODEL` | chat + insights | Optional. Defaults to `gpt-4o` (only used when no Gemini key). |
| `OPENAI_STT_MODEL` | `/api/stt` | Optional. Defaults to `gpt-4o-mini-transcribe`. |
| `GNANI_API_KEY` | `/api/tts`, `/api/gnani-tts` | Gnani.ai (Vachana) key. Only voice output needs it. |
| `SUPABASE_URL` | `/api/chat` server client | Same value as `VITE_SUPABASE_URL`. |
| `SUPABASE_PUBLISHABLE_KEY` | `/api/chat` server client | Same value as `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `VITE_SUPABASE_URL` | browser client | Exposed to the client (safe). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser client | Publishable key (safe). |
| `VITE_SUPABASE_PROJECT_ID` | browser client | Optional. |

`LOVABLE_API_KEY` is optional: when set, any Gemini/OpenAI failure (bad key, no quota) transparently falls back to the built-in AI gateway.

Add each variable in Vercel → Project → Settings → Environment Variables for
Production, Preview, and Development, then redeploy (env changes need a new build).

## Diagnosing failures

Server logs are single-line JSON with a `scope` field so you can tell where a
failure came from:

- `{"scope":"gemini",...}` — Gemini rejected or failed the request (bad/missing key, quota, model error)
- `{"scope":"openai",...}` — OpenAI rejected or failed the request (bad/missing key, quota, model error)
- `{"scope":"gnani",...}` — voice (TTS) provider problem
- `{"scope":"supabase",...}` — auth or database problem
- `{"scope":"network",...}` — outbound fetch threw (DNS/timeout)

In the browser console, chat failures log as `[twinova/chat] request failed`
with an `offline` flag. The UI only says "No internet connection" when
`navigator.onLine === false`; every other failure shows
"Unable to reach the AI service. Please try again."
