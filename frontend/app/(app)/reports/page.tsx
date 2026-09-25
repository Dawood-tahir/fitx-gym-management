"use client";

import { useMemo, useState } from "react";
import { Download, Printer, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { reportsService, type ReportRange, type ReportsData } from "@/services/reports";
import { formatCurrency, formatDate, todayInput } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

type Preset = "today" | "week" | "month" | "lastMonth" | "year" | "custom";
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentPeriodStart = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 10);
  if (date.getDate() < 10) start.setMonth(start.getMonth() - 1);
  return start;
};
function rangeFor(preset: Preset, custom: ReportRange): ReportRange {
  const now = new Date(); const today = todayInput();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { from: iso(start), to: today }; }
  if (preset === "month") return { from: iso(currentPeriodStart(now)), to: today };
  if (preset === "lastMonth") { const start = currentPeriodStart(now); const end = new Date(start); end.setDate(end.getDate() - 1); start.setMonth(start.getMonth() - 1); return { from: iso(start), to: iso(end) }; }
  if (preset === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return custom;
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return <Card className="p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p><p className={`mt-2 text-2xl font-extrabold tracking-tight ${tone}`}>{value}</p></Card>;
}
function Chart({ title, data, color, dataKey }: { title: string; data: ReportsData["revenueTrend"]; color: string; dataKey: "revenue" | "expenses" }) {
  return <Card className="p-4"><h2 className="mb-4 text-sm font-bold">{title}</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: -20 }}><CartesianGrid stroke="#344047" strokeOpacity={0.3} strokeDasharray="2 2" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#93A1AA", fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#93A1AA", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ background: "#101a1f", border: "1px solid #344047", borderRadius: 8 }} /><Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div></Card>;
}

export default function ReportsPage() {
  const { locale } = useLocale(); const [preset, setPreset] = useState<Preset>("month"); const [custom, setCustom] = useState<ReportRange>(() => { const now = new Date(); return { from: iso(currentPeriodStart(now)), to: todayInput() }; });
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const { data, error, loading, reload } = useApiQuery(() => reportsService.get(range), [range.from, range.to]);
  const exportCsv = () => {
    if (!data) return;
    const rows = [["Type", "Date", "Description", "Amount"], ...data.payments.map((item) => ["Payment", item.date, `${item.member ?? ""} ${item.plan ?? ""}`.trim(), item.amount]), ...data.recentExpenses.map((item) => ["Expense", item.date, `${item.category ?? ""} ${item.description ?? ""}`.trim(), -item.amount])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `fitx-report-${range.from}-to-${range.to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="space-y-5 animate-fade-up">
    <PageHeader title="Reports" description="Track your gym's financial and membership performance." actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={exportCsv} disabled={!data}><Download className="size-4" />CSV</Button><Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Print</Button></div>} />
    <Card className="p-3 print:hidden"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Select value={preset} onChange={(event) => setPreset(event.target.value as Preset)} className="sm:w-44"><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="lastMonth">Last Month</option><option value="year">This Year</option><option value="custom">Custom Range</option></Select>{preset === "custom" && <><Input type="date" value={custom.from} max={custom.to} onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} /><Input type="date" value={custom.to} min={custom.from} max={todayInput()} onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} /></>}<span className="text-xs text-muted">{formatDate(range.from, locale)} â€” {formatDate(range.to, locale)}</span></div></Card>
    {loading && !data ? <LoadingState rows={8} /> : error && !data ? <ErrorState title="Could not load reports" message="Please try again." onRetry={reload} /> : data ? <ReportBody data={data} locale={locale} /> : <EmptyState title="No report data available" description="Choose another period or add financial records." />}
  </div>;
}

function ReportBody({ data, locale }: { data: ReportsData; locale: "en" | "ur" }) {
  const hasData = data.revenue || data.expenses || data.newMembers;
  if (!hasData) return <EmptyState title="No report data available for this period." description="Financial and membership records will appear here once they are added." />;
  return <>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total Revenue" value={formatCurrency(data.revenue, locale)} tone="text-primary" /><Metric label="Total Expenses" value={formatCurrency(data.expenses, locale)} tone="text-purple" /><Metric label="Net Income" value={formatCurrency(data.netIncome, locale)} tone={data.netIncome >= 0 ? "text-primary" : "text-danger"} /><Metric label="New Members" value={String(data.newMembers)} tone="text-info" /></section>
    <section className="grid gap-3 xl:grid-cols-2"><Chart title="Revenue" data={data.revenueTrend} dataKey="revenue" color="#32E875" /><Chart title="Expenses" data={data.expenseTrend} dataKey="expenses" color="#9565F6" /></section>
    <section className="grid gap-3 xl:grid-cols-3"><Card className="p-4"><h2 className="text-sm font-bold">Financial overview</h2><dl className="mt-4 space-y-3 text-sm"><Line label="Revenue" value={data.revenue} /><Line label="Expenses" value={-data.expenses} /><div className="border-t border-white/10 pt-3"><Line label="Net income" value={data.netIncome} strong /></div></dl></Card><Card className="p-4"><h2 className="flex items-center gap-2 text-sm font-bold"><Users className="size-4 text-primary" />Membership</h2><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Active members" value={String(data.activeMembers)} /><Metric label="New members" value={String(data.newMembers)} /></div></Card><Card className="p-4"><h2 className="text-sm font-bold">Expense categories</h2><div className="mt-4 space-y-3">{data.expenseCategories.slice(0, 5).map((item) => <Line key={item.name} label={item.name} value={item.amount} />) || <p className="text-xs text-muted">No expenses in this period.</p>}</div></Card></section>
    <section className="grid gap-3 xl:grid-cols-2"><ReportTable title="Recent payments" headers={["Date", "Member", "Plan", "Method", "Amount"]} rows={data.payments.map((item) => [formatDate(item.date, locale), item.member ?? "â€”", item.plan ?? "â€”", item.method ?? "â€”", formatCurrency(item.amount, locale)])} /><ReportTable title="Recent expenses" headers={["Date", "Category", "Description", "Amount"]} rows={data.recentExpenses.map((item) => [formatDate(item.date, locale), item.category ?? "â€”", item.description ?? "â€”", formatCurrency(item.amount, locale)])} /></section>
    <section className="grid gap-3 xl:grid-cols-2"><ReportTable title="Plan breakdown" headers={["Plan", "Active memberships"]} rows={data.plans.map((item) => [item.name, String(item.count)])} /><ReportTable title="Upcoming membership expiries" headers={["Member", "Plan", "Expiry"]} rows={data.expiringMembers.map((item) => [item.member, item.plan, formatDate(item.expiry, locale)])} /></section>
  </>;
}
function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { const { locale } = useLocale(); return <div className={`flex items-center justify-between gap-3 ${strong ? "font-bold" : "text-secondary"}`}><dt>{label}</dt><dd className={value < 0 ? "text-danger" : "text-foreground"}>{value < 0 ? "âˆ’" : ""}{formatCurrency(Math.abs(value), locale)}</dd></div>; }
function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <Card className="overflow-hidden"><h2 className="border-b border-white/[.07] px-4 py-3 text-sm font-bold">{title}</h2>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-start text-xs"><thead><tr className="bg-white/[.04] text-[10px] uppercase text-muted">{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-white/[.05]">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-secondary">{cell}</td>)}</tr>)}</tbody></table></div> : <p className="p-4 text-xs text-muted">No data available.</p>}</Card>; }
