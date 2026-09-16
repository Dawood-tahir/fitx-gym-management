import { createClient } from "@/lib/supabase/client";
import type { Complaint, ComplaintInput, PagedResult } from "@/types/api";
import type { ComplaintRow, MemberRow } from "@/types/database";
import { throwIfError } from "./errors";
import { optionalText, pageResult, safeSearchTerm, titleCase } from "./shared";

function toComplaint(row: ComplaintRow, memberName?: string): Complaint {
  return {
    id: row.id,
    memberId: row.member_id ?? undefined,
    memberName,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    type: titleCase(row.type) as Complaint["type"],
    subject: row.subject,
    message: row.message,
    status: titleCase(row.status) as Complaint["status"],
    priority: titleCase(row.priority) as Complaint["priority"],
    adminResponse: row.admin_response ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
  };
}

async function enrich(rows: ComplaintRow[]) {
  const ids = [...new Set(rows.map((row) => row.member_id).filter((value): value is string => Boolean(value)))];
  if (!ids.length) return rows.map((row) => toComplaint(row));
  const { data, error } = await createClient().from("members").select("*").in("id", ids);
  throwIfError(error, "Complaint members could not be loaded.");
  const members = new Map((data ?? []).map((row: MemberRow) => [row.id, row.full_name]));
  return rows.map((row) => toComplaint(row, row.member_id ? members.get(row.member_id) : undefined));
}

export const complaintsService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Complaint>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const search = safeSearchTerm(String(params.search ?? ""));
    let query = createClient().from("complaints_feedback").select("*", { count: "exact" });
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`subject.ilike.${pattern},message.ilike.${pattern},name.ilike.${pattern},phone.ilike.${pattern}`);
    }
    if (params.status) query = query.eq("status", String(params.status).toLowerCase());
    if (params.priority) query = query.eq("priority", String(params.priority).toLowerCase());
    if (params.type) query = query.eq("type", String(params.type).toLowerCase());
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    throwIfError(error, "Complaints and feedback could not be loaded.");
    return pageResult(await enrich(data ?? []), page, pageSize, count);
  },

  async create(input: ComplaintInput) {
    const { data: userData, error: userError } = await createClient().auth.getUser();
    throwIfError(userError, "Your session could not be verified.");
    const { data, error } = await createClient().from("complaints_feedback").insert({
      member_id: input.memberId || null,
      name: optionalText(input.name),
      phone: optionalText(input.phone),
      type: input.type,
      subject: input.subject.trim(),
      message: input.message.trim(),
      status: input.status ?? "new",
      priority: input.priority,
      admin_response: optionalText(input.adminResponse),
      created_by: userData.user?.id ?? null,
    }).select("*").single();
    throwIfError(error, "The complaint or feedback could not be created.");
    return (await enrich([data]))[0];
  },

  async update(id: string, input: Partial<ComplaintInput>) {
    const { data, error } = await createClient().from("complaints_feedback").update({
      ...(input.memberId !== undefined && { member_id: input.memberId || null }),
      ...(input.name !== undefined && { name: optionalText(input.name) }),
      ...(input.phone !== undefined && { phone: optionalText(input.phone) }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.subject !== undefined && { subject: input.subject.trim() }),
      ...(input.message !== undefined && { message: input.message.trim() }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.adminResponse !== undefined && { admin_response: optionalText(input.adminResponse) }),
    }).eq("id", id).select("*").single();
    throwIfError(error, "The complaint or feedback could not be updated.");
    return (await enrich([data]))[0];
  },

  async resolve(id: string, response: string) {
    const { error } = await createClient().rpc("resolve_complaint", {
      p_complaint_id: id,
      p_response: response.trim(),
    });
    throwIfError(error, "The complaint could not be resolved.");
  },
};
