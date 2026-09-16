import type { ReactNode } from "react";
import { Dumbbell, ShieldCheck, TrendingUp } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export function AuthShell({ children, eyebrow }: { children: ReactNode; eyebrow: string }) {
  return <main className="grid min-h-dvh bg-background lg:grid-cols-[1.08fr_.92fr]">
    <section className="relative hidden min-h-dvh overflow-hidden border-e border-white/[.07] bg-[url('/images/fitx-hero.png')] bg-cover bg-center lg:block">
      <div className="absolute inset-0 bg-gradient-to-r from-[#05090b]/90 via-[#071014]/55 to-[#071014]/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05090b] via-transparent to-[#05090b]/40" />
      <div className="relative flex h-full flex-col justify-between p-10 xl:p-14"><Logo /><div className="max-w-xl pb-8"><p className="text-xs font-bold uppercase tracking-[.26em] text-primary">{eyebrow}</p><h1 className="mt-4 text-balance text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-5xl">Run a stronger gym.<br /><span className="text-primary">Know every number.</span></h1><p className="mt-5 max-w-lg text-sm leading-7 text-white/65">Memberships, collections, expenses, reminders, and business performance—clear and controlled in one place.</p><div className="mt-8 flex flex-wrap gap-3 text-[11px] font-medium text-white/70"><span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2"><Dumbbell className="size-4 text-primary" />Memberships</span><span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2"><TrendingUp className="size-4 text-primary" />Financial clarity</span><span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2"><ShieldCheck className="size-4 text-primary" />Secure access</span></div></div><p className="text-[10px] uppercase tracking-[.25em] text-white/35">Train Better. Manage Smarter.</p></div>
    </section>
    <section className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10"><div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-primary/[.035] to-transparent" /><div className="relative w-full max-w-[430px]"><div className="mb-9 lg:hidden"><Logo /></div>{children}<p className="mt-8 text-center text-[10px] leading-relaxed text-muted">Protected by encrypted authentication and role-based access.<br />© {new Date().getFullYear()} FITX Gym Management.</p></div></section>
  </main>;
}
