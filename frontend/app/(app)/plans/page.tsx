"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, CircleDollarSign, Pencil, Plus, Search, ShieldCheck, Tag, XCircle } from "lucide-react";
import { api } from "@/services";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAuth } from "@/components/auth-provider";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { PlanFormDialog } from "@/components/forms/plan-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MembershipPlan } from "@/types/api";

const PAGE_SIZE = 9;

export default function PlansPage() {
  const { t, locale } = useLocale();
  const { can } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [deactivating, setDeactivating] = useState<MembershipPlan | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const { data: plans, error, loading, reload } = useApiQuery(() => api.plans.list(), []);
  const canManage = can("OWNER", "ADMIN");

  const filteredPlans = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (plans ?? []).filter((plan) => {
      if (status === "active" && !plan.isActive) return false;
      if (status === "inactive" && plan.isActive) return false;
      if (!term) return true;
      return plan.name.toLocaleLowerCase().includes(term) || plan.description?.toLocaleLowerCase().includes(term);
    });
  }, [plans, query, status]);

  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE));
  const pageItems = filteredPlans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activePlans = (plans ?? []).filter((plan) => plan.isActive);
  const startingPrice = activePlans.length ? Math.min(...activePlans.map((plan) => plan.price)) : 0;
  const averageDuration = activePlans.length
    ? Math.round(activePlans.reduce((total, plan) => total + plan.durationMonths, 0) / activePlans.length)
    : 0;

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditing(plan);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    setDeactivateBusy(true);
    try {
      await api.plans.deactivate(deactivating.id);
      toast("Membership plan deactivated", {
        description: `${deactivating.name} can no longer be assigned to new memberships.`,
      });
      setDeactivating(null);
      reload();
    } catch (caught: unknown) {
      toast("Could not deactivate plan", { description: getErrorMessage(caught), tone: "error" });
    } finally {
      setDeactivateBusy(false);
    }
  };

  const hasFilters = Boolean(query || status);
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t("settings.plans")}
        description="Create, price, and retire the memberships offered by FITX."
        actions={canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add plan
          </Button>
        ) : undefined}
      />

      {loading && !plans ? (
        <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-panel bg-white/[.045]" />)}</div>
      ) : plans ? (
        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard icon={<Tag />} label="Available plans" value={String(activePlans.length)} tone="green" />
          <SummaryCard icon={<CircleDollarSign />} label="Starting price" value={formatCurrency(startingPrice, locale)} tone="blue" />
          <SummaryCard icon={<CalendarRange />} label="Average duration" value={`${averageDuration} ${averageDuration === 1 ? "month" : "months"}`} tone="purple" />
        </section>
      ) : null}

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" className="ps-10" />
          </div>
          <Select value={status} onChange={(event) => setStatus(event.target.value as "" | "active" | "inactive")} aria-label="Plan status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Button variant="secondary" onClick={clearFilters} disabled={!hasFilters}>Clear</Button>
        </div>
      </Card>

      {loading && !plans ? (
        <Card className="p-4"><LoadingState rows={6} /></Card>
      ) : error && !plans ? (
        <ErrorState title="Could not load membership plans" message={error.message} onRetry={reload} />
      ) : !pageItems.length ? (
        <EmptyState
          title={hasFilters ? "No plans match these filters" : "No membership plans yet"}
          description={hasFilters ? "Try a different name or status." : "Create the first plan members can subscribe to."}
          action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : canManage ? <Button size="sm" onClick={openCreate}><Plus className="size-4" />Add plan</Button> : undefined}
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((plan) => (
              <Card key={plan.id} className={`group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/15 ${plan.isActive ? "" : "opacity-70"}`}>
                <div className="absolute -end-10 -top-10 size-28 rounded-full bg-primary opacity-[.035] blur-xl" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-extrabold text-foreground">{plan.name}</h2>
                      <p className="mt-1 text-xs text-secondary">{plan.durationMonths} {plan.durationMonths === 1 ? "month" : "months"}</p>
                    </div>
                    <StatusBadge status={plan.isActive ? "Active" : "Inactive"} />
                  </div>
                  <p className="mt-5 text-2xl font-black tracking-tight text-primary">{formatCurrency(plan.price, locale)}</p>
                  <p className="mt-3 min-h-10 text-xs leading-relaxed text-secondary">{plan.description || "No description provided."}</p>
                  {canManage && (
                    <div className="mt-5 flex gap-2 border-t border-white/[.06] pt-4">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                        <Pencil className="size-4" />
                        {t("common.edit")}
                      </Button>
                      {plan.isActive && (
                        <Button variant="danger" size="sm" className="flex-1" onClick={() => setDeactivating(plan)}>
                          <XCircle className="size-4" />
                          Deactivate
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </section>
          <Card className="p-4">
            <Pagination page={page} totalPages={totalPages} totalCount={filteredPlans.length} onPageChange={setPage} />
            {error && <p className="mt-3 text-center text-[10px] text-warning">Some plan data may be stale. {error.message}</p>}
          </Card>
        </>
      )}

      {!canManage && (
        <Card className="flex items-start gap-3 border-info/20 bg-info/[.04] p-4 text-xs text-secondary">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
          <p>You can review membership plans. An owner or administrator is required to create, edit, or deactivate them.</p>
        </Card>
      )}

      <PlanFormDialog open={formOpen} plan={editing} onClose={closeForm} onSaved={() => reload()} />
      <Dialog
        open={Boolean(deactivating)}
        onClose={() => { if (!deactivateBusy) setDeactivating(null); }}
        title="Deactivate this membership plan?"
        description="Existing memberships keep their original plan and price. Only new assignments are prevented."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivating(null)} disabled={deactivateBusy}>{t("common.cancel")}</Button>
            <Button variant="danger" loading={deactivateBusy} onClick={confirmDeactivate}><XCircle className="size-4" />Deactivate</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-secondary">
          Deactivate <strong className="text-foreground">{deactivating?.name}</strong>? It will disappear from new-member and renewal selections.
        </p>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "green" | "blue" | "purple" }) {
  const classes = tone === "green" ? "bg-primary/10 text-primary" : tone === "blue" ? "bg-info/10 text-info" : "bg-purple/10 text-purple";
  return (
    <Card className="flex min-h-24 items-center gap-3 p-4">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${classes} [&>svg]:size-5`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted">{label}</p>
        <p className="mt-1 truncate text-lg font-extrabold text-foreground">{value}</p>
      </div>
    </Card>
  );
}
