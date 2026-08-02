# Twinova AI — Deployment (Vercel)

The app has **no Lovable AI dependency**. AI chat, insights, and speech-to-text
call **OpenAI directly** with your own key; text-to-speech uses **Gnani.ai**.

## Required environment variables

| Variable | Where used | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | `/api/chat`, `/api/stt`, insights server fn | Your OpenAI key. Server-only. Required for AI chat. |
| `OPENAI_CHAT_MODEL` | chat + insights | Optional. Defaults to `gpt-4o`. |
| `OPENAI_STT_MODEL` | `/api/stt` | Optional. Defaults to `gpt-4o-mini-transcribe`. |
| `GNANI_API_KEY` | `/api/tts`, `/api/gnani-tts` | Gnani.ai (Vachana) key. Only voice output needs it. |
| `SUPABASE_URL` | `/api/chat` server client | Same value as `VITE_SUPABASE_URL`. |
| `SUPABASE_PUBLISHABLE_KEY` | `/api/chat` server client | Same value as `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `VITE_SUPABASE_URL` | browser client | Exposed to the client (safe). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser client | Publishable key (safe). |
| `VITE_SUPABASE_PROJECT_ID` | browser client | Optional. |

`LOVABLE_API_KEY` is **no longer used anywhere** — you can delete it from Vercel.

Add each variable in Vercel → Project → Settings → Environment Variables for
Production, Preview, and Development, then redeploy (env changes need a new build).

## Diagnosing failures

Server logs are single-line JSON with a `scope` field so you can tell where a
failure came from:

- `{"scope":"openai",...}` — OpenAI rejected or failed the request (bad/missing key, quota, model error)
- `{"scope":"gnani",...}` — voice (TTS) provider problem
- `{"scope":"supabase",...}` — auth or database problem
- `{"scope":"network",...}` — outbound fetch threw (DNS/timeout)

In the browser console, chat failures log as `[twinova/chat] request failed`
with an `offline` flag. The UI only says "No internet connection" when
`navigator.onLine === false`; every other failure shows
"Unable to reach the AI service. Please try again."
