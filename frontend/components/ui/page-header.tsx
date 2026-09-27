import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><div className="min-w-0"><h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-[28px]">{title}</h1>{description && <p className="mt-0.5 text-xs leading-relaxed text-secondary sm:mt-1 sm:text-sm">{description}</p>}</div>{actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}</div>;
}
