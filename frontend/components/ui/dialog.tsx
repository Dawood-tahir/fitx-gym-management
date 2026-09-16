"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKeyDown); };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={cn("max-h-[92dvh] w-full overflow-hidden rounded-t-2xl border border-white/10 bg-elevated shadow-2xl sm:rounded-2xl", size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-xl", size === "lg" && "sm:max-w-3xl", size === "xl" && "sm:max-w-5xl")}>
        <header className="flex items-start justify-between gap-4 border-b border-white/[.08] px-5 py-4"><div><h2 id="dialog-title" className="text-base font-bold text-foreground">{title}</h2>{description && <p className="mt-1 text-xs leading-relaxed text-secondary">{description}</p>}</div><button onClick={onClose} className="rounded-lg p-2 text-muted transition hover:bg-white/5 hover:text-foreground" aria-label="Close"><X className="size-5" /></button></header>
        <div className="max-h-[calc(92dvh-130px)] overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-white/[.08] bg-background/30 px-5 py-4">{footer}</footer>}
      </section>
    </div>, document.body,
  );
}
