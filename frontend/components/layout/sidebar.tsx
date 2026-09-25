"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, Dumbbell, LayoutDashboard, MessageSquareText, ReceiptText, ShieldCheck, Tags, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { useAuth } from "@/components/auth-provider";
import { Logo } from "./logo";
import type { UserRole } from "@/types/api";

const items: Array<{ href: string; key: string; icon: typeof LayoutDashboard; roles: UserRole[] }> = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: ["OWNER", "ADMIN"] },
  { href: "/members", key: "members", icon: Users, roles: ["OWNER", "ADMIN", "STAFF"] },
  { href: "/payments", key: "payments", icon: CreditCard, roles: ["OWNER", "ADMIN", "STAFF"] },
  { href: "/expenses", key: "expenses", icon: ReceiptText, roles: ["OWNER", "ADMIN"] },
  { href: "/plans", key: "plans", icon: Tags, roles: ["OWNER", "ADMIN", "STAFF"] },
  { href: "/equipment", key: "equipment", icon: Wrench, roles: ["OWNER", "ADMIN", "STAFF"] },
  { href: "/complaints", key: "complaints", icon: MessageSquareText, roles: ["OWNER", "ADMIN", "STAFF"] },
  { href: "/reports", key: "reports", icon: BarChart3, roles: ["OWNER", "ADMIN"] },
  { href: "/staff", key: "staff", icon: ShieldCheck, roles: ["OWNER"] },
];

export function SidebarContent({ collapsed = false, mobile = false, onNavigate }: { collapsed?: boolean; mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useLocale();
  const { user, logout } = useAuth();
  return <div className="flex h-full flex-col overflow-hidden bg-[#071014]">
    <div className={cn("flex h-[92px] shrink-0 items-center border-b border-white/[.045]", collapsed ? "justify-center px-2" : "px-6")}><Logo compact={collapsed} /></div>
    <nav className={cn("space-y-1 px-3 py-5", collapsed && "px-2", mobile && "min-h-0 flex-1 overflow-y-auto")} aria-label="Main navigation">
      {items.filter((item) => !user || item.roles.includes(user.role)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? t(`nav.${item.key}`) : undefined} className={cn("group relative flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition", collapsed ? "justify-center px-2" : "px-3", active ? "bg-gradient-to-r from-primary/25 to-primary/10 text-white shadow-[inset_0_0_0_1px_rgba(50,232,117,.12)]" : "text-secondary hover:bg-white/[.045] hover:text-white")}>
          {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-primary" />}
          <Icon className={cn("size-[20px] shrink-0", active ? "text-primary" : "text-white/85 group-hover:text-primary")} />
          {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
        </Link>;
      })}
    </nav>
    {!mobile ? <div className="mt-auto min-h-0 flex-1" /> : null}
    {mobile ? <div className="shrink-0 border-t border-white/[.07] px-4 py-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">{t("settings.language")}</p>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[.035] p-1" role="group" aria-label={t("settings.language")}>
        <button type="button" onClick={() => setLocale("en")} className={cn("min-h-10 rounded-lg px-3 text-xs font-semibold", locale === "en" ? "bg-primary text-[#062213]" : "text-secondary hover:bg-white/5")}>English</button>
        <button type="button" onClick={() => setLocale("ur")} className={cn("min-h-10 rounded-lg px-3 text-xs font-semibold", locale === "ur" ? "bg-primary text-[#062213]" : "text-secondary hover:bg-white/5")}>اردو</button>
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-white/[.07] pt-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-[#062213]">{user?.name?.slice(0, 1).toUpperCase() ?? "O"}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user?.name ?? "Owner"}</p><p className="truncate text-[10px] text-muted">{user?.email}</p></div>
        <button type="button" onClick={logout} className="min-h-10 rounded-lg px-2 text-[11px] font-semibold text-danger hover:bg-danger/10">{t("nav.signOut")}</button>
      </div>
    </div> : null}
    {!mobile && !collapsed ? <div className="relative min-h-[260px] overflow-hidden border-t border-white/[.045] bg-[url('/images/fitx-sidebar.png')] bg-cover bg-[center_25%]">
      <div className="absolute inset-0 bg-gradient-to-b from-[#071014] via-[#071014]/35 to-[#071014]/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#071014]/35 to-transparent" />
      <div className="absolute inset-x-5 bottom-5"><Dumbbell className="mb-3 size-5 text-primary" /><p className="text-[17px] font-extrabold uppercase leading-tight text-white">Train better.<br />Manage <span className="text-primary">smarter.</span></p><p className="mt-3 text-[9px] font-semibold tracking-[.32em] text-white/60">FITX</p></div>
    </div> : !mobile ? <div className="flex h-20 items-center justify-center border-t border-white/[.045]"><Dumbbell className="size-5 text-primary" /></div> : null}
  </div>;
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return <aside className={cn("fixed inset-y-0 start-0 z-50 hidden border-e border-white/[.07] transition-[width] duration-200 lg:block", collapsed ? "w-[76px]" : "w-[220px]")}><SidebarContent collapsed={collapsed} /></aside>;
}
