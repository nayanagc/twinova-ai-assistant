import { createFileRoute, Outlet, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatShell,
});

function ChatShell() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("threads")
        .select("*")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const createThread = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("threads")
        .insert({ user_id: user.id, title: "New chat" })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (thread) => {
      qc.invalidateQueries({ queryKey: ["threads", user.id] });
      navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    },
  });

  const removeThread = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("threads").delete().eq("id", id);
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["threads", user.id] });
      if (params.threadId === id) navigate({ to: "/chat" });
    },
  });

  useEffect(() => {
    if (!params.threadId && threads.length > 0) {
      navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
    }
  }, [params.threadId, threads, navigate]);

  return (
    <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-7xl grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      {/* Thread list */}
      <aside className="glass flex flex-col rounded-3xl p-4">
        <button
          onClick={() => createThread.mutate()}
          disabled={createThread.isPending}
          className="mb-3 flex items-center justify-center gap-2 rounded-2xl gradient-bg px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {isLoading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
          {!isLoading && threads.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              No conversations yet. Start a new chat.
            </p>
          )}
          {threads.map((t) => {
            const active = params.threadId === t.id;
            return (
              <div
                key={t.id}
                className={`group relative flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition ${
                  active ? "bg-accent/50" : "hover:bg-accent/30"
                }`}
              >
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => removeThread.mutate(t.id)}
                  className="rounded-lg p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Active thread */}
      <motion.div
        key={params.threadId ?? "empty"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass flex flex-col overflow-hidden rounded-3xl"
      >
        {params.threadId ? (
          <Outlet />
        ) : (
          <EmptyChat onCreate={() => createThread.mutate()} />
        )}
      </motion.div>
    </div>
  );
}

function EmptyChat({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl gradient-bg shadow-glow">
        <MessageSquare className="h-7 w-7 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Talk to Twinova</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Ask about your schedule, create tasks, or plan your day. Voice or text — your choice.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="rounded-full gradient-bg px-6 py-2.5 text-sm font-semibold text-white shadow-glow"
      >
        Start a conversation
      </button>
    </div>
  );
}
