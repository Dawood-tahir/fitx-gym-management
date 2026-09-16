import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-panel border border-white/[.09] bg-card/90 shadow-panel", className)} {...props} />;
}
