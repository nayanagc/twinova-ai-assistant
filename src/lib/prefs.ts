import { useEffect, useState } from "react";

export type ResponseStyle = "concise" | "balanced" | "detailed";

export type TwinovaPrefs = {
  notifDaily: boolean;
  notifDeadline: boolean;
  notifWeekly: boolean;
  aiStyle: ResponseStyle;
  aiDailyBrief: boolean;
  aiSmartPriority: boolean;
  voiceEnabled: boolean;
  voiceSpeed: number; // 0.5 - 2
  dailyStudyGoal: number; // minutes
  focusDuration: number; // minutes
  workStart: string; // HH:MM
  workEnd: string;
};

const KEY = "twinova-prefs";
const DEFAULTS: TwinovaPrefs = {
  notifDaily: true,
  notifDeadline: true,
  notifWeekly: true,
  aiStyle: "concise",
  aiDailyBrief: true,
  aiSmartPriority: true,
  voiceEnabled: true,
  voiceSpeed: 1,
  dailyStudyGoal: 120,
  focusDuration: 25,
  workStart: "09:00",
  workEnd: "18:00",
};

export function usePrefs() {
  const [prefs, setPrefs] = useState<TwinovaPrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* noop */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* noop */ }
  }, [prefs, ready]);

  const update = <K extends keyof TwinovaPrefs>(k: K, v: TwinovaPrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  return { prefs, update, ready };
}
