"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, Ban, CircleDollarSign, Plus, Search, Users } from "lucide-react";
import { api } from "@/services";
import { formatCurrency, formatDate, getErrorMessage, todayInput } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAuth } from "@/components/auth-provider";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { PaymentFormDialog } from "@/components/forms/payment-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Payment, PaymentSummary } from "@/types/api";

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { t, locale } = useLocale();
  const { can } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, error, loading, reload } = useApiQuery(
    () => api.payments.list({ page, pageSize: PAGE_SIZE, search, status, from, to }),
    [page, search, status, from, to],
  );
  const {
    data: summary,
    error: summaryError,
    loading: summaryLoading,
    reload: reloadSummary,
  } = useApiQuery(() => api.payments.summary(), []);

  const refresh = () => {
    reload();
    reloadSummary();
  };

  const openVoidDialog = (payment: Payment) => {
    setVoiding(payment);
    setVoidReason("");
    setVoidError("");
  };

  const closeVoidDialog = () => {
    if (voidBusy) return;
    setVoiding(null);
    setVoidReason("");
    setVoidError("");
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      setVoidError("Enter a brief reason for the audit trail.");
      return;
    }

    setVoidBusy(true);
    setVoidError("");
    try {
      await api.payments.void(voiding.id, reason);
      toast("Payment voided", {
        description: `${voiding.paymentId ?? voiding.receiptNumber ?? "Payment"} was reversed and retained in the audit history.`,
      });
      closeVoidDialogAfterSave();
      refresh();
    } catch (caught: unknown) {
      setVoidError(getErrorMessage(caught, "Could not void this payment."));
    } finally {
      setVoidBusy(false);
    }
  };

  const closeVoidDialogAfterSave = () => {
    setVoiding(null);
    setVoidReason("");
    setVoidError("");
  };

  const hasFilters = Boolean(query || status || from || to);
  const clearFilters = () => {
    setQuery("");
    setSearch("");
    setStatus("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t("payments.title")}
        description={t("payments.subtitle")}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            {t("payments.record")}
          </Button>
        }
      />

      <PaymentSummaryCards
        summary={summary}
        loading={summaryLoading}
        error={summaryError}
        locale={locale}
        onRetry={reloadSummary}
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_160px_160px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search member, payment ID, or reference"
              className="ps-10"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            aria-label="Payment status"
          >
            <option value="">All statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Voided">Voided</option>
          </Select>
          <Input
            type="date"
            value={from}
            max={to || todayInput()}
            onChange={(event) => { setFrom(event.target.value); setPage(1); }}
            aria-label="Payments from date"
            title="From date"
          />
          <Input
            type="date"
            value={to}
            min={from || undefined}
            max={todayInput()}
            onChange={(event) => { setTo(event.target.value); setPage(1); }}
            aria-label="Payments to date"
            title="To date"
          />
          <Button variant="secondary" onClick={clearFilters} disabled={!hasFilters}>
            Clear
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-primary" />
            <h2 className="text-sm font-bold">Payment history</h2>
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
              title={t("payments.noPayments")}
              description={hasFilters ? "No payment records match the selected filters." : t("payments.noPaymentsHint")}
              action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button size="sm" onClick={() => setFormOpen(true)}>{t("payments.record")}</Button>}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1120px] text-start text-xs">
                  <thead>
                    <tr className="bg-white/[.055] text-[10px] uppercase tracking-wide text-muted">
                      <th className="rounded-s-lg px-3 py-3 font-semibold">{t("payments.paymentId")}</th>
                      <th className="px-3 py-3 font-semibold">{t("common.date")}</th>
                      <th className="px-3 py-3 font-semibold">{t("payments.member")}</th>
                      <th className="px-3 py-3 font-semibold">Plan</th>
                      <th className="px-3 py-3 font-semibold">{t("payments.amountPaid")}</th>
                      <th className="px-3 py-3 font-semibold">{t("payments.balance")}</th>
                      <th className="px-3 py-3 font-semibold">{t("payments.method")}</th>
                      <th className="px-3 py-3 font-semibold">{t("payments.receivedBy")}</th>
                      <th className="px-3 py-3 font-semibold">{t("common.status")}</th>
                      <th className="rounded-e-lg px-3 py-3 text-end font-semibold">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((payment) => (
                      <tr key={payment.id} className={`border-b border-white/[.055] transition hover:bg-white/[.025] ${payment.status === "Voided" ? "opacity-60" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] text-muted">{payment.paymentId ?? payment.receiptNumber ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{formatDate(payment.date, locale)}</td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-foreground">{payment.memberName}</p>
                          {payment.referenceNumber && <p className="mt-0.5 max-w-40 truncate text-[10px] text-muted">{payment.referenceNumber}</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{payment.planName || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatCurrency(payment.amountPaid, locale)}</td>
                        <td className={`whitespace-nowrap px-3 py-3 ${(payment.balance ?? 0) > 0 ? "text-warning" : "text-secondary"}`}>{formatCurrency(payment.balance ?? 0, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{payment.method}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{payment.receivedBy || "—"}</td>
                        <td className="px-3 py-3"><StatusBadge status={payment.status} /></td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end">
                            {can("OWNER", "ADMIN") && payment.status !== "Voided" ? (
                              <button
                                type="button"
                                onClick={() => openVoidDialog(payment)}
                                className="rounded-lg p-2 text-secondary hover:bg-danger/10 hover:text-danger"
                                aria-label={`Void payment ${payment.paymentId ?? payment.id}`}
                                title="Void payment"
                              >
                                <Ban className="size-4" />
                              </button>
                            ) : <span className="text-muted">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {data.items.map((payment) => (
                  <article key={payment.id} className={`rounded-xl border border-white/[.08] bg-white/[.02] p-4 ${payment.status === "Voided" ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{payment.memberName}</h3>
                        <p className="mt-1 font-mono text-[10px] text-muted">{payment.paymentId ?? payment.receiptNumber ?? "Payment"}</p>
                      </div>
                      <StatusBadge status={payment.status} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <MobileInfo label={t("common.date")} value={formatDate(payment.date, locale)} />
                      <MobileInfo label={t("payments.method")} value={payment.method} />
                      <MobileInfo label={t("payments.amountPaid")} value={formatCurrency(payment.amountPaid, locale)} strong />
                      <MobileInfo label={t("payments.balance")} value={formatCurrency(payment.balance ?? 0, locale)} />
                    </dl>
                    {can("OWNER", "ADMIN") && payment.status !== "Voided" && (
                      <button
                        type="button"
                        onClick={() => openVoidDialog(payment)}
                        className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-danger/25 bg-danger/[.06] text-xs font-semibold text-danger"
                      >
                        <Ban className="size-4" />
                        Void payment
                      </button>
                    )}
                  </article>
                ))}
              </div>

              <div className="mt-4 border-t border-white/[.06] pt-4">
                <Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPageChange={setPage} />
              </div>
              {error && <p className="mt-3 text-center text-[10px] text-warning">Some payment data may be stale. {error.message}</p>}
            </>
          )}
        </div>
      </Card>

      <PaymentFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
      <Dialog
        open={Boolean(voiding)}
        onClose={closeVoidDialog}
        title="Void this payment?"
        description="This reverses the payment in financial totals. The original record remains in the audit trail."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeVoidDialog} disabled={voidBusy}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={voidBusy} onClick={confirmVoid}>
              <Ban className="size-4" />
              Void payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/20 bg-warning/[.06] p-3 text-xs text-secondary">
            <strong className="text-foreground">{voiding?.paymentId ?? voiding?.receiptNumber ?? "Payment"}</strong>
            <span className="mx-2 text-white/20">·</span>
            {voiding?.memberName}
            <span className="mx-2 text-white/20">·</span>
            {formatCurrency(voiding?.amountPaid ?? 0, locale)}
          </div>
          <label className="block space-y-2">
            <span className="text-xs font-medium text-secondary">Reason for voiding <span className="text-danger">*</span></span>
            <Textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Explain why this payment must be reversed"
              autoFocus
              disabled={voidBusy}
            />
            {voidError && <span className="block text-xs text-danger" role="alert">{voidError}</span>}
          </label>
        </div>
      </Dialog>
    </div>
  );
}

function PaymentSummaryCards({ summary, loading, error, locale, onRetry }: {
  summary: PaymentSummary | null;
  loading: boolean;
  error: Error | null;
  locale: "en" | "ur";
  onRetry: () => void;
}) {
  if (loading && !summary) {
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-panel bg-white/[.045]" />)}</div>;
  }
  if (error && !summary) {
    return (
      <Card className="flex flex-col items-center justify-between gap-3 border-danger/20 bg-danger/[.04] p-4 sm:flex-row">
        <p className="flex items-center gap-2 text-xs text-danger"><AlertTriangle className="size-4" />Could not load payment totals. {error.message}</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
      </Card>
    );
  }
  if (!summary) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={<CircleDollarSign />} label="Payments this period (10th–9th)" value={formatCurrency(summary.paymentsThisMonth, locale)} tone="green" />
      <SummaryCard icon={<Banknote />} label="Outstanding amount" value={formatCurrency(summary.outstandingAmount, locale)} tone="warning" />
      <SummaryCard icon={<Users />} label="Paid members" value={String(summary.paidMembers)} tone="blue" />
      <SummaryCard icon={<AlertTriangle />} label="Unpaid members" value={String(summary.unpaidMembers)} tone="danger" />
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "green" | "warning" | "blue" | "danger" }) {
  const classes = {
    green: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    blue: "bg-info/10 text-info",
    danger: "bg-danger/10 text-danger",
  };
  return (
    <Card className="flex min-h-24 items-center gap-3 p-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${classes[tone]} [&>svg]:size-5`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted">{label}</p>
        <p className="mt-1 truncate text-lg font-extrabold text-foreground">{value}</p>
      </div>
    </Card>
  );
}

function MobileInfo({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-[10px] text-muted">{label}</dt><dd className={`mt-0.5 ${strong ? "font-semibold text-foreground" : "text-secondary"}`}>{value}</dd></div>;
}
