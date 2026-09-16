"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastItem { id: number; title: string; description?: string; tone: "success" | "error"; }
interface ToastContextValue { toast: (title: string, options?: { description?: string; tone?: "success" | "error" }) => void; }
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const toast = useCallback((title: string, options?: { description?: string; tone?: "success" | "error" }) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-3), { id, title, description: options?.description, tone: options?.tone ?? "success" }]);
    window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 ltr:right-0 rtl:left-0" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cn("pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border bg-elevated p-4 shadow-panel", item.tone === "error" ? "border-danger/35" : "border-primary/35")}>
            {item.tone === "error" ? <XCircle className="mt-0.5 size-5 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />}
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{item.title}</p>{item.description && <p className="mt-1 text-xs text-secondary">{item.description}</p>}</div>
            <button onClick={() => dismiss(item.id)} className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground" aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
