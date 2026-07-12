import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const CATEGORY_COLORS: Record<string, string> = {
  work: "bg-blue-500",
  meeting: "bg-purple-500",
  study: "bg-amber-500",
  health: "bg-emerald-500",
  personal: "bg-pink-500",
};

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [showForm, setShowForm] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const rangeStart = startOfWeek(monthStart);
  const rangeEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const { data: events = [] } = useQuery({
    queryKey: ["events", user.id, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .gte("start_time", rangeStart.toISOString())
        .lte("start_time", rangeEnd.toISOString())
        .order("start_time");
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      start_time: string;
      end_time: string;
      category: string;
      description?: string;
    }) => {
      const { error } = await supabase.from("events").insert({
        user_id: user.id,
        title: input.title,
        start_time: input.start_time,
        end_time: input.end_time,
        category: input.category,
        description: input.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events", user.id] });
      qc.invalidateQueries({ queryKey: ["events-today", user.id] });
      setShowForm(false);
      toast.success("Event scheduled");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("events").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", user.id] }),
  });

  const eventsByDay = events.reduce<Record<string, typeof events>>((acc, e) => {
    const key = format(new Date(e.start_time), "yyyy-MM-dd");
    acc[key] = acc[key] ?? [];
    acc[key].push(e);
    return acc;
  }, {});

  const selectedEvents = eventsByDay[format(selected, "yyyy-MM-dd")] ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your schedule at a glance.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-full gradient-bg px-5 py-2 text-sm font-semibold text-white shadow-glow"
        >
          <Plus className="h-4 w-4" /> New event
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Month grid */}
        <div className="glass rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCursor(subMonths(cursor, 1))}
                className="rounded-xl p-2 hover:bg-accent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Today
              </button>
              <button
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="rounded-xl p-2 hover:bg-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayEvents = eventsByDay[key] ?? [];
              const inMonth = isSameMonth(d, cursor);
              const active = isSameDay(d, selected);
              return (
                <motion.button
                  key={key}
                  onClick={() => setSelected(d)}
                  whileHover={{ scale: 1.02 }}
                  className={`relative flex min-h-[76px] flex-col items-start rounded-2xl border p-1.5 text-left text-xs transition ${
                    active
                      ? "gradient-bg border-transparent text-white shadow-glow"
                      : inMonth
                        ? "border-border/50 bg-background/40 hover:bg-accent/40"
                        : "border-transparent text-muted-foreground/50"
                  }`}
                >
                  <span
                    className={`mb-1 grid h-6 w-6 place-items-center rounded-full text-xs ${
                      isToday(d) && !active ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    {format(d, "d")}
                  </span>
                  <div className="flex flex-wrap gap-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-1.5 rounded-full ${CATEGORY_COLORS[e.category] ?? "bg-muted-foreground"}`}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] opacity-80">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        <div className="glass rounded-3xl p-5">
          <h3 className="text-lg font-semibold">{format(selected, "EEEE, MMM d")}</h3>
          <p className="text-xs text-muted-foreground">
            {selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}
          </p>
          <ul className="mt-4 space-y-2">
            {selectedEvents.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nothing scheduled.
              </p>
            )}
            {selectedEvents.map((e) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="group flex gap-3 rounded-2xl border border-border/50 bg-background/40 p-3"
              >
                <div className={`w-1 shrink-0 rounded-full ${CATEGORY_COLORS[e.category] ?? "bg-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(e.start_time), "h:mm a")} —{" "}
                    {format(new Date(e.end_time), "h:mm a")}
                  </p>
                  {e.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>
                  )}
                </div>
                <button
                  onClick={() => remove.mutate(e.id)}
                  className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>

      {showForm && (
        <EventForm
          defaultDate={selected}
          onClose={() => setShowForm(false)}
          onSubmit={(v) => create.mutate(v)}
        />
      )}
    </div>
  );
}

function EventForm({
  defaultDate,
  onSubmit,
  onClose,
}: {
  defaultDate: Date;
  onSubmit: (v: { title: string; start_time: string; end_time: string; category: string; description?: string }) => void;
  onClose: () => void;
}) {
  const dateStr = format(defaultDate, "yyyy-MM-dd");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("work");
  const [start, setStart] = useState(`${dateStr}T09:00`);
  const [end, setEnd] = useState(`${dateStr}T10:00`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSubmit({
            title: title.trim(),
            start_time: new Date(start).toISOString(),
            end_time: new Date(end).toISOString(),
            category,
            description: description.trim() || undefined,
          });
        }}
        className="glass w-full max-w-md rounded-3xl p-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">New event</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <input
            autoFocus
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {Object.keys(CATEGORY_COLORS).map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="submit" className="rounded-full gradient-bg px-5 py-2 text-sm font-semibold text-white shadow-glow">
            Create
          </button>
        </div>
      </motion.form>
    </div>
  );
}
