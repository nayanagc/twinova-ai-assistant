import { createFileRoute } from "@tanstack/react-router";
import { createLovableAiGatewayProvider, DEFAULT_CHAT_MODEL } from "@/lib/ai-gateway.server";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

type ChatBody = { messages?: UIMessage[]; threadId?: string };

function getServerClient(bearerToken: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${bearerToken}`);
        return fetch(input as string, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer "))
          return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);
        if (token.split(".").length !== 3)
          return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = getServerClient(token);
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user)
          return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages))
          return new Response("Bad request", { status: 400 });

        // Load context: tasks, events, recent activity, prior conversations (cross-thread memory)
        const now = new Date();
        const in7d = new Date(now.getTime() + 7 * 86400000);
        const past7d = new Date(now.getTime() - 7 * 86400000).toISOString();
        const [
          { data: tasks },
          { data: events },
          { data: profile },
          { data: recentDone },
          { data: moods },
          { data: recentMessages },
        ] = await Promise.all([
          supabase.from("tasks").select("id,title,priority,status,deadline,description").order("deadline", { nullsFirst: false }),
          supabase.from("events").select("id,title,category,start_time,end_time,description")
            .gte("start_time", now.toISOString()).lte("start_time", in7d.toISOString()).order("start_time"),
          supabase.from("profiles").select("display_name,ai_personality").eq("id", userId).maybeSingle(),
          supabase.from("tasks").select("title,completed_at,priority")
            .eq("status", "done").gte("completed_at", past7d).order("completed_at", { ascending: false }).limit(15),
          supabase.from("mood_logs").select("mood,note,logged_at")
            .gte("logged_at", past7d).order("logged_at", { ascending: false }).limit(10),
          supabase.from("messages").select("role,content,created_at,thread_id")
            .neq("thread_id", body.threadId ?? "00000000-0000-0000-0000-000000000000")
            .order("created_at", { ascending: false }).limit(20),
        ]);

        const displayName = profile?.display_name ?? "there";
        const personality = profile?.ai_personality ?? "friendly";
        const contextBlock = `
CURRENT DATE/TIME: ${now.toISOString()}
USER NAME: ${displayName}
AI PERSONALITY: ${personality}

UPCOMING TASKS (${(tasks ?? []).filter((t) => t.status !== "done").length}):
${(tasks ?? [])
  .filter((t) => t.status !== "done")
  .slice(0, 30)
  .map((t) => `- [${t.priority}] ${t.title}${t.deadline ? ` (due ${t.deadline})` : ""}${t.description ? ` — ${t.description}` : ""}`)
  .join("\n") || "(none)"}

UPCOMING EVENTS (next 7 days, ${events?.length ?? 0}):
${(events ?? [])
  .map((e) => `- ${e.start_time} → ${e.end_time} [${e.category}] ${e.title}`)
  .join("\n") || "(none)"}

RECENTLY COMPLETED (last 7 days):
${(recentDone ?? [])
  .map((t) => `- ${t.title} [${t.priority}] @ ${t.completed_at}`)
  .join("\n") || "(none)"}

RECENT MOOD LOGS:
${(moods ?? [])
  .map((m) => `- ${m.logged_at}: ${m.mood}${m.note ? ` — ${m.note}` : ""}`)
  .join("\n") || "(none)"}

MEMORY FROM PRIOR CONVERSATIONS (other threads, most recent first — use to remember preferences, routines, and ongoing projects):
${(recentMessages ?? [])
  .slice(0, 20)
  .map((m) => `- [${m.role}] ${(m.content ?? "").slice(0, 240)}`)
  .join("\n") || "(none)"}
`.trim();

        const gateway = createLovableAiGatewayProvider(apiKey);

        const tools = {
          createTask: tool({
            description: "Create a new task for the user.",
            inputSchema: z.object({
              title: z.string(),
              description: z.string().optional(),
              priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
              deadline: z.string().optional().describe("ISO 8601 datetime"),
              estimated_minutes: z.number().int().optional(),
            }),
            execute: async (input) => {
              const { data, error } = await supabase
                .from("tasks")
                .insert({
                  user_id: userId,
                  title: input.title,
                  description: input.description ?? null,
                  priority: input.priority,
                  deadline: input.deadline ?? null,
                  estimated_minutes: input.estimated_minutes ?? null,
                })
                .select("id,title")
                .single();
              if (error) return { ok: false, error: error.message };
              return { ok: true, task: data };
            },
          }),
          completeTask: tool({
            description: "Mark a task as done by its title (case-insensitive contains match) or id.",
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => {
              const { data: matches } = await supabase
                .from("tasks")
                .select("id,title")
                .or(`id.eq.${isUuid(query) ? query : "00000000-0000-0000-0000-000000000000"},title.ilike.%${query}%`)
                .limit(1);
              const target = matches?.[0];
              if (!target) return { ok: false, error: "No matching task" };
              const { error } = await supabase
                .from("tasks")
                .update({ status: "done", completed_at: new Date().toISOString() })
                .eq("id", target.id);
              if (error) return { ok: false, error: error.message };
              return { ok: true, task: target };
            },
          }),
          deleteTask: tool({
            description: "Delete a task by title match.",
            inputSchema: z.object({ query: z.string() }),
            execute: async ({ query }) => {
              const { data: matches } = await supabase
                .from("tasks")
                .select("id,title")
                .ilike("title", `%${query}%`)
                .limit(1);
              const t = matches?.[0];
              if (!t) return { ok: false, error: "No matching task" };
              const { error } = await supabase.from("tasks").delete().eq("id", t.id);
              if (error) return { ok: false, error: error.message };
              return { ok: true, deleted: t };
            },
          }),
          createEvent: tool({
            description: "Create a calendar event.",
            inputSchema: z.object({
              title: z.string(),
              start_time: z.string().describe("ISO 8601"),
              end_time: z.string().describe("ISO 8601"),
              category: z.enum(["work", "meeting", "study", "health", "personal"]).default("work"),
              description: z.string().optional(),
            }),
            execute: async (input) => {
              const { data, error } = await supabase
                .from("events")
                .insert({
                  user_id: userId,
                  title: input.title,
                  start_time: input.start_time,
                  end_time: input.end_time,
                  category: input.category,
                  description: input.description ?? null,
                })
                .select("id,title")
                .single();
              if (error) return { ok: false, error: error.message };
              return { ok: true, event: data };
            },
          }),
          logMood: tool({
            description: "Log the user's current mood.",
            inputSchema: z.object({
              mood: z.enum(["happy", "neutral", "sad", "tired", "angry"]),
              note: z.string().optional(),
            }),
            execute: async (input) => {
              const { error } = await supabase.from("mood_logs").insert({
                user_id: userId,
                mood: input.mood,
                note: input.note ?? null,
              });
              if (error) return { ok: false, error: error.message };
              return { ok: true };
            },
          }),
        };

        const system = `You are Twinova AI, a warm, sharp, executive assistant.
Speak like Apple product copy: clear, calm, human. Never robotic. Use short sentences and bullet lists where helpful.

You have live access to the user's tasks and schedule via tools. Prefer tools over asking clarifying questions when the user's intent is clear.
When creating tasks/events, infer sensible defaults (priority, times) and confirm briefly after.

If the user asks about their schedule, summarize from the context below.
If the user asks you to plan their day, produce a concise plan with time blocks referencing their real events and tasks.
Offer 1 short predictive insight when relevant (patterns, risks, focus windows).

${contextBlock}`;

        const result = streamText({
          model: gateway(DEFAULT_CHAT_MODEL),
          system,
          messages: await convertToModelMessages(body.messages),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          onFinish: async ({ messages }) => {
            if (!body.threadId) return;
            const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
            const lastUser = [...messages].reverse().find((m) => m.role === "user");
            const inserts: Array<Record<string, unknown>> = [];
            if (lastUser) {
              inserts.push({
                thread_id: body.threadId,
                user_id: userId,
                role: "user",
                content: extractText(lastUser),
                parts: lastUser.parts as unknown as never,
              });
            }
            if (lastAssistant) {
              inserts.push({
                thread_id: body.threadId,
                user_id: userId,
                role: "assistant",
                content: extractText(lastAssistant),
                parts: lastAssistant.parts as unknown as never,
              });
            }
            if (inserts.length) {
              await (supabase.from("messages") as unknown as { insert: (rows: unknown) => Promise<unknown> }).insert(inserts);
              await supabase
                .from("threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", body.threadId);
            }
          },
        });
      },
    },
  },
});

function extractText(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
