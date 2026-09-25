"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, ReceiptText, Search, Tags, Trash2 } from "lucide-react";
import { api } from "@/services";
import { formatCurrency, formatDate, getErrorMessage, todayInput } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { ExpenseFormDialog } from "@/components/forms/expense-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import type { Expense, ExpenseSummary } from "@/types/api";

const PAGE_SIZE = 20;

export default function ExpensesPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, error, loading, reload } = useApiQuery(
    () => api.expenses.list({ page, pageSize: PAGE_SIZE, search, categoryId, from, to }),
    [page, search, categoryId, from, to],
  );
  const {
    data: summary,
    error: summaryError,
    loading: summaryLoading,
    reload: reloadSummary,
  } = useApiQuery(() => api.expenses.summary(), []);
  const {
    data: categories,
    error: categoriesError,
    loading: categoriesLoading,
    reload: reloadCategories,
  } = useApiQuery(() => api.expenses.categories(), []);

  const refresh = () => {
    reload();
    reloadSummary();
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.expenses.remove(deleting.id);
      toast("Expense deleted", {
        description: `${deleting.title ?? deleting.description} was removed from active reports and retained in audit history.`,
      });
      setDeleting(null);
      refresh();
    } catch (caught: unknown) {
      toast("Could not delete expense", { description: getErrorMessage(caught), tone: "error" });
    } finally {
      setDeleteBusy(false);
    }
  };

  const hasFilters = Boolean(query || categoryId || from || to);
  const clearFilters = () => {
    setQuery("");
    setSearch("");
    setCategoryId("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t("expenses.title")}
        description={t("expenses.subtitle")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            {t("expenses.add")}
          </Button>
        }
      />

      <ExpenseSummaryCards
        summary={summary}
        loading={summaryLoading}
        error={summaryError}
        locale={locale}
        onRetry={reloadSummary}
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_190px_160px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, description, or reference"
              className="ps-10"
            />
          </div>
          <Select
            value={categoryId}
            onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}
            disabled={categoriesLoading}
            aria-label="Expense category"
          >
            <option value="">{categoriesLoading ? "Loading categories…" : "All categories"}</option>
            {(categories ?? []).filter((category) => category.isActive !== false).map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <Input
            type="date"
            value={from}
            max={to || todayInput()}
            onChange={(event) => { setFrom(event.target.value); setPage(1); }}
            aria-label="Expenses from date"
            title="From date"
          />
          <Input
            type="date"
            value={to}
            min={from || undefined}
            max={todayInput()}
            onChange={(event) => { setTo(event.target.value); setPage(1); }}
            aria-label="Expenses to date"
            title="To date"
          />
          <Button variant="secondary" onClick={clearFilters} disabled={!hasFilters}>Clear</Button>
        </div>
        {categoriesError && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/20 bg-warning/[.05] px-3 py-2 text-[10px] text-warning">
            <span>Categories could not be loaded. {categoriesError.message}</span>
            <button type="button" onClick={reloadCategories} className="font-semibold underline underline-offset-2">Try again</button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-primary" />
            <h2 className="text-sm font-bold">Expense ledger</h2>
            {data && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{data.totalCount}</span>}
          </div>
          {loading && data && <span className="text-[10px] text-muted">Refreshing…</span>}
        </div>
        <div className="p-3 sm:p-4">
          {loading && !data ? (
            <LoadingState rows={8} />
          ) : error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data?.items.length ? (
            <EmptyState
              title={t("expenses.noExpenses")}
              description={hasFilters ? "No expense records match the selected filters." : t("expenses.noExpensesHint")}
              action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button size="sm" onClick={openCreate}>{t("expenses.add")}</Button>}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1080px] text-start text-xs">
                  <thead>
                    <tr className="bg-white/[.055] text-[10px] uppercase tracking-wide text-muted">
                      <th className="rounded-s-lg px-3 py-3 font-semibold">Expense</th>
                      <th className="px-3 py-3 font-semibold">{t("expenses.category")}</th>
                      <th className="px-3 py-3 font-semibold">{t("common.date")}</th>
                      <th className="px-3 py-3 font-semibold">{t("common.amount")}</th>
                      <th className="px-3 py-3 font-semibold">{t("expenses.paymentMethod")}</th>
                      <th className="px-3 py-3 font-semibold">{t("expenses.reference")}</th>
                      <th className="px-3 py-3 font-semibold">{t("expenses.addedBy")}</th>
                      <th className="rounded-e-lg px-3 py-3 text-end font-semibold">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((expense) => (
                      <tr key={expense.id} className="border-b border-white/[.055] transition hover:bg-white/[.025]">
                        <td className="max-w-72 px-3 py-3">
                          <p className="truncate font-semibold text-foreground">{expense.title || expense.description}</p>
                          {expense.title && <p className="mt-0.5 truncate text-[10px] text-muted">{expense.description}</p>}
                          {expense.expenseNumber && <p className="mt-0.5 font-mono text-[9px] text-muted">{expense.expenseNumber}</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{expense.category}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{formatDate(expense.date, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatCurrency(expense.amount, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{expense.paymentMethod || "—"}</td>
                        <td className="max-w-40 truncate px-3 py-3 text-secondary">{expense.reference || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{expense.addedBy || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => openEdit(expense)} className="rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-primary" aria-label={`Edit ${expense.title ?? expense.description}`}>
                              <Pencil className="size-4" />
                            </button>
                            <button type="button" onClick={() => setDeleting(expense)} className="rounded-lg p-2 text-secondary hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${expense.title ?? expense.description}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {data.items.map((expense) => (
                  <article key={expense.id} className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{expense.title || expense.description}</h3>
                        <p className="mt-1 text-[10px] text-muted">{expense.category} · {formatDate(expense.date, locale)}</p>
                      </div>
                      <strong className="shrink-0 text-sm text-foreground">{formatCurrency(expense.amount, locale)}</strong>
                    </div>
                    {expense.title && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-secondary">{expense.description}</p>}
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <MobileInfo label={t("expenses.paymentMethod")} value={expense.paymentMethod || "—"} />
                      <MobileInfo label={t("expenses.addedBy")} value={expense.addedBy || "—"} />
                    </dl>
                    <div className="mt-4 flex gap-2 border-t border-white/[.055] pt-3">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(expense)}><Pencil className="size-4" />{t("common.edit")}</Button>
                      <Button variant="danger" size="sm" className="flex-1" onClick={() => setDeleting(expense)}><Trash2 className="size-4" />{t("common.delete")}</Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 border-t border-white/[.06] pt-4">
                <Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPageChange={setPage} />
              </div>
              {error && <p className="mt-3 text-center text-[10px] text-warning">Some expense data may be stale. {error.message}</p>}
            </>
          )}
        </div>
      </Card>

      <ExpenseFormDialog open={formOpen} expense={editing} onClose={closeForm} onSaved={refresh} />
      <Dialog
        open={Boolean(deleting)}
        onClose={() => { if (!deleteBusy) setDeleting(null); }}
        title={t("expenses.deleteTitle")}
        description="This expense will leave normal reports but remain available to the audit system."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}><Trash2 className="size-4" />{t("common.delete")}</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-secondary">
          Delete <strong className="text-foreground">{deleting?.title ?? deleting?.description}</strong> for <strong className="text-foreground">{formatCurrency(deleting?.amount ?? 0, locale)}</strong>?
        </p>
      </Dialog>
    </div>
  );
}

function ExpenseSummaryCards({ summary, loading, error, locale, onRetry }: {
  summary: ExpenseSummary | null;
  loading: boolean;
  error: Error | null;
  locale: "en" | "ur";
  onRetry: () => void;
}) {
  if (loading && !summary) {
    return <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-panel bg-white/[.045]" />)}</div>;
  }
  if (error && !summary) {
    return (
      <Card className="flex flex-col items-center justify-between gap-3 border-danger/20 bg-danger/[.04] p-4 sm:flex-row">
        <p className="text-xs text-danger">Could not load expense totals. {error.message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
      </Card>
    );
  }
  if (!summary) return null;
  const increased = summary.changePercentFromLastMonth >= 0;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <SummaryCard icon={<ReceiptText />} label="Expenses this period (10th–9th)" value={formatCurrency(summary.totalThisMonth, locale)} tone="purple" />
      <SummaryCard icon={<Tags />} label="Largest category" value={summary.largestCategory || "No expenses yet"} tone="blue" />
      <Card className="flex min-h-24 items-center gap-3 p-4">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${increased ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}>
          {increased ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
        </span>
        <div>
          <p className="text-[10px] text-muted">Compared with last month</p>
          <p className={`mt-1 text-lg font-extrabold ${increased ? "text-danger" : "text-primary"}`}>{Math.abs(summary.changePercentFromLastMonth)}% {increased ? "higher" : "lower"}</p>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "purple" | "blue" }) {
  return (
    <Card className="flex min-h-24 items-center gap-3 p-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone === "purple" ? "bg-purple/10 text-purple" : "bg-info/10 text-info"} [&>svg]:size-5`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted">{label}</p>
        <p className="mt-1 truncate text-lg font-extrabold text-foreground">{value}</p>
      </div>
    </Card>
  );
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] text-muted">{label}</dt><dd className="mt-0.5 truncate text-secondary">{value}</dd></div>;
}
