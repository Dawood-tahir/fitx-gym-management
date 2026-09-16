import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return <Link href="/dashboard" aria-label="FITX Dashboard" className={cn("inline-flex flex-col", className)}><span className={cn("font-black italic tracking-[-.08em] text-white", compact ? "text-2xl" : "text-[38px] leading-9")}><span>FIT</span><span className="text-primary">X</span></span>{!compact && <span className="mt-1 text-[9px] font-semibold uppercase tracking-[.27em] text-white/80">Gym Management</span>}</Link>;
}
