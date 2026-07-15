import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Trash2, Flag, Clock, X, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "todo" | "in_progress" | "done";

function TasksPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | Status>("all");

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

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      priority: Priority;
      deadline?: string;
    }) => {
      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        deadline: input.deadline || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", user.id] });
      setShowForm(false);
      toast.success("Task created");
    },
    onError: (e) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks", user.id] });
      if (v.status === "done") toast.success("Task completed");
      if (v.status === "in_progress") toast("Task paused");
      if (v.status === "todo") toast("Task resumed");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", user.id] });
      toast.success("Task deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const grouped = {
    open: filtered.filter((t) => t.status !== "done"),
    done: filtered.filter((t) => t.status === "done"),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.filter((t) => t.status !== "done").length} open ·{" "}
            {tasks.filter((t) => t.status === "done").length} done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass flex items-center rounded-full p-1 text-xs">
            {(["all", "todo", "in_progress", "done"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 transition ${
                  filter === f ? "gradient-bg text-white shadow-glow" : "text-muted-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "in_progress" ? "Paused" : f === "todo" ? "To do" : "Done"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full gradient-bg px-5 py-2 text-sm font-semibold text-white shadow-glow"
          >
            <Plus className="h-4 w-4" /> New task
          </button>
        </div>
      </div>

      {showForm && <TaskForm onSubmit={(v) => create.mutate(v)} onClose={() => setShowForm(false)} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <FocusTimer />
        <TaskColumn
          title="Open"
          tint="from-primary/20"
          tasks={grouped.open}
          onDone={(id) => setStatus.mutate({ id, status: "done" })}
          onPause={(id, cur) =>
            setStatus.mutate({ id, status: cur === "in_progress" ? "todo" : "in_progress" })
          }
          onDelete={(id) => remove.mutate(id)}
        />
        <TaskColumn
          title="Done"
          tint="from-emerald-500/20"
          tasks={grouped.done}
          onDone={(id) => setStatus.mutate({ id, status: "todo" })}
          onDelete={(id) => remove.mutate(id)}
        />
      </div>
    </div>
  );
}

function FocusTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [running]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const start = () => {
    setStarted(true);
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setElapsed(0);
    setStarted(false);
  };

  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-gradient-to-br from-rose-500/20 to-transparent p-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Timer className="h-4 w-4" /> Focus Timer
        </h3>
        <span className="text-xs text-muted-foreground">{running ? "Running" : started ? "Paused" : "Idle"}</span>
      </div>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/50 bg-background/40 p-6">
        <div className="font-mono text-5xl font-bold tabular-nums tracking-tight">
          {mm}:{ss}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!started && (
            <button
              onClick={start}
              className="inline-flex items-center gap-1.5 rounded-full gradient-bg px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              <Play className="h-3.5 w-3.5" /> Start
            </button>
          )}
          {started && running && (
            <button
              onClick={pause}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-4 py-2 text-xs font-semibold"
            >
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {started && !running && (
            <button
              onClick={resume}
              className="inline-flex items-center gap-1.5 rounded-full gradient-bg px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          <button
            onClick={reset}
            disabled={!started && elapsed === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  deadline: string | null;
};

function TaskColumn({
  title,
  tint,
  tasks,
  onDone,
  onPause,
  onDelete,
}: {
  title: string;
  tint: string;
  tasks: TaskRow[];
  onDone: (id: string) => void;
  onPause?: (id: string, currentStatus: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className={`mb-3 flex items-center justify-between rounded-2xl bg-gradient-to-br ${tint} to-transparent p-3`}>
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <ul className="space-y-2">
        {tasks.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">Nothing here.</p>
        )}
        {tasks.map((t) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group flex gap-3 rounded-2xl border border-border/50 bg-background/40 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {t.title}
              </p>
              {t.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/40 px-2 py-0.5 uppercase tracking-wider text-muted-foreground">
                  <Flag className="h-2.5 w-2.5" /> {t.priority}
                </span>
                {t.status === "in_progress" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 uppercase tracking-wider text-amber-500">
                    <Pause className="h-2.5 w-2.5" /> Paused
                  </span>
                )}
                {t.deadline && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(t.deadline), "MMM d, h:mm a")}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => onDone(t.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    t.status === "done"
                      ? "border border-border bg-background/60 text-muted-foreground hover:text-foreground"
                      : "gradient-bg text-white shadow-glow"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  {t.status === "done" ? "Reopen" : "Done"}
                </button>
                {onPause && t.status !== "done" && (
                  <button
                    onClick={() => onPause(t.id, t.status)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2.5 py-1 text-[10px] font-semibold text-foreground hover:bg-accent"
                  >
                    <Pause className="h-3 w-3" />
                    {t.status === "in_progress" ? "Resume" : "Pause"}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Delete this task permanently?")) onDelete(t.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function TaskForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (v: { title: string; description?: string; priority: Priority; deadline?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [deadline, setDeadline] = useState("");

  return (
    <motion.form
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
        });
      }}
      className="glass rounded-3xl p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">New task</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          autoFocus
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-full gradient-bg px-5 py-2 text-sm font-semibold text-white shadow-glow"
        >
          Create
        </button>
      </div>
    </motion.form>
  );
}
