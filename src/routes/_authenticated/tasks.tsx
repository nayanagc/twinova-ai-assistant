import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Trash2, Flag, Clock, X } from "lucide-react";
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

  const toggle = useMutation({
    mutationFn: async (t: (typeof tasks)[number]) => {
      const nextStatus: Status = t.status === "done" ? "todo" : "done";
      const { error } = await supabase
        .from("tasks")
        .update({
          status: nextStatus,
          completed_at: nextStatus === "done" ? new Date().toISOString() : null,
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", user.id] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", user.id] }),
  });

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const grouped = {
    urgent: filtered.filter((t) => t.priority === "urgent" && t.status !== "done"),
    open: filtered.filter((t) => t.priority !== "urgent" && t.status !== "done"),
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
                {f === "all" ? "All" : f === "in_progress" ? "In progress" : f === "todo" ? "To do" : "Done"}
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
        <TaskColumn title="Urgent" tint="from-rose-500/20" tasks={grouped.urgent} toggle={toggle.mutate} remove={remove.mutate} />
        <TaskColumn title="Open" tint="from-primary/20" tasks={grouped.open} toggle={toggle.mutate} remove={remove.mutate} />
        <TaskColumn title="Done" tint="from-emerald-500/20" tasks={grouped.done} toggle={toggle.mutate} remove={remove.mutate} />
      </div>
    </div>
  );
}

function TaskColumn({
  title,
  tint,
  tasks,
  toggle,
  remove,
}: {
  title: string;
  tint: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    deadline: string | null;
    [key: string]: unknown;
  }>;
  toggle: (t: never) => void;
  remove: (id: string) => void;
}) {
  const toggleAny = toggle as unknown as (t: unknown) => void;
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
            <button
              onClick={() => toggleAny(t)}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                t.status === "done"
                  ? "gradient-bg border-transparent text-white"
                  : "border-border hover:border-primary"
              }`}
            >
              {t.status === "done" && <Check className="h-3 w-3" />}
            </button>
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
                {t.deadline && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(t.deadline), "MMM d, h:mm a")}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => remove(t.id)}
              className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
