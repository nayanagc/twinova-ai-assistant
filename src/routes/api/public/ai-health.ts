import { createFileRoute } from "@tanstack/react-router";

/**
 * Diagnostics for the AI chat stack. Reports which env vars the *server* can
 * actually see and whether a live model call succeeds. Never returns key values.
 * GET /api/public/ai-health
 */
export const Route = createFileRoute("/api/public/ai-health")({
  server: {
    handlers: {
      GET: async () => {
        const present = (name: string) => Boolean(process.env[name]);
        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        const model = process.env["GEMINI_CHAT_MODEL"] || "gemini-flash-latest";

        const env = {
          GEMINI_API_KEY: present("GEMINI_API_KEY") || present("GOOGLE_API_KEY"),
          GEMINI_CHAT_MODEL: process.env["GEMINI_CHAT_MODEL"] ?? "(default) gemini-flash-latest",
          OPENAI_API_KEY: present("OPENAI_API_KEY"),
          LOVABLE_API_KEY: present("LOVABLE_API_KEY"),
          GNANI_API_KEY: present("GNANI_API_KEY"),
          SUPABASE_URL: present("SUPABASE_URL"),
          SUPABASE_PUBLISHABLE_KEY: present("SUPABASE_PUBLISHABLE_KEY"),
        };

        let gemini: Record<string, unknown> = { attempted: false };
        if (geminiKey) {
          try {
            const res = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${geminiKey}`,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  model,
                  messages: [{ role: "user", content: "ping" }],
                }),
              },
            );
            const text = await res.text();
            gemini = {
              attempted: true,
              model,
              status: res.status,
              ok: res.ok,
              ...(res.ok ? {} : { body: text.slice(0, 500) }),
            };
          } catch (e) {
            gemini = {
              attempted: true,
              model,
              networkError: e instanceof Error ? e.message : String(e),
            };
          }
        }

        return Response.json(
          { at: new Date().toISOString(), env, gemini },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
