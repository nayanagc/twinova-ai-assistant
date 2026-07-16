import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Brain,
  Smile,
  Meh,
  Frown,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  differenceInHours,
} from "date-fns";
import { toast } from "sonner";
import { generateInsightRecommendations } from "@/lib/insights.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
});

const MOODS = [
  { key: "happy", label: "Happy", icon: Smile, color: "text-emerald-500" },
  { key: "neutral", label: "Neutral", icon: Meh, color: "text-amber-500" },
  { key: "stressed", label: "Stressed", icon: Frown, color: "text-rose-500" },
] as const;

function InsightsPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*");
      return data ?? [];
    },
  });

  const { data: moods = [] } = useQuery({
    queryKey: ["moods", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("mood_logs")
        .select("*")
        .order("logged_at", { ascending: false });
      return data ?? [];
    },
  });

  const logMood = useMutation({
    mutationFn: async (mood: string) => {
      const { error } = await supabase
        .from("mood_logs")
        .insert({ user_id: user.id, mood });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moods", user.id] });
      toast.success("Mood logged");
    },
    onError: (e) => toast.error(e.message),
  });

  // ===== Weekly report metrics =====
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = endOfWeek(now);
  const lastWeekStart = startOfWeek(subWeeks(now, 1));
  const lastWeekEnd = endOfWeek(subWeeks(now, 1));

  const completedThisWeek = tasks.filter(
    (t) =>
      t.completed_at &&
      new Date(t.completed_at) >= thisWeekStart &&
      new Date(t.completed_at) <= thisWeekEnd,
  );
  const completedLastWeek = tasks.filter(
    (t) =>
      t.completed_at &&
      new Date(t.completed_at) >= lastWeekStart &&
      new Date(t.completed_at) <= lastWeekEnd,
  );

  const changePct =
    completedLastWeek.length === 0
      ? completedThisWeek.length > 0
        ? 100
        : 0
      : Math.round(
          ((completedThisWeek.length - completedLastWeek.length) /
            completedLastWeek.length) *
            100,
        );

  // Most productive day (this week)
  const dayCounts: Record<string, number> = {};
  completedThisWeek.forEach((t) => {
    const d = format(new Date(t.completed_at!), "EEEE");
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  });
  const mostProductiveDay =
    Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Most delayed category (labels[0] or "general") among overdue open tasks
  const delayed = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.deadline &&
      new Date(t.deadline) < now,
  );
  const categoryCounts: Record<string, number> = {};
  delayed.forEach((t) => {
    const cat = (t.labels && t.labels[0]) || t.priority || "general";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  });
  const delayedCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None";

  // ===== Procrastination score =====
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueCount = openTasks.filter(
    (t) => t.deadline && new Date(t.deadline) < now,
  ).length;
  const staleCount = openTasks.filter(
    (t) => differenceInHours(now, new Date(t.created_at)) > 72,
  ).length;
  const denom = Math.max(tasks.length, 1);
  const rawScore = Math.round(
    ((overdueCount * 1.5 + staleCount * 0.6) / denom) * 100,
  );
  const procrastinationScore = Math.min(100, rawScore);
  const procLevel: "Low" | "Medium" | "High" =
    procrastinationScore < 30 ? "Low" : procrastinationScore < 60 ? "Medium" : "High";
  const procColor =
    procLevel === "Low"
      ? "text-emerald-500 bg-emerald-500/10"
      : procLevel === "Medium"
        ? "text-amber-500 bg-amber-500/10"
        : "text-rose-500 bg-rose-500/10";
  const procEmoji = procLevel === "Low" ? "🟢" : procLevel === "Medium" ? "🟡" : "🔴";

  // ===== Mood vs productivity =====
  const moodStats = MOODS.map(({ key, label, icon, color }) => {
    const moodDays = moods.filter((m) => m.mood === key);
    const dates = new Set(
      moodDays.map((m) => format(new Date(m.logged_at), "yyyy-MM-dd")),
    );
    const dayTasks = tasks.filter((t) => {
      const ref = t.completed_at ?? t.created_at;
      return ref && dates.has(format(new Date(ref), "yyyy-MM-dd"));
    });
    const done = dayTasks.filter((t) => t.status === "done").length;
    const rate = dayTasks.length === 0 ? 0 : Math.round((done / dayTasks.length) * 100);
    return { key, label, icon, color, rate, sampleSize: dates.size };
  });

  // ===== AI recommendations =====
  const genRec = useServerFn(generateInsightRecommendations);
  const [ai, setAi] = useState<{ weekly: string; procrastination: string; mood: string } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadingAi(true);
    genRec({
      data: {
        weekly: {
          completedThisWeek: completedThisWeek.length,
          completedLastWeek: completedLastWeek.length,
          changePct,
          mostProductiveDay,
          delayedCategory,
        },
        procrastination: { score: procrastinationScore, level: procLevel },
        mood: moodStats.map((m) => ({
          mood: m.label,
          completionRate: m.rate,
          sampleSize: m.sampleSize,
        })),
      },
    })
      .then((r) => {
        if (alive) setAi(r);
      })
      .catch(() => {})
      .finally(() => alive && setLoadingAi(false));
    return () => {
      alive = false;
    };
    // Refresh when the key inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    completedThisWeek.length,
    completedLastWeek.length,
    procrastinationScore,
    moodStats.map((m) => m.rate).join(","),
  ]);

  const positive = changePct >= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">Behavior Analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-powered insights into your productivity, habits, and mood.
        </p>
      </motion.div>

      {/* ===== Weekly Report ===== */}
      <section className="glass rounded-3xl p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
            <CalendarDays className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Weekly AI Report</h2>
            <p className="text-xs text-muted-foreground">
              {format(thisWeekStart, "MMM d")} – {format(thisWeekEnd, "MMM d")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Tasks completed"
            value={completedThisWeek.length.toString()}
            hint={`${completedLastWeek.length} last week`}
          />
          <Metric
            label="Change vs last week"
            value={`${positive ? "+" : ""}${changePct}%`}
            hint={positive ? "Trending up" : "Trending down"}
            icon={positive ? TrendingUp : TrendingDown}
            tone={positive ? "text-emerald-500" : "text-rose-500"}
          />
          <Metric label="Most productive day" value={mostProductiveDay} hint="This week" />
          <Metric
            label="Most delayed"
            value={delayedCategory}
            hint={`${delayed.length} overdue`}
          />
        </div>

        <AiCard loading={loadingAi} text={ai?.weekly} />
      </section>

      {/* ===== Procrastination Score ===== */}
      <section className="glass rounded-3xl p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold">Procrastination Score</h2>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className={`inline-flex items-center gap-3 rounded-2xl px-5 py-3 ${procColor}`}>
            <span className="text-2xl">{procEmoji}</span>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">{procLevel}</p>
              <p className="text-3xl font-bold">{procrastinationScore}%</p>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Low</span><span>Medium</span><span>High</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${procrastinationScore}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full ${
                  procLevel === "Low"
                    ? "bg-emerald-500"
                    : procLevel === "Medium"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                }`}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {overdueCount} overdue · {staleCount} stale (&gt;3 days)
            </p>
          </div>
        </div>

        <AiCard loading={loadingAi} text={ai?.procrastination} />
      </section>

      {/* ===== Mood & Productivity ===== */}
      <section className="glass rounded-3xl p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-lg font-semibold">Mood &amp; Productivity</h2>
        </div>

        <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
          Log today's mood
        </p>
        <div className="mb-6 flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m.key}
              onClick={() => logMood.mutate(m.key)}
              disabled={logMood.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium transition hover:bg-accent"
            >
              <m.icon className={`h-4 w-4 ${m.color}`} /> {m.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {moodStats.map((m) => (
            <div key={m.key} className="rounded-2xl border border-border/50 bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <m.icon className={`h-5 w-5 ${m.color}`} />
                <p className="font-medium">{m.label}</p>
              </div>
              <p className="mt-3 text-3xl font-bold">{m.rate}%</p>
              <p className="text-xs text-muted-foreground">
                tasks completed · {m.sampleSize} {m.sampleSize === 1 ? "day" : "days"} logged
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${m.rate}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full ${
                    m.key === "happy"
                      ? "bg-emerald-500"
                      : m.key === "neutral"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>

        <AiCard loading={loadingAi} text={ai?.mood} />
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 flex items-center gap-1.5 text-2xl font-bold ${tone ?? ""}`}>
        {Icon && <Icon className="h-5 w-5" />}
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AiCard({ loading, text }: { loading: boolean; text?: string }) {
  return (
    <div className="mt-5 flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <p className="text-sm leading-relaxed">
        {loading && !text ? (
          <span className="text-muted-foreground">Twinova is analyzing your patterns…</span>
        ) : (
          text || "Log more activity to unlock personalized guidance."
        )}
      </p>
    </div>
  );
}
