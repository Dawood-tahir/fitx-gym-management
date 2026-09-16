"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, CheckCheck, ChevronDown, Languages, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, initials } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { useAuth } from "@/components/auth-provider";
import type { NotificationItem } from "@/types/api";

export function Topbar({ collapsed, onToggleSidebar, onOpenMobile }: { collapsed: boolean; onToggleSidebar: () => void; onOpenMobile: () => void }) {
  const { locale, setLocale, t } = useLocale();
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Array<{ type: string; id: string; title: string; subtitle?: string }>>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => api.search(term.trim()).then(setResults).catch(() => setResults([])), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [term]);

  useEffect(() => {
    api.notifications.list().then(setNotifications).catch(() => undefined);
  }, []);

  const unread = notifications.filter((item) => !item.isRead).length;
  return <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/[.055] bg-[#0a1317]/90 px-3 backdrop-blur-xl sm:px-5">
    <button onClick={onOpenMobile} className="rounded-lg p-2 text-foreground hover:bg-white/5 lg:hidden" aria-label={t("nav.openMenu")}><Menu className="size-5" /></button>
    <button onClick={onToggleSidebar} className="hidden rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-foreground lg:block" aria-label="Toggle sidebar">{collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}</button>
    <div className="relative me-auto hidden w-full max-w-[360px] sm:block">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input value={term} onChange={(event) => setTerm(event.target.value)} onFocus={() => setSearchOpen(true)} placeholder={t("nav.searchPlaceholder")} className="h-9 w-full rounded-full border border-white/[.055] bg-white/[.055] ps-10 pe-4 text-xs text-foreground outline-none transition placeholder:text-muted focus:border-primary/25 focus:bg-white/[.075]" />
      {searchOpen && term.length >= 2 && <div className="absolute inset-x-0 top-11 overflow-hidden rounded-xl border border-white/10 bg-elevated p-2 shadow-2xl"><div className="mb-1 flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-muted"><span>Search results</span><button onClick={() => setSearchOpen(false)}><X className="size-3" /></button></div>{results.length ? results.map((result) => <Link key={`${result.type}-${result.id}`} href={result.type.toLowerCase().includes("member") ? `/members/${result.id}` : result.type.toLowerCase().includes("payment") ? `/payments/${result.id}/receipt` : "/dashboard"} onClick={() => { setSearchOpen(false); setTerm(""); }} className="block rounded-lg px-3 py-2 hover:bg-white/5"><p className="text-xs font-semibold">{result.title}</p><p className="text-[10px] text-muted">{result.type}{result.subtitle ? ` · ${result.subtitle}` : ""}</p></Link>) : <p className="px-3 py-4 text-center text-xs text-muted">{t("common.noResults")}</p>}</div>}
    </div>
    <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-secondary hover:bg-white/5 sm:hidden" aria-label={t("common.search")}><Search className="size-5" /></button>
    <div className="hidden items-center gap-2 text-[11px] font-medium text-secondary xl:flex"><CalendarDays className="size-4 text-foreground" /><time dateTime={new Date().toISOString()}>{formatDate(new Date().toISOString(), locale)}</time></div>
    <div className="mx-1 hidden h-5 w-px bg-white/10 md:block" />
    <label className="relative flex items-center"><Languages className="pointer-events-none absolute start-2 size-4 text-secondary" /><select value={locale} onChange={(event) => setLocale(event.target.value as "en" | "ur")} aria-label="Language" className="h-9 appearance-none rounded-lg border border-white/[.07] bg-white/[.035] ps-8 pe-7 text-[11px] text-secondary outline-none hover:bg-white/[.06]"><option value="en">EN</option><option value="ur">اردو</option></select><ChevronDown className="pointer-events-none absolute end-2 size-3 text-muted" /></label>
    <div className="relative"><button onClick={() => setNotificationsOpen((value) => !value)} className="relative rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-foreground" aria-label={t("nav.notifications")}><Bell className="size-5" />{unread > 0 && <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full border-2 border-[#0a1317] bg-danger text-[8px] font-bold text-white">{Math.min(unread, 9)}</span>}</button>{notificationsOpen && <div className="absolute end-0 top-11 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-white/10 bg-elevated shadow-2xl"><div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3"><h3 className="text-sm font-semibold">{t("nav.notifications")}</h3><button onClick={async () => { await api.notifications.readAll().catch(() => undefined); setNotifications((items) => items.map((item) => ({ ...item, isRead: true }))); }} className="flex items-center gap-1 text-[10px] font-medium text-primary"><CheckCheck className="size-3" />{t("nav.markAllRead")}</button></div><div className="max-h-80 overflow-auto">{notifications.length ? notifications.map((item) => <button key={item.id} onClick={async () => { if (!item.isRead) await api.notifications.read(item.id).catch(() => undefined); setNotifications((items) => items.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry)); }} className="relative block w-full border-b border-white/[.05] px-4 py-3 text-start hover:bg-white/[.035]"><p className="pe-3 text-xs font-semibold text-foreground">{item.title}</p><p className="mt-1 text-[11px] leading-relaxed text-secondary">{item.message}</p>{!item.isRead && <span className="absolute end-4 top-4 size-1.5 rounded-full bg-primary" />}</button>) : <p className="px-4 py-10 text-center text-xs text-muted">No notifications</p>}</div></div>}</div>
    <div className="relative"><button onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/5"><span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary-hover text-[11px] font-extrabold text-[#062213]">{initials(user?.name)}</span><span className="hidden text-start lg:block"><span className="block max-w-24 truncate text-xs font-semibold">{user?.name ?? "Owner"}</span><span className="block text-[9px] text-muted">{user?.role ?? "OWNER"}</span></span><ChevronDown className="hidden size-3 text-muted lg:block" /></button>{profileOpen && <div className="absolute end-0 top-11 w-48 rounded-xl border border-white/10 bg-elevated p-2 shadow-2xl"><div className="border-b border-white/[.07] px-3 py-2"><p className="truncate text-xs font-semibold">{user?.name}</p><p className="truncate text-[10px] text-muted">{user?.email}</p></div><Link href="/settings" className="mt-1 block rounded-lg px-3 py-2 text-xs text-secondary hover:bg-white/5 hover:text-foreground">{t("nav.profile")}</Link><button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-start text-xs text-danger hover:bg-danger/10">{t("nav.signOut")}</button></div>}</div>
    {searchOpen && <button className="fixed inset-0 -z-10 cursor-default" onClick={() => setSearchOpen(false)} aria-label="Close search" />}
  </header>;
}
