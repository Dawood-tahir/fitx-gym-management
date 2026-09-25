"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Ellipsis, House, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { useAuth } from "@/components/auth-provider";

const items = [
  { href: "/dashboard", key: "dashboard", icon: House },
  { href: "/members", key: "members", icon: Users },
  { href: "/payments", key: "payments", icon: CreditCard },
] as const;

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const visibleItems = user?.role === "STAFF" ? items.filter((item) => item.href !== "/dashboard") : items;
  const moreActive = !visibleItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#071014]/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_rgba(0,0,0,.3)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
    <div className="mx-auto grid h-16 max-w-lg" style={{ gridTemplateColumns: `repeat(${visibleItems.length + 1}, minmax(0, 1fr))` }}>
      {visibleItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", active ? "text-primary" : "text-muted hover:text-white")}>
          {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary shadow-[0_0_12px_rgba(50,232,117,.8)]" /> : null}
          <Icon className="size-5" aria-hidden="true" />
          <span>{item.key === "dashboard" ? (locale === "ur" ? "ہوم" : "Home") : t(`nav.${item.key}`)}</span>
        </Link>;
      })}
      <button type="button" onClick={onMore} className={cn("relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary", moreActive ? "text-primary" : "text-muted hover:text-white")} aria-label={locale === "ur" ? "مزید نیویگیشن" : "More navigation"}>
        {moreActive ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary shadow-[0_0_12px_rgba(50,232,117,.8)]" /> : null}
        <Ellipsis className="size-5" aria-hidden="true" />
        <span>{locale === "ur" ? "مزید" : "More"}</span>
      </button>
    </div>
  </nav>;
}
