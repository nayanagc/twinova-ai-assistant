import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { text, voice = "alloy" } = (await request.json()) as { text?: string; voice?: string };
        if (!text) return new Response("Missing text", { status: 400 });
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            voice,
            input: text,
            response_format: "mp3",
          }),
        });
        if (!res.ok) return new Response(await res.text(), { status: res.status });
        return new Response(res.body, { headers: { "Content-Type": "audio/mpeg" } });
      },
    },
  },
});
