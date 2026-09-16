import { AlertCircle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status?: string }) {
  const normalized = (status ?? "Unknown").toLowerCase();
  const success = ["active", "paid", "sent", "enabled"].includes(normalized);
  const warning = ["partial", "expiring soon", "pending"].includes(normalized);
  const danger = ["expired", "unpaid", "failed", "disabled"].includes(normalized);
  const Icon = success ? CheckCircle2 : warning ? Clock3 : danger ? XCircle : AlertCircle;
  return <span className={cn("inline-flex whitespace-nowrap items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", success && "border-primary/25 bg-primary/12 text-primary", warning && "border-warning/25 bg-warning/12 text-warning", danger && "border-danger/25 bg-danger/12 text-danger", !success && !warning && !danger && "border-white/10 bg-white/5 text-secondary")}><Icon className="size-3" />{status ?? "Unknown"}</span>;
}
