import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Sparkles,
  MessageSquare,
  Plus,
  Clock,
  Flag,
  TrendingUp,
  Zap,
  Brain,
  Smile,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, startOfDay, endOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function greetingFor(hour: number) {
  if (hour < 5) return "You're up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

function Dashboard() {
  const { user } = Route.useRouteContext();

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .order("deadline", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-today", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .gte("start_time", startOfDay(new Date()).toISOString())
        .lte("start_time", endOfDay(new Date()).toISOString())
        .order("start_time");
      return data ?? [];
    },
  });

  const now = new Date();
  const displayName = profile?.display_name || user.email?.split("@")[0] || "there";
  const greeting = greetingFor(now.getHours());

  const todayTasks = tasks.filter((t) => t.deadline && isToday(new Date(t.deadline)));
  const doneToday = tasks.filter(
    (t) => t.completed_at && isToday(new Date(t.completed_at))
  ).length;
  const totalToday = todayTasks.length + doneToday;
  const productivity = totalToday === 0 ? 0 : Math.round((doneToday / totalToday) * 100);

  const priorityTasks = tasks
    .filter((t) => t.status !== "done")
    .slice(0, 4);

  const insights = [
    {
      icon: Brain,
      title: "Predictive AI",
      body:
        priorityTasks.length > 2
          ? `You have ${priorityTasks.length} open tasks — batch the high-priority ones before lunch for the best focus window.`
          : "Your day looks light. Consider deep work on your most ambitious goal.",
    },
    {
      icon: Zap,
      title: "Recommendation",
      body:
        events.length > 0
          ? `Prepare notes 10 minutes before "${events[0].title}" to arrive sharp.`
          : "No meetings today. Great day for deep, uninterrupted work.",
    },
    {
      icon: TrendingUp,
      title: "Trend",
      body: `You're most productive between 10 AM and 12 PM. Protect that block.`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold">
            {greeting}, <span className="gradient-text">{displayName}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(now, "EEEE, MMMM d")} · Let's make today count.
          </p>
        </div>
        <Link
          to="/chat"
          className="inline-flex items-center gap-2 rounded-full gradient-bg px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
        >
          <MessageSquare className="h-4 w-4" /> Talk to Twinova
        </Link>
      </motion.div>

      {/* Top row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ScoreCard score={productivity} done={doneToday} total={totalToday} />
        <StatCard
          icon={Flag}
          label="Open tasks"
          value={tasks.filter((t) => t.status !== "done").length}
          sublabel={`${todayTasks.length} due today`}
        />
        <StatCard
          icon={Clock}
          label="Events today"
          value={events.length}
          sublabel={
            events[0]
              ? `Next: ${events[0].title} · ${format(new Date(events[0].start_time), "h:mm a")}`
              : "Nothing scheduled"
          }
        />
      </div>

      {/* AI insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        {insights.map((i, idx) => (
          <motion.div
            key={i.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * idx }}
            className="glass rounded-3xl p-5"
          >
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-xl gradient-bg">
                <i.icon className="h-4 w-4 text-white" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {i.title}
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{i.body}</p>
          </motion.div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Schedule timeline */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today's schedule</h2>
            <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
              Open calendar →
            </Link>
          </div>
          {events.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No events today"
              body="Ask Twinova to schedule something."
            />
          ) : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-4 rounded-2xl border border-border/50 bg-background/40 p-3">
                  <div className="flex flex-col items-center rounded-xl gradient-bg px-3 py-2 text-white shadow-glow">
                    <span className="text-xs opacity-80">
                      {format(new Date(e.start_time), "MMM")}
                    </span>
                    <span className="text-lg font-bold leading-none">
                      {format(new Date(e.start_time), "h:mm")}
                    </span>
                    <span className="text-[10px] opacity-80">
                      {format(new Date(e.start_time), "a")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.category}</p>
                    {e.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Priority tasks */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Priority tasks</h2>
            <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
              All tasks →
            </Link>
          </div>
          {priorityTasks.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Inbox zero"
              body="Ask Twinova to plan your day."
            />
          ) : (
            <ul className="space-y-2">
              {priorityTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 p-3"
                >
                  <PriorityDot p={t.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    {t.deadline && (
                      <p className="text-xs text-muted-foreground">
                        Due {format(new Date(t.deadline), "MMM d, h:mm a")}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-accent/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="glass rounded-3xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Smile className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Quick actions</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/tasks"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> New task
          </Link>
          <Link
            to="/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium transition hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> New event
          </Link>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-full gradient-bg px-4 py-2 text-sm font-medium text-white shadow-glow"
          >
            <MessageSquare className="h-4 w-4" /> Plan my day
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ score, done, total }: { score: number; done: number; total: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex items-center gap-5 rounded-3xl p-5"
    >
      <div className="relative">
        <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted opacity-30" />
          <motion.circle
            cx="50" cy="50" r="40"
            stroke="url(#g1)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.22 285)" />
              <stop offset="100%" stopColor="oklch(0.75 0.2 340)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-2xl font-bold">{score}%</span>
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Productivity today</p>
        <p className="mt-1 text-2xl font-bold">{done}/{total || 0}</p>
        <p className="text-xs text-muted-foreground">tasks completed</p>
      </div>
    </motion.div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sublabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-5"
    >
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl gradient-bg">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
    </motion.div>
  );
}

function PriorityDot({ p }: { p: string }) {
  const map: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-emerald-500",
  };
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${map[p] ?? "bg-muted"}`} />;
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/40">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
