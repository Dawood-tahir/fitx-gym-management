"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, MessageSquare, Pencil, Plus, Search } from "lucide-react";
import { api } from "@/services";
import { formatDate } from "@/lib/utils";
import { useApiQuery } from "@/hooks/use-api-query";
import { useLocale } from "@/components/locale-provider";
import { ComplaintFormDialog, ResolveComplaintDialog } from "@/components/forms/complaint-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Complaint } from "@/types/api";

export default function ComplaintsPage() {
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [viewing, setViewing] = useState<Complaint | null>(null);
  const [resolving, setResolving] = useState<Complaint | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, error, loading, reload } = useApiQuery(
    () => api.complaints.list({ page, pageSize: 20, search, status, type, priority }),
    [page, search, status, type, priority],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (complaint: Complaint) => {
    setEditing(complaint);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Complaints & feedback"
        description="Review member concerns, suggestions, feedback, and resolution history."
        actions={<Button onClick={openCreate}><Plus className="size-4" />Record feedback</Button>}
      />

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_170px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, message, member, or phone" className="ps-10" aria-label="Search complaints and feedback" />
          </div>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Case status">
            <option value="">All statuses</option><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </Select>
          <Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} aria-label="Feedback type">
            <option value="">All types</option><option value="complaint">Complaints</option><option value="suggestion">Suggestions</option><option value="feedback">Feedback</option>
          </Select>
          <Select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} aria-label="Case priority">
            <option value="">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden" aria-busy={loading}>
        <div className="flex items-center gap-2 border-b border-white/[.07] px-4 py-3"><MessageSquare className="size-4 text-primary" /><h2 className="text-sm font-bold">Case inbox</h2>{data && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{data.totalCount}</span>}</div>
        <div className="p-3 sm:p-4">
          {loading && !data ? (
            <LoadingState rows={7} />
          ) : error && !data ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : !data?.items.length ? (
            <EmptyState title="No complaints or feedback found" description={search || status || type || priority ? "Try changing your search or filters." : "New cases will appear here when they are recorded."} action={<Button size="sm" onClick={openCreate}><Plus className="size-4" />Record feedback</Button>} />
          ) : (
            <>
              {error && <div role="alert" className="mb-4 rounded-lg border border-danger/20 bg-danger/[.05] px-3 py-2 text-xs text-danger">{error.message}</div>}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1050px] text-start text-xs">
                  <thead><tr className="bg-white/[.055] text-[10px] uppercase tracking-wide text-muted"><th className="rounded-s-lg px-3 py-3 font-semibold">Case</th><th className="px-3 py-3 font-semibold">Submitted by</th><th className="px-3 py-3 font-semibold">Type</th><th className="px-3 py-3 font-semibold">Priority</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Created</th><th className="rounded-e-lg px-3 py-3 text-end font-semibold">Actions</th></tr></thead>
                  <tbody>{data.items.map((complaint) => <tr key={complaint.id} className="border-b border-white/[.055] transition hover:bg-white/[.025]"><td className="max-w-sm px-3 py-3"><button onClick={() => setViewing(complaint)} className="max-w-full text-start font-semibold text-foreground hover:text-primary">{complaint.subject}</button><p className="mt-0.5 truncate text-[10px] text-muted">{complaint.message}</p></td><td className="px-3 py-3"><p className="font-medium">{complaint.memberName || complaint.name || "Anonymous"}</p><p className="mt-0.5 text-[10px] text-muted" dir="ltr">{complaint.phone || "No phone"}</p></td><td className="px-3 py-3"><StatusBadge status={complaint.type} /></td><td className="px-3 py-3"><StatusBadge status={complaint.priority} /></td><td className="px-3 py-3"><StatusBadge status={complaint.status} /></td><td className="whitespace-nowrap px-3 py-3 text-secondary">{formatDate(complaint.createdAt, locale)}</td><td className="px-3 py-3"><div className="flex justify-end gap-1"><button onClick={() => setViewing(complaint)} className="rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-primary" aria-label={`View ${complaint.subject}`}><Eye className="size-4" /></button><button onClick={() => openEdit(complaint)} className="rounded-lg p-2 text-secondary hover:bg-white/5 hover:text-primary" aria-label={`Edit ${complaint.subject}`}><Pencil className="size-4" /></button>{complaint.status !== "Resolved" && complaint.status !== "Closed" && <button onClick={() => setResolving(complaint)} className="rounded-lg p-2 text-secondary hover:bg-primary/10 hover:text-primary" aria-label={`Resolve ${complaint.subject}`}><CheckCircle2 className="size-4" /></button>}</div></td></tr>)}</tbody>
                </table>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:hidden">{data.items.map((complaint) => <article key={complaint.id} className="rounded-xl border border-white/[.08] bg-white/[.02] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">{complaint.type}</p><h3 className="mt-1 font-semibold">{complaint.subject}</h3></div><StatusBadge status={complaint.status} /></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-secondary">{complaint.message}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-muted">Submitted by</dt><dd className="mt-0.5 truncate text-secondary">{complaint.memberName || complaint.name || "Anonymous"}</dd></div><div><dt className="text-[10px] text-muted">Priority</dt><dd className="mt-1"><StatusBadge status={complaint.priority} /></dd></div><div className="col-span-2"><dt className="text-[10px] text-muted">Created</dt><dd className="mt-0.5 text-secondary">{formatDate(complaint.createdAt, locale)}</dd></div></dl><div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.055] pt-3"><Button variant="secondary" size="sm" className="flex-1" onClick={() => setViewing(complaint)}><Eye className="size-4" />View</Button><Button variant="secondary" size="sm" className="flex-1" onClick={() => openEdit(complaint)}><Pencil className="size-4" />Edit</Button>{complaint.status !== "Resolved" && complaint.status !== "Closed" && <Button size="sm" className="w-full" onClick={() => setResolving(complaint)}><CheckCircle2 className="size-4" />Resolve case</Button>}</div></article>)}</div>

              <div className="mt-4 border-t border-white/[.06] pt-4"><Pagination page={data.page} totalPages={data.totalPages} totalCount={data.totalCount} onPageChange={setPage} /></div>
            </>
          )}
        </div>
      </Card>

      <ComplaintFormDialog open={formOpen} complaint={editing} onClose={closeForm} onSaved={reload} />
      <ResolveComplaintDialog complaint={resolving} onClose={() => setResolving(null)} onSaved={reload} />
      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.subject ?? "Case details"} description={viewing ? `${viewing.type} · Opened ${formatDate(viewing.createdAt, locale)}` : undefined} size="md" footer={<><Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>{viewing && <Button onClick={() => { const selected = viewing; setViewing(null); openEdit(selected); }}><Pencil className="size-4" />Edit</Button>}</>}>
        {viewing && <div className="space-y-5"><div className="flex flex-wrap gap-2"><StatusBadge status={viewing.status} /><StatusBadge status={viewing.priority} /><StatusBadge status={viewing.type} /></div><dl className="grid gap-4 rounded-xl border border-white/[.07] bg-white/[.02] p-4 text-xs sm:grid-cols-2"><div><dt className="text-muted">Submitted by</dt><dd className="mt-1 font-medium text-foreground">{viewing.memberName || viewing.name || "Anonymous"}</dd></div><div><dt className="text-muted">Phone</dt><dd className="mt-1 text-secondary" dir="ltr">{viewing.phone || "Not provided"}</dd></div>{viewing.memberId && <div className="sm:col-span-2"><dt className="text-muted">Linked member ID</dt><dd className="mt-1 break-all font-mono text-[10px] text-secondary">{viewing.memberId}</dd></div>}</dl><section><h3 className="text-xs font-bold uppercase tracking-wider text-primary">Message</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{viewing.message}</p></section>{viewing.adminResponse && <section className="rounded-xl border border-primary/15 bg-primary/[.04] p-4"><h3 className="text-xs font-bold uppercase tracking-wider text-primary">Administrator response</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{viewing.adminResponse}</p>{viewing.resolvedAt && <p className="mt-3 text-[10px] text-muted">Resolved {formatDate(viewing.resolvedAt, locale)}</p>}</section>}</div>}
      </Dialog>
    </div>
  );
}
