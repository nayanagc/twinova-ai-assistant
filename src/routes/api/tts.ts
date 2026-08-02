import { createFileRoute } from "@tanstack/react-router";

/** Text-to-speech via Gnani.ai (Vachana). No Lovable AI dependency. */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env.GNANI_API_KEY;
        if (!apiKey) {
          console.log(JSON.stringify({ scope: "gnani", message: "GNANI_API_KEY missing" }));
          return new Response("Voice service is not configured (missing GNANI_API_KEY).", {
            status: 500,
          });
        }

        const { text, voice = "Karan" } = (await request.json()) as {
          text?: string;
          voice?: string;
        };
        if (!text?.trim()) return new Response("Missing text", { status: 400 });

        try {
          const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
            method: "POST",
            headers: { "X-API-Key-ID": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              audio_config: {
                bitrate: "192k",
                container: "mp3",
                encoding: "linear_pcm",
                num_channels: 1,
                sample_rate: 44100,
                sample_width: 2,
              },
              model: "vachana-voice-v3",
              text: text.slice(0, 2000),
              voice,
            }),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            console.log(
              JSON.stringify({
                scope: "gnani",
                message: "TTS failed",
                status: res.status,
                detail: detail.slice(0, 300),
              }),
            );
            return new Response("Unable to reach the voice service. Please try again.", {
              status: 502,
            });
          }
          return new Response(res.body, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
          });
        } catch (e) {
          console.log(
            JSON.stringify({
              scope: "network",
              message: "TTS fetch threw",
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          return new Response("Unable to reach the voice service. Please try again.", {
            status: 502,
          });
        }
      },
    },
  },
});
