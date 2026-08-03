import { createFileRoute } from "@tanstack/react-router";
import {
  getAiApiKey,
  getAiBaseUrl,
  getAiAuthHeaders,
  DEFAULT_STT_MODEL,
  logAi,
} from "@/lib/ai-provider.server";

/** Speech-to-text via OpenAI transcriptions. No Lovable AI dependency. */
export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        let apiKey: string;
        try {
          apiKey = getAiApiKey();
        } catch {
          logAi("openai", "OPENAI_API_KEY missing for STT");
          return new Response("AI service is not configured (missing OPENAI_API_KEY).", {
            status: 500,
          });
        }

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });

        const upstreamForm = new FormData();
        upstreamForm.append("file", file, "recording.webm");
        upstreamForm.append("model", DEFAULT_STT_MODEL);

        try {
          const res = await fetch(`${getAiBaseUrl()}/audio/transcriptions`, {
            method: "POST",
            headers: getAiAuthHeaders(apiKey),
            body: upstreamForm,
          });

          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            logAi("openai", "STT request failed", {
              status: res.status,
              detail: detail.slice(0, 500),
            });
            return new Response("Unable to reach the AI service. Please try again.", {
              status: 502,
            });
          }

          const data = (await res.json()) as { text?: string };
          return Response.json({ text: data.text ?? "" });
        } catch (e) {
          logAi("network", "STT fetch threw", {
            error: e instanceof Error ? e.message : String(e),
          });
          return new Response("Unable to reach the AI service. Please try again.", {
            status: 502,
          });
        }
      },
    },
  },
});
