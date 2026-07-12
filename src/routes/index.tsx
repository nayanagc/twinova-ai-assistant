import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, Mic, Calendar, Brain, LineChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="shimmer-text text-lg">Loading Twinova…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="mx-auto flex max-w-7xl items-center justify-between p-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-semibold">Twinova AI</span>
        </div>
        <Link
          to="/auth"
          className="rounded-full gradient-bg px-5 py-2 text-sm font-medium text-white shadow-glow transition hover:opacity-90"
        >
          Sign in
        </Link>
      </nav>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          Powered by Lovable AI
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-5xl sm:text-7xl font-bold tracking-tight"
        >
          Your personal <span className="gradient-text">AI executive</span>
          <br />
          assistant.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
        >
          Just talk — by voice or text. Twinova plans your day, tracks your tasks, predicts what you'll
          miss, and reflects with you every evening.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 rounded-full gradient-bg px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            Get started free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="glass rounded-full px-7 py-3 text-sm font-semibold transition hover:bg-accent/40"
          >
            See features
          </a>
        </motion.div>
      </section>

      <section id="features" className="mx-auto grid max-w-6xl gap-5 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: Mic, title: "Voice-first", desc: "Speak naturally — Twinova listens, thinks, and speaks back." },
          { icon: Brain, title: "Predictive AI", desc: "\"You usually get distracted after 7 PM.\" Real insights, not vibes." },
          { icon: Calendar, title: "Smart scheduling", desc: "Ask to move a meeting. Done. AI reorders your priorities." },
          { icon: LineChart, title: "Analytics", desc: "Productivity, focus time, and mood trends beautifully visualized." },
          { icon: Sparkles, title: "Daily briefing", desc: "Every morning: your day, weather, priorities, and a boost." },
          { icon: ArrowRight, title: "Reflection", desc: "Every evening: what you shipped, what to try tomorrow." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-3xl p-6"
          >
            <div className="grid h-10 w-10 place-items-center rounded-2xl gradient-bg shadow-glow">
              <f.icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
