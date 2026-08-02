import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Square, Volume2, VolumeX, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadView,
});

const SUGGESTIONS = [
  "What's my schedule today?",
  "Plan my day",
  "Add: finish DBMS assignment by 2pm today",
  "How productive was I this week?",
];

function ThreadView() {
  const { threadId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const spokenRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  // Load persisted messages
  const { data: initialMessages, isLoading } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at");
      const msgs: UIMessage[] = (data ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts:
          Array.isArray(m.parts) && m.parts.length
            ? (m.parts as unknown as UIMessage["parts"])
            : [{ type: "text", text: m.content } as UIMessage["parts"][number]],
      }));
      return msgs;
    },
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          return fetch(input as string, { ...init, headers });
        },
        body: { threadId },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: threadId,
    transport,
    onError: (err) => {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      // eslint-disable-next-line no-console
      console.error("[twinova/chat] request failed", {
        offline,
        message: err?.message,
      });
      toast.error(
        offline
          ? "No internet connection. Reconnect and try again."
          : "Unable to reach the AI service. Please try again.",
      );
    },
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["tasks", user.id] });
      qc.invalidateQueries({ queryKey: ["events-today", user.id] });
      qc.invalidateQueries({ queryKey: ["events", user.id] });
      qc.invalidateQueries({ queryKey: ["threads", user.id] });
    },
  });

  // Hydrate initial messages
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, status]);

  // TTS for new assistant messages
  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || status === "streaming" || status === "submitted") return;
    if (spokenRef.current.has(last.id)) return;
    const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
    if (!text) return;
    spokenRef.current.add(last.id);
    void speak(text);
  }, [messages, status, ttsEnabled]);

  const speak = useCallback(async (text: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      /* noop */
    }
  }, []);

  const handleSend = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setInput("");
    sendMessage({ text: t });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl gradient-bg">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">Twinova</p>
            <p className="text-xs text-muted-foreground">Your AI executive assistant</p>
          </div>
        </div>
        <button
          onClick={() => {
            setTtsEnabled((v) => !v);
            if (ttsEnabled) audioRef.current?.pause();
          }}
          className={`glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            ttsEnabled ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          Voice
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <WelcomePanel onSuggest={handleSend} />
        ) : (
          <ul className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {(status === "submitted" || status === "streaming") &&
              messages[messages.length - 1]?.role === "user" && (
                <li className="flex gap-3">
                  <Avatar />
                  <div className="pt-2">
                    <span className="shimmer-text text-sm">Thinking…</span>
                  </div>
                </li>
              )}
          </ul>
        )}
      </div>

      <Composer
        input={input}
        setInput={setInput}
        onSend={() => handleSend()}
        status={status}
        onStop={stop}
        inputRef={inputRef}
      />
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const toolCalls = message.parts.filter(
    (p) => typeof p.type === "string" && p.type.startsWith("tool-"),
  );
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && <Avatar />}
      <div className={`min-w-0 max-w-[85%] ${isUser ? "text-right" : ""}`}>
        {toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {toolCalls.map((tc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-accent/30 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                <Sparkles className="h-2.5 w-2.5" />
                {tc.type.replace("tool-", "")}
              </span>
            ))}
          </div>
        )}
        {text &&
          (isUser ? (
            <div className="inline-block rounded-2xl gradient-bg px-4 py-2.5 text-sm text-white shadow-glow">
              {text}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{text}</ReactMarkdown>
            </div>
          ))}
      </div>
    </motion.li>
  );
}

function Avatar() {
  return (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl gradient-bg shadow-glow">
      <Sparkles className="h-4 w-4 text-white" />
    </div>
  );
}

function WelcomePanel({ onSuggest }: { onSuggest: (t: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl gradient-bg shadow-glow">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h2 className="mt-5 text-2xl font-bold">How can I help today?</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Ask about your schedule, add tasks, plan your day. Say it — or type it.
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="glass rounded-2xl p-4 text-left text-sm transition hover:bg-accent/40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  status,
  onStop,
  inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  status: "submitted" | "streaming" | "ready" | "error";
  onStop: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 2048) {
          toast.error("Recording was too short.");
          return;
        }
        setTranscribing(true);
        try {
          const { data } = await supabase.auth.getSession();
          const fd = new FormData();
          fd.append("file", blob, "recording.webm");
          const res = await fetch("/api/stt", {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session?.access_token}` },
            body: fd,
          });
          if (!res.ok) throw new Error(await res.text());
          const json = await res.json();
          const text = (json.text ?? "").trim();
          if (text) setInput(text);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="border-t border-border/50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="glass relative flex items-end gap-2 rounded-3xl p-2">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing || isBusy}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition ${
              recording
                ? "bg-destructive text-destructive-foreground"
                : "bg-accent/40 hover:bg-accent"
            }`}
            title={recording ? "Stop recording" : "Record voice"}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : recording ? (
              <AnimatePresence>
                <VoiceWave />
              </AnimatePresence>
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask Twinova anything…"
            rows={1}
            className="min-h-[40px] max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {isBusy ? (
            <button
              onClick={onStop}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-destructive text-destructive-foreground"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl gradient-bg text-white shadow-glow transition disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {recording
            ? "Listening… press again to stop"
            : "Enter to send · Shift+Enter for a new line"}
        </p>
      </div>
    </div>
  );
}

function VoiceWave() {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 0.15, 0.3, 0.15, 0].map((d, i) => (
        <span
          key={i}
          className="wave-bar block w-0.5 rounded-full bg-current"
          style={{ height: 14, animationDelay: `${d}s` }}
        />
      ))}
    </div>
  );
}
