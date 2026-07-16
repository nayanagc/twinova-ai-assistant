import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gnani-tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GNANI_API_KEY;
        if (!apiKey) {
          return new Response("Gnani API key not configured", { status: 500 });
        }
        let text = "";
        try {
          const body = await request.json();
          text = String(body?.text ?? "").slice(0, 2000);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!text.trim()) return new Response("Missing text", { status: 400 });

        const upstream = await fetch(
          "https://api.vachana.ai/api/v1/tts/inference",
          {
            method: "POST",
            headers: {
              "X-API-Key-ID": apiKey,
              "Content-Type": "application/json",
            },
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
              text,
              voice: "Karan",
            }),
          },
        );

        if (!upstream.ok) {
          const msg = await upstream.text().catch(() => "");
          return new Response(`Gnani TTS failed: ${upstream.status} ${msg}`, {
            status: 502,
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
