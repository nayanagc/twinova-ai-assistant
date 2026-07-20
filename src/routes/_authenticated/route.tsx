import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  MessageSquare,
  ListChecks,
  Calendar as CalendarIcon,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Sparkles,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DeadlineReminders } from "@/components/DeadlineReminders";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chat", label: "AI Chat", icon: MessageSquare },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarIcon },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  };

  const displayName = profile?.display_name || user.email?.split("@")[0] || "there";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="glass m-3 flex h-[calc(100vh-1.5rem)] flex-col rounded-3xl p-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl gradient-bg shadow-glow">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="font-display text-lg font-semibold">Twinova</span>
            </div>
            <button
              className="rounded-lg p-1.5 lg:hidden hover:bg-accent"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="mt-6 flex-1 space-y-1">
            {NAV.map((n) => {
              const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/");
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-2xl gradient-bg shadow-glow"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <button
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>

            <div className="flex items-center gap-3 rounded-2xl bg-accent/30 p-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full gradient-bg text-sm font-semibold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <button
                onClick={signOut}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between p-4 lg:hidden">
          <button
            className="glass rounded-2xl p-2.5"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl gradient-bg">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-display font-semibold">Twinova</span>
          </div>
          <span className="w-10" />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <DeadlineReminders userId={user.id} />
          <Outlet />
        </main>

      </div>
    </div>
  );
}
