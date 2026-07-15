import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  differenceInMinutes,
  format,
} from "date-fns";

export function DeadlineReminders({ userId }: { userId: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("twinova-reminders-dismissed") === "1") {
      setDismissed(true);
    }
  }, []);

  const { data: tasks = [] } = useQuery({
    queryKey: ["deadline-reminders", userId],
    queryFn: async () => {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from("tasks")
        .select("id,title,deadline,priority,status")
        .eq("user_id", userId)
        .neq("status", "done")
        .not("deadline", "is", null)
        .gte("deadline", now.toISOString())
        .lte("deadline", in7Days.toISOString())
        .order("deadline", { ascending: true });
      return data ?? [];
    },
  });

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("twinova-reminders-dismissed", "1");
    }
  };

  if (dismissed || tasks.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="glass mb-6 overflow-hidden rounded-3xl border border-border/60"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-gradient-to-br from-primary/15 to-transparent p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-2xl gradient-bg shadow-glow">
              <Bell className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Upcoming deadlines</h3>
              <p className="text-xs text-muted-foreground">
                {tasks.length} task{tasks.length === 1 ? "" : "s"} due within 7 days
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Dismiss reminders"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-border/40">
          {tasks.slice(0, 6).map((t) => {
            const due = new Date(t.deadline!);
            const today = isToday(due);
            const tomorrow = isTomorrow(due);
            const highlight = today || tomorrow;
            const soonMinutes = differenceInMinutes(due, new Date());
            const badge = today
              ? "Today"
              : tomorrow
                ? "Tomorrow"
                : format(due, "EEE, MMM d");
            return (
              <li
                key={t.id}
                className={`flex items-center gap-3 p-3 text-sm ${
                  highlight ? "bg-primary/5" : ""
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    today
                      ? "bg-red-500"
                      : tomorrow
                        ? "bg-orange-500"
                        : "bg-emerald-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(due, "h:mm a")} ·{" "}
                    {soonMinutes < 60
                      ? `in ${Math.max(soonMinutes, 1)} min`
                      : `in ${formatDistanceToNowStrict(due)}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    highlight
                      ? "gradient-bg text-white shadow-glow"
                      : "bg-accent/40 text-muted-foreground"
                  }`}
                >
                  {badge}
                </span>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </AnimatePresence>
  );
}
