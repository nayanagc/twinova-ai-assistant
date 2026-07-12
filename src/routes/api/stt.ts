import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });
        const upstream = new FormData();
        upstream.append("file", file, "recording.webm");
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });
        if (!res.ok) return new Response(await res.text(), { status: res.status });
        const data = await res.json();
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});
