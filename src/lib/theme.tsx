import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
type Applied = "light" | "dark";

const ThemeContext = createContext<{
  theme: Applied;
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}>({
  theme: "dark",
  mode: "dark",
  toggle: () => {},
  setMode: () => {},
});

function systemPref(): Applied {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [theme, setTheme] = useState<Applied>("dark");

  useEffect(() => {
    const stored = (typeof localStorage !== "undefined" && localStorage.getItem("twinova-theme")) as
      | ThemeMode
      | null;
    const initial: ThemeMode = stored ?? "dark";
    setModeState(initial);
  }, []);

  useEffect(() => {
    const applied: Applied = mode === "system" ? systemPref() : mode;
    setTheme(applied);
    document.documentElement.classList.toggle("dark", applied === "dark");
    try {
      localStorage.setItem("twinova-theme", mode);
    } catch {
      /* noop */
    }
    if (mode === "system" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const next = mq.matches ? "dark" : "light";
        setTheme(next);
        document.documentElement.classList.toggle("dark", next === "dark");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        toggle: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
        setMode: setModeState,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
