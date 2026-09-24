"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, UserX, Users } from "lucide-react";
import { api } from "@/services";
import { formatCurrency, formatDate, getErrorMessage, initials } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { StaffFormDialog } from "@/components/forms/staff-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Staff } from "@/types/api";

export default function StaffPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [position, setPosition] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [deactivating, setDeactivating] = useState<Staff | null>(null);
  const [deactivatingBusy, setDeactivatingBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, error, loading, reload } = useApiQuery(
    () => api.staff.list({ page, pageSize: 20, search, status, position }),
    [page, search, status, position],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (staff: Staff) => {
    setEditing(staff);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const deactivateStaff = async () => {
    if (!deactivating) return;
    setDeactivatingBusy(true);
    try {
      await api.staff.disable(deactivating.id);
      toast("Staff member deactivated", {
        description: `${deactivating.fullName} can no longer be treated as active staff.`,
      });
      setDeactivating(null);
      reload();
    } catch (error) {
      toast("Could not deactivate staff member", {
        description: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setDeactivatingBusy(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Staff"
        description="Manage gym employees, employment details, and active status."
        actions={<Button onClick={openCreate}><Plus className="size-4" />Add staff member</Button>}
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, email, or position"
              className="ps-10"
              aria-label="Search staff"
            />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Staff status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Select value={position} onChange={(event) => { setPosition(event.target.value); setPage(1); }} aria-label="Staff position">
            <option value="">All positions</option>
            <option value="Manager">Manager</option>
            <option value="Receptionist">Receptionist</option>
            <option value="Cleaner">Cleaner</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Other">Other</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden" aria-busy={loading}>
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-3">
          <Users className="size-4 text-primary" />
          <h2 className="text-sm font-bold">Staff directory</h2>
          {data && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{data.totalCount}</span>}
        </div>
        <div className="p-3 sm:p-4">
          {loading && !data ? (
            <LoadingState rows={7} />
          ) : error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data?.items.length ? (
            <EmptyState
              title="No staff members found"
              description={search || status || position ? "Try changing your search or filters." : "Add the first employee to build your staff directory."}
              action={<Button size="sm" onClick={openCreate}><Plus className="size-4" />Add staff member</Button>}
            />
          ) : (
            <>
              {error && <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/[.05] px-3 py-2 text-xs text-danger">{error.message}</div>}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[960px] text-start text-xs">
                  <thead>
                    <tr className="bg-white/[.055] text-[10px] uppercase tracking-wide text-muted">
                      <th className="rounded-s-lg px-3 py-3 font-semibold">Staff member</th>
                      <th className="px-3 py-3 font-semibold">Contact</th>
                      <th className="px-3 py-3 font-semibold">Position</th>
                      <th className="px-3 py-3 font-semibold">Hire date</th>
                      <th className="px-3 py-3 font-semibold">Salary</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="rounded-e-lg px-3 py-3 text-end font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((staff) => (
                      <tr key={staff.id} className="border-b border-white/[.055] transition hover:bg-white/[.025]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[11px] font-bold text-primary">{initials(staff.fullName)}</span>
                            <div className="min-w-0"><p className="font-semibold text-foreground">{staff.fullName}</p><p className="mt-0.5 truncate text-[10px] text-muted">{staff.email || "No email"}</p></div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary" dir="ltr">{staff.phone}</td>
                        <td className="px-3 py-3 font-medium">{staff.position}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-secondary">{formatDate(staff.hireDate, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium">{staff.salary === undefined ? "—" : formatCurrency(staff.salary, locale)}</td>
                        <td className="px-3 py-3"><StatusBadge status={staff.status} /></td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEdit(staff)} className="rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-primary" aria-label={`Edit ${staff.fullName}`}><Pencil className="size-4" /></button>
                            {staff.status === "Active" && <button onClick={() => setDeactivating(staff)} className="rounded-lg p-2 text-secondary hover:bg-danger/10 hover:text-danger" aria-label={`Deactivate ${staff.fullName}`}><UserX className="size-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {data.items.map((staff) => (
                  <article key={staff.id} className="rounded-xl border border-white/[.08] bg-white/[.02] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">{initials(staff.fullName)}</span>
                      <div className="min-w-0 flex-1"><h3 className="font-semibold">{staff.fullName}</h3><p className="mt-1 truncate text-xs text-secondary">{staff.position}</p></div>
                      <StatusBadge status={staff.status} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div><dt className="text-[10px] text-muted">Phone</dt><dd className="mt-0.5 text-secondary" dir="ltr">{staff.phone}</dd></div>
                      <div><dt className="text-[10px] text-muted">Hire date</dt><dd className="mt-0.5 text-secondary">{formatDate(staff.hireDate, locale)}</dd></div>
                      <div className="col-span-2"><dt className="text-[10px] text-muted">Email</dt><dd className="mt-0.5 truncate text-secondary">{staff.email || "No email"}</dd></div>
                    </dl>
                    <div className="mt-4 flex gap-2 border-t border-white/[.055] pt-3">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(staff)}><Pencil className="size-4" />Edit</Button>
                      {staff.status === "Active" && <Button variant="danger" size="sm" className="flex-1" onClick={() => setDeactivating(staff)}><UserX className="size-4" />Deactivate</Button>}
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 border-t border-white/[.06] pt-4">
                <Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPageChange={setPage} />
              </div>
            </>
          )}
        </div>
      </Card>

      <StaffFormDialog open={formOpen} staff={editing} onClose={closeForm} onSaved={reload} />
      <Dialog
        open={Boolean(deactivating)}
        onClose={() => { if (!deactivatingBusy) setDeactivating(null); }}
        title="Deactivate staff member?"
        description="The employment record is retained for history and reporting."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivating(null)} disabled={deactivatingBusy}>Cancel</Button>
            <Button variant="danger" loading={deactivatingBusy} onClick={deactivateStaff}><UserX className="size-4" />Deactivate</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-secondary">Deactivate <strong className="text-foreground">{deactivating?.fullName}</strong>? They will no longer appear in active-staff results.</p>
      </Dialog>
    </div>
  );
}
