import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/confirm")({
  component: ConfirmPage,
});

type Status = "verifying" | "success" | "error";

function ConfirmPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

        // Errors from Supabase come back on either the query string or the hash.
        const errorCode =
          url.searchParams.get("error") ||
          url.searchParams.get("error_code") ||
          hash.get("error") ||
          hash.get("error_code");
        const errorDesc =
          url.searchParams.get("error_description") ||
          hash.get("error_description");

        if (errorCode) {
          if (cancelled) return;
          setStatus("error");
          setMessage(
            errorDesc?.replace(/\+/g, " ") ||
              "This verification link is invalid or has expired.",
          );
          return;
        }

        // Newer Supabase confirmation links use ?token_hash=...&type=signup
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type") as
          | "signup"
          | "email_change"
          | "recovery"
          | "invite"
          | "magiclink"
          | null;

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (cancelled) return;
          if (error) {
            setStatus("error");
            setMessage(error.message || "Verification failed.");
            return;
          }
        }

        // If the link delivered tokens in the hash, the client auto-parses them.
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session) {
          setStatus("success");
          setMessage("Email verified. Redirecting to your dashboard…");
          toast.success("Email verified");
          setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
        } else {
          setStatus("success");
          setMessage("Email verified. Please sign in to continue.");
          toast.success("Email verified");
          setTimeout(() => navigate({ to: "/auth", replace: true }), 1500);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Verification failed.",
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass w-full max-w-md rounded-3xl p-8 text-center shadow-elevated"
      >
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl gradient-bg shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-semibold">Twinova AI</span>
        </Link>

        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border/60 bg-background/60">
          {status === "verifying" && (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
          {status === "success" && (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          )}
          {status === "error" && <XCircle className="h-6 w-6 text-red-500" />}
        </div>

        <h1 className="mt-5 text-xl font-bold">
          {status === "verifying" && "Verifying your email"}
          {status === "success" && "You're all set"}
          {status === "error" && "Verification failed"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        {status === "error" && (
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => navigate({ to: "/auth", replace: true })}
              className="rounded-2xl gradient-bg px-4 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
