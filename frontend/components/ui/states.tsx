import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";
import { Button } from "./button";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[.045]" />)}</div>;
}

export function PageLoading() {
  return <div className="flex min-h-[50vh] items-center justify-center"><LoaderCircle className="size-7 animate-spin text-primary" /><span className="sr-only">Loading</span></div>;
}

export function ErrorState({ title = "Could not load this data", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-danger/20 bg-danger/[.04] p-6 text-center"><AlertTriangle className="size-8 text-danger" /><h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>{message && <p className="mt-1 max-w-md text-xs text-secondary">{message}</p>}{onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[.018] p-7 text-center"><div className="rounded-xl bg-white/5 p-3"><Inbox className="size-6 text-muted" /></div><h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>{description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-secondary">{description}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
