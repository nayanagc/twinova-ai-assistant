import { createFileRoute } from "@tanstack/react-router";
import { getGeminiApiKey, logAi } from "@/lib/gemini.server";

/** Speech-to-text via Google Gemini (audio understanding). No Lovable AI dependency. */
export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        let apiKey: string;
        try {
          apiKey = getGeminiApiKey();
        } catch {
          logAi("gemini", "GEMINI_API_KEY missing for STT");
          return new Response("AI service is not configured (missing GEMINI_API_KEY).", {
            status: 500,
          });
        }

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });

        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        const base64 = btoa(binary);
        const mimeType = file.type || "audio/webm";

        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: "Transcribe this audio verbatim. Return only the transcript text, no commentary.",
                      },
                      { inline_data: { mime_type: mimeType, data: base64 } },
                    ],
                  },
                ],
              }),
            },
          );

          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            logAi("gemini", "STT request failed", { status: res.status, detail: detail.slice(0, 500) });
            return new Response("Unable to reach the AI service. Please try again.", {
              status: 502,
            });
          }

          const data = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text =
            data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
          return Response.json({ text });
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
