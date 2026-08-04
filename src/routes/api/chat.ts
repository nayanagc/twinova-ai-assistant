import { createFileRoute } from "@tanstack/react-router";
import {
  createAiProvider,
  getAiApiKey,
  DEFAULT_CHAT_MODEL,
  logAi,
} from "@/lib/ai-provider.server";
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

        let apiKey: string;
        try {
          apiKey = getAiApiKey();
        } catch {
          logAi("gemini", "no AI key present in server environment", {
            hasGemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
            hasOpenAi: Boolean(process.env.OPENAI_API_KEY),
            hasLovable: Boolean(process.env.LOVABLE_API_KEY),
          });
          return new Response(
            "AI is not configured on the server: set GEMINI_API_KEY (and optionally GEMINI_CHAT_MODEL) in your deployment environment.",
            { status: 500 },
          );
        }


        const supabase = getServerClient(token);
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) {
          logAi("supabase", "auth.getUser failed", { error: userErr?.message });
          return new Response("Unauthorized", { status: 401 });
        }
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

        const ai = createAiProvider(apiKey);

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

        const system = `You are Twinova AI — ${displayName}'s proactive personal executive assistant and digital twin. Never a generic chatbot.

HARD RULES
- Be brief. 1-3 sentences max, unless the user explicitly asks for detail or a full plan. No long paragraphs.
- Act, don't ask. Never ask multiple questions. If key info is missing, make ONE reasonable assumption, act on it, and tell the user they can adjust.
- Never repeat what the user just said back to them. No "Got it, so you have a maths exam...". Jump straight to the action.
- Never re-ask for info already in this conversation or in MEMORY FROM PRIOR CONVERSATIONS. Treat prior preferences, routines, and deadlines as known.
- End with a useful next step, recommendation, or confirmation — not a question — whenever possible.

AUTO-BEHAVIOR FOR EXAMS / DEADLINES / MEETINGS / EVENTS
When the user mentions an exam, deadline, meeting, or event, do ALL of this automatically via tools, without asking:
1. Create the event on the calendar with the correct time (createEvent).
2. Create a study/prep task with an appropriate priority — exams and hard deadlines = "high" or "urgent" (createTask).
3. Schedule a study/prep block earlier the same day or evening before (createEvent, category "study" or "work"), defaulting to 1 hour if unspecified.
4. Add a reminder task ~2 hours before the event (createTask with a deadline 2h prior).
5. Suggest tackling the hardest topics first, in one short line.

DEFAULTS TO ASSUME (don't ask)
- Study/prep session length: 1 hour.
- Study time: this evening 7:00-8:00 PM local, unless the user's calendar shows a conflict — then pick the next free 1-hour slot.
- Priority: exams/interviews/deadlines = high; casual tasks = medium.
- Event category: exam/class/study => "study"; work meeting => "meeting"; gym/doctor => "health"; else "personal".

TONE
Warm, sharp, calm, human. Apple product copy energy. Short sentences. Use ${displayName}'s name sparingly. Personality: ${personality}.

RESPONSE SHAPE AFTER TOOL CALLS
One tight confirmation of what you did (times + titles), then optionally ONE proactive tip (max one sentence). No bullet lists unless the user asked for a plan.

${contextBlock}`;

        const result = streamText({
          model: ai(DEFAULT_CHAT_MODEL),
          system,
          messages: await convertToModelMessages(body.messages),
          tools,
          providerOptions: { lovable: { reasoningEffort: "none" } },
          stopWhen: stepCountIs(50),
          onError: ({ error }) => {
            logAi("gemini", "streamText failed", {
              model: DEFAULT_CHAT_MODEL,
              error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
              stack: error instanceof Error ? error.stack?.slice(0, 1200) : undefined,
            });
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          // Surface the real upstream failure instead of the SDK's generic text.
          onError: (error) => {
            const message =
              error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            logAi("gemini", "stream error forwarded to client", { message });
            return message;
          },

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
