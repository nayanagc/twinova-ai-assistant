import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  User, Lock, LogOut, Bell, Sparkles, Volume2, Play, Sun, Moon, Monitor,
  Target, Timer, Clock, Download, Trash2, Info, ShieldCheck, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { usePrefs, type ResponseStyle } from "@/lib/prefs";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Twinova AI" },
      { name: "description", content: "Manage your Twinova AI account, notifications, AI, voice, appearance and privacy settings." },
    ],
  }),
  component: SettingsPage,
});

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-6"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </motion.section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "gradient-bg" : "bg-muted"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mode, setMode } = useTheme();
  const { prefs, update } = usePrefs();

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const [displayName, setDisplayName] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const currentName = displayName || profile?.display_name || "";

  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ display_name: currentName }).eq("id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    refetch();
  };

  const changePassword = async () => {
    if (newPass.length < 8) return toast.error("Password must be at least 8 characters");
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setChangingPass(false);
    if (error) return toast.error(error.message);
    setNewPass("");
    toast.success("Password changed");
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  };

  const testVoice = async () => {
    if (!prefs.voiceEnabled) return toast.error("Voice is disabled");
    setTestingVoice(true);
    try {
      const res = await fetch("/api/gnani-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hi, this is Twinova. Your voice assistant is ready." }),
      });
      if (!res.ok) throw new Error("Voice test failed");
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.playbackRate = prefs.voiceSpeed;
      audio.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Voice test failed");
    } finally {
      setTestingVoice(false);
    }
  };

  const exportData = async () => {
    try {
      const [tasks, events, moods, threads, messages] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("events").select("*"),
        supabase.from("mood_logs").select("*"),
        supabase.from("threads").select("*"),
        supabase.from("messages").select("*"),
      ]);
      const bundle = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        profile,
        tasks: tasks.data ?? [],
        events: events.data ?? [],
        mood_logs: moods.data ?? [],
        threads: threads.data ?? [],
        messages: messages.data ?? [],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `twinova-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast.success("Data exported");
    } catch {
      toast.error("Export failed");
    }
  };

  const deleteAccount = async () => {
    if (deleteInput !== "DELETE") return toast.error('Type "DELETE" to confirm');
    try {
      await Promise.all([
        supabase.from("tasks").delete().eq("user_id", user.id),
        supabase.from("events").delete().eq("user_id", user.id),
        supabase.from("mood_logs").delete().eq("user_id", user.id),
        supabase.from("messages").delete().eq("user_id", user.id),
        supabase.from("threads").delete().eq("user_id", user.id),
        supabase.from("profiles").delete().eq("id", user.id),
      ]);
      await supabase.auth.signOut();
      toast.success("Account data deleted. Sign-in disabled.");
      router.navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("Deletion failed. Contact support.");
    }
  };

  const themeOptions: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  const styleOptions: { value: ResponseStyle; label: string }[] = [
    { value: "concise", label: "Concise" },
    { value: "balanced", label: "Balanced" },
    { value: "detailed", label: "Detailed" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Personalize Twinova to match how you think and work.</p>
      </div>

      {/* Account */}
      <Section icon={User} title="Account">
        <Row label="Display name" hint="Twinova uses this when talking to you.">
          <div className="flex gap-2">
            <input
              value={currentName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-40 rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={user.email?.split("@")[0]}
            />
            <button onClick={saveProfile} disabled={savingProfile} className="rounded-xl gradient-bg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              {savingProfile ? "…" : "Save"}
            </button>
          </div>
        </Row>
        <Row label="Change password" hint="Minimum 8 characters">
          <div className="flex gap-2">
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-40 rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="New password"
            />
            <button onClick={changePassword} disabled={changingPass} className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium disabled:opacity-60">
              <Lock className="inline h-4 w-4" />
            </button>
          </div>
        </Row>
        <Row label="Sign out" hint="End your session on this device.">
          <button onClick={signOut} className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </Row>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notifications">
        <Row label="Daily reminders" hint="Morning nudge with today's plan.">
          <Toggle checked={prefs.notifDaily} onChange={(v) => update("notifDaily", v)} />
        </Row>
        <Row label="Deadline notifications" hint="Alerts for tasks due today & tomorrow.">
          <Toggle checked={prefs.notifDeadline} onChange={(v) => update("notifDeadline", v)} />
        </Row>
        <Row label="Weekly AI report" hint="Sunday recap with productivity insights.">
          <Toggle checked={prefs.notifWeekly} onChange={(v) => update("notifWeekly", v)} />
        </Row>
      </Section>

      {/* AI Preferences */}
      <Section icon={Sparkles} title="AI Preferences">
        <Row label="Response style" hint="How Twinova phrases its replies.">
          <div className="flex rounded-xl bg-accent/40 p-0.5">
            {styleOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => update("aiStyle", o.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${prefs.aiStyle === o.value ? "gradient-bg text-white" : "text-muted-foreground"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="AI Daily Brief" hint="A short morning summary of your day.">
          <Toggle checked={prefs.aiDailyBrief} onChange={(v) => update("aiDailyBrief", v)} />
        </Row>
        <Row label="Smart Task Prioritization" hint="Twinova reorders tasks by urgency & context.">
          <Toggle checked={prefs.aiSmartPriority} onChange={(v) => update("aiSmartPriority", v)} />
        </Row>
      </Section>

      {/* Voice */}
      <Section icon={Volume2} title="Voice">
        <Row label="Gnani.ai Text-to-Speech" hint="Read AI replies & recommendations aloud.">
          <Toggle checked={prefs.voiceEnabled} onChange={(v) => update("voiceEnabled", v)} />
        </Row>
        <Row label="Voice speed" hint={`${prefs.voiceSpeed.toFixed(2)}× playback`}>
          <input
            type="range" min={0.5} max={2} step={0.05}
            value={prefs.voiceSpeed}
            onChange={(e) => update("voiceSpeed", parseFloat(e.target.value))}
            className="w-40 accent-primary"
          />
        </Row>
        <Row label="Test voice" hint="Hear a short sample.">
          <button
            onClick={testVoice}
            disabled={testingVoice || !prefs.voiceEnabled}
            className="flex items-center gap-2 rounded-xl gradient-bg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" /> {testingVoice ? "Playing…" : "Test"}
          </button>
        </Row>
      </Section>

      {/* Appearance */}
      <Section icon={Sun} title="Appearance">
        <Row label="Theme" hint="Choose how Twinova looks.">
          <div className="flex rounded-xl bg-accent/40 p-0.5">
            {themeOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setMode(o.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${mode === o.value ? "gradient-bg text-white" : "text-muted-foreground"}`}
              >
                <o.icon className="h-3.5 w-3.5" /> {o.label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* Productivity */}
      <Section icon={Target} title="Productivity">
        <Row label="Daily study goal" hint={`${prefs.dailyStudyGoal} minutes / day`}>
          <input type="range" min={30} max={480} step={15}
            value={prefs.dailyStudyGoal}
            onChange={(e) => update("dailyStudyGoal", parseInt(e.target.value))}
            className="w-40 accent-primary" />
        </Row>
        <Row label="Focus session duration" hint={`${prefs.focusDuration} min per session`}>
          <div className="flex gap-1">
            {[15, 25, 45, 60].map((m) => (
              <button key={m}
                onClick={() => update("focusDuration", m)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${prefs.focusDuration === m ? "gradient-bg text-white" : "bg-accent/60 text-muted-foreground"}`}
              >{m}m</button>
            ))}
          </div>
        </Row>
        <Row label="Working hours" hint="Twinova schedules focus blocks here.">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <input type="time" value={prefs.workStart} onChange={(e) => update("workStart", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs" />
            <span className="text-xs text-muted-foreground">–</span>
            <input type="time" value={prefs.workEnd} onChange={(e) => update("workEnd", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs" />
          </div>
        </Row>
      </Section>

      {/* Privacy */}
      <Section icon={ShieldCheck} title="Privacy">
        <Row label="Export data" hint="Download all your Twinova data as JSON.">
          <button onClick={exportData} className="flex items-center gap-2 rounded-xl bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent/70">
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Delete account</p>
              <p className="text-xs text-muted-foreground">Permanently removes your tasks, chats, calendar, and profile. This can't be undone.</p>
              <div className="mt-3 flex gap-2">
                <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder='Type "DELETE"'
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-destructive/40" />
                <button onClick={deleteAccount} disabled={deleteInput !== "DELETE"}
                  className="rounded-xl bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* About */}
      <Section icon={Info} title="About">
        <Row label="Twinova AI"><span className="text-xs text-muted-foreground">v1.0.0</span></Row>
        <Row label="Built with love"><span className="text-xs text-muted-foreground">Built AI for India 🇮🇳</span></Row>
        <Row label="Privacy Policy">
          <a href="/privacy" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><FileText className="h-3.5 w-3.5" /> Read</a>
        </Row>
        <Row label="Terms & Conditions">
          <a href="/terms" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><FileText className="h-3.5 w-3.5" /> Read</a>
        </Row>
      </Section>

      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Timer className="h-3.5 w-3.5" /> Twinova AI — your personal executive assistant.
      </div>
    </div>
  );
}
