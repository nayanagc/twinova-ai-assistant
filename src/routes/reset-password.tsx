import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters");

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash automatically.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0]?.message ?? "Invalid password");
        return;
      }
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass w-full max-w-md rounded-3xl p-8 shadow-elevated"
      >
        <Link to="/" className="mb-6 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl gradient-bg shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-semibold">Twinova AI</span>
        </Link>

        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ready
            ? "Choose a strong password you haven't used elsewhere."
            : "Verifying your reset link…"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Lock className="h-4 w-4" />
            </span>
            <input
              type="password"
              placeholder="New password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Lock className="h-4 w-4" />
            </span>
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              required
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-2xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ready}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl gradient-bg py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>

        <div className="mt-5 text-xs text-muted-foreground">
          <Link to="/auth" className="hover:text-foreground">
            ← Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
