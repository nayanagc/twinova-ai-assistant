import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import {
  createGeminiProvider,
  getGeminiApiKey,
  GEMINI_CHAT_MODEL,
  logAi,
} from "./gemini.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InsightsPayload = {
  weekly: {
    completedThisWeek: number;
    completedLastWeek: number;
    changePct: number;
    mostProductiveDay: string;
    delayedCategory: string;
  };
  procrastination: {
    score: number;
    level: "Low" | "Medium" | "High";
  };
  mood: Array<{ mood: string; completionRate: number; sampleSize: number }>;
};

export const generateInsightRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => data as InsightsPayload)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `You are Twinova, a concise productivity coach. Based on this user's data, output STRICT JSON with three short recommendations (each 1-2 sentences, warm and specific, no markdown):

Data:
${JSON.stringify(data, null, 2)}

Return JSON exactly like:
{"weekly":"...","procrastination":"...","mood":"..."}`;

    try {
      const { text } = await generateText({
        model: gateway(DEFAULT_CHAT_MODEL),
        prompt,
      });
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          weekly: String(parsed.weekly ?? ""),
          procrastination: String(parsed.procrastination ?? ""),
          mood: String(parsed.mood ?? ""),
        };
      }
    } catch (e) {
      // fall through to fallback
    }
    return {
      weekly: "Aim for a consistent morning focus block next week to lift your completion rate.",
      procrastination: "Break your largest open task into 25-minute chunks and start with just the first one.",
      mood: "Log your mood daily — it will reveal which conditions unlock your best work.",
    };
  });
