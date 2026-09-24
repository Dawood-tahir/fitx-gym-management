"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { PageLoading } from "@/components/ui/states";
import { Sidebar, SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("fitx-sidebar-collapsed");
    setCollapsed(stored ? stored === "true" : window.innerWidth < 1280);
  }, []);
  useEffect(() => { if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [ready, user, router, pathname]);
  useEffect(() => { if (ready && user?.role === "STAFF" && pathname.startsWith("/dashboard")) router.replace("/members"); }, [ready, user, pathname, router]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [mobileOpen]);

  if (!ready || !user) return <PageLoading />;
  const toggle = () => setCollapsed((value) => { localStorage.setItem("fitx-sidebar-collapsed", String(!value)); return !value; });
  return <div className="min-h-dvh bg-background/40">
    <Sidebar collapsed={collapsed} />
    {mobileOpen && <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm lg:hidden" onMouseDown={() => setMobileOpen(false)}><aside className="h-full w-[min(86vw,320px)] animate-slide-in border-e border-white/10 shadow-2xl" role="dialog" aria-modal="true" aria-label="Mobile navigation" onMouseDown={(event) => event.stopPropagation()}><button onClick={() => setMobileOpen(false)} className="absolute end-3 z-10 flex size-11 items-center justify-center rounded-xl bg-black/35 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ top: "max(.75rem, env(safe-area-inset-top))" }} aria-label="Close menu"><X className="size-5" /></button><SidebarContent mobile onNavigate={() => setMobileOpen(false)} /></aside></div>}
    <div className={cn("min-h-dvh transition-[padding] duration-200", collapsed ? "lg:ps-[76px]" : "lg:ps-[220px]")}>
      <Topbar collapsed={collapsed} onToggleSidebar={toggle} onOpenMobile={() => setMobileOpen(true)} />
      <main className="mx-auto w-full max-w-[1720px] px-4 pb-24 pt-4 sm:px-5 sm:py-5 lg:pb-5">{children}</main>
      <footer className="hidden flex-col gap-2 border-t border-white/[.055] px-5 py-5 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between lg:flex"><span><strong className="text-foreground">FITX</strong><span className="mx-2 text-white/15">|</span>Gym Management System</span><span className="flex items-center gap-2"><span className="h-px w-6 bg-primary" />Train Better. Manage Smarter.</span></footer>
      <MobileBottomNav onMore={() => setMobileOpen(true)} />
    </div>
  </div>;
}
