"use client";

import { useEffect, useState } from "react";
import { Archive, Dumbbell, Pencil, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { formatCurrency, formatDate, getErrorMessage } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { EquipmentFormDialog } from "@/components/forms/equipment-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Equipment } from "@/types/api";

export default function EquipmentPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [condition, setCondition] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [retiring, setRetiring] = useState<Equipment | null>(null);
  const [retiringBusy, setRetiringBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, error, loading, reload } = useApiQuery(
    () => api.equipment.list({ page, pageSize: 20, search, status, condition }),
    [page, search, status, condition],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (equipment: Equipment) => {
    setEditing(equipment);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const retireEquipment = async () => {
    if (!retiring) return;
    setRetiringBusy(true);
    try {
      await api.equipment.retire(retiring.id);
      toast("Equipment retired", { description: `${retiring.name} remains available in asset history.` });
      setRetiring(null);
      reload();
    } catch (error) {
      toast("Could not retire equipment", { description: getErrorMessage(error), tone: "error" });
    } finally {
      setRetiringBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Equipment"
        description="Track gym assets, condition, status, and maintenance dates."
        actions={<Button onClick={openCreate}><Plus className="size-4" />Add equipment</Button>}
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search equipment, brand, model, or serial" className="ps-10" aria-label="Search equipment" />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Equipment status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="damaged">Damaged</option>
            <option value="retired">Retired</option>
          </Select>
          <Select value={condition} onChange={(event) => { setCondition(event.target.value); setPage(1); }} aria-label="Equipment condition">
            <option value="">All conditions</option>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden" aria-busy={loading}>
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-3">
          <Dumbbell className="size-4 text-primary" />
          <h2 className="text-sm font-bold">Asset register</h2>
          {data && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{data.totalCount}</span>}
        </div>
        <div className="p-3 sm:p-4">
          {loading && !data ? (
            <LoadingState rows={7} />
          ) : error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data?.items.length ? (
            <EmptyState
              title="No equipment found"
              description={search || status || condition ? "Try changing your search or filters." : "Add the first asset to start the equipment register."}
              action={<Button size="sm" onClick={openCreate}><Plus className="size-4" />Add equipment</Button>}
            />
          ) : (
            <>
              {error && <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/[.05] px-3 py-2 text-xs text-danger">{error.message}</div>}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] text-start text-xs">
                  <thead>
                    <tr className="bg-white/[.055] text-[10px] uppercase tracking-wide text-muted">
                      <th className="rounded-s-lg px-3 py-3 font-semibold">Equipment</th>
                      <th className="px-3 py-3 font-semibold">Category</th>
                      <th className="px-3 py-3 font-semibold">Condition</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Purchase</th>
                      <th className="px-3 py-3 font-semibold">Next maintenance</th>
                      <th className="rounded-e-lg px-3 py-3 text-end font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((equipment) => (
                      <tr key={equipment.id} className="border-b border-white/[.055] transition hover:bg-white/[.025]">
                        <td className="px-3 py-3"><p className="font-semibold text-foreground">{equipment.name}</p><p className="mt-0.5 max-w-56 truncate text-[10px] text-muted">{[equipment.brand, equipment.model, equipment.serialNumber].filter(Boolean).join(" · ") || "No asset identifiers"}</p></td>
                        <td className="px-3 py-3 text-secondary">{equipment.category || "Uncategorized"}</td>
                        <td className="px-3 py-3"><StatusBadge status={equipment.condition} /></td>
                        <td className="px-3 py-3"><StatusBadge status={equipment.status} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary"><p>{formatDate(equipment.purchaseDate, locale)}</p>{equipment.purchasePrice !== undefined && <p className="mt-0.5 font-medium text-foreground">{formatCurrency(equipment.purchasePrice, locale)}</p>}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{formatDate(equipment.nextMaintenanceDate, locale)}</td>
                        <td className="px-3 py-3"><div className="flex justify-end gap-1"><button onClick={() => openEdit(equipment)} className="rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-primary" aria-label={`Edit ${equipment.name}`}><Pencil className="size-4" /></button>{equipment.status !== "Retired" && <button onClick={() => setRetiring(equipment)} className="rounded-lg p-2 text-secondary hover:bg-danger/10 hover:text-danger" aria-label={`Retire ${equipment.name}`}><Archive className="size-4" /></button>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:hidden">
                {data.items.map((equipment) => (
                  <article key={equipment.id} className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{equipment.name}</h3><p className="mt-1 truncate text-xs text-secondary">{equipment.category || "Uncategorized"}</p></div><StatusBadge status={equipment.status} /></div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-muted">Condition</dt><dd className="mt-1"><StatusBadge status={equipment.condition} /></dd></div><div><dt className="text-[10px] text-muted">Serial number</dt><dd className="mt-0.5 truncate text-secondary">{equipment.serialNumber || "—"}</dd></div><div><dt className="text-[10px] text-muted">Last maintenance</dt><dd className="mt-0.5 text-secondary">{formatDate(equipment.lastMaintenanceDate, locale)}</dd></div><div><dt className="text-[10px] text-muted">Next maintenance</dt><dd className="mt-0.5 text-secondary">{formatDate(equipment.nextMaintenanceDate, locale)}</dd></div></dl>
                    <div className="mt-4 flex gap-2 border-t border-white/[.055] pt-3"><Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(equipment)}><Pencil className="size-4" />Edit</Button>{equipment.status !== "Retired" && <Button variant="danger" size="sm" className="flex-1" onClick={() => setRetiring(equipment)}><Archive className="size-4" />Retire</Button>}</div>
                  </article>
                ))}
              </div>

              <div className="mt-4 border-t border-white/[.06] pt-4"><Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPageChange={setPage} /></div>
            </>
          )}
        </div>
      </Card>

      <EquipmentFormDialog open={formOpen} equipment={editing} onClose={closeForm} onSaved={reload} />
      <Dialog
        open={Boolean(retiring)}
        onClose={() => { if (!retiringBusy) setRetiring(null); }}
        title="Retire equipment?"
        description="Retired equipment remains in the register and historical reports."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setRetiring(null)} disabled={retiringBusy}>Cancel</Button><Button variant="danger" loading={retiringBusy} onClick={retireEquipment}><Archive className="size-4" />Retire equipment</Button></>}
      >
        <p className="text-sm leading-relaxed text-secondary">Retire <strong className="text-foreground">{retiring?.name}</strong>? Use Edit instead if it is temporarily under maintenance.</p>
      </Dialog>
    </div>
  );
}
