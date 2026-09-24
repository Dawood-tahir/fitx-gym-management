import { createClient } from "@/lib/supabase/client";
import type { PagedResult, Staff, StaffInput } from "@/types/api";
import type { StaffRow } from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { numberValue, optionalText, pageResult, safeSearchTerm, titleCase } from "./shared";
import { removeImage, signedImageUrl, uploadImage } from "./storage";

async function toStaff(row: StaffRow): Promise<Staff> {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? undefined,
    position: row.position,
    salary: row.salary === null ? undefined : numberValue(row.salary),
    hireDate: row.hire_date,
    status: titleCase(row.status) as Staff["status"],
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    photoPath: row.photo_path ?? undefined,
    photoUrl: await signedImageUrl("staff-photos", row.photo_path),
    profileId: row.profile_id ?? undefined,
    createdAt: row.created_at,
  };
}

export const staffService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Staff>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const search = safeSearchTerm(String(params.search ?? ""));
    let query = createClient().from("staff").select("*", { count: "exact" });
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},position.ilike.${pattern}`);
    }
    if (params.status) query = query.eq("status", String(params.status).toLowerCase() as StaffRow["status"]);
    if (params.position) query = query.ilike("position", String(params.position));
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    throwIfError(error, "Staff records could not be loaded.");
    return pageResult(await Promise.all((data ?? []).map(toStaff)), page, pageSize, count);
  },

  async create(input: StaffInput) {
    let photoPath: string | null = null;
    if (input.photo) photoPath = await uploadImage("staff-photos", input.photo, "staff");
    try {
      const { data: userData, error: userError } = await createClient().auth.getUser();
      throwIfError(userError, "Your session could not be verified.");
      if (!userData.user) throw new ApiError("Sign in before creating staff.", 401);
      const { data, error } = await createClient().from("staff").insert({
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
        email: optionalText(input.email),
        position: input.position.trim(),
        salary: input.salary ?? null,
        hire_date: input.hireDate,
        status: input.status?.toLowerCase() as "active" | "inactive" | undefined ?? "active",
        address: optionalText(input.address),
        notes: optionalText(input.notes),
        photo_path: photoPath,
        created_by: userData.user.id,
      }).select("*").single();
      throwIfError(error, "The staff record could not be created.");
      return toStaff(data);
    } catch (error) {
      if (photoPath) await removeImage("staff-photos", photoPath).catch(() => undefined);
      throw error;
    }
  },

  async update(id: string, input: Partial<StaffInput>) {
    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase.from("staff").select("*").eq("id", id).maybeSingle();
    throwIfError(existingError, "The staff record could not be loaded.");
    if (!existing) throw new ApiError("Staff record not found.", 404);
    let photoPath = existing.photo_path;
    if (input.photo) photoPath = await uploadImage("staff-photos", input.photo, "staff");
    const { data, error } = await supabase.from("staff").update({
      ...(input.fullName !== undefined && { full_name: input.fullName.trim() }),
      ...(input.phone !== undefined && { phone: input.phone.trim() }),
      ...(input.email !== undefined && { email: optionalText(input.email) }),
      ...(input.position !== undefined && { position: input.position.trim() }),
      ...(input.salary !== undefined && { salary: input.salary }),
      ...(input.hireDate !== undefined && { hire_date: input.hireDate }),
      ...(input.status !== undefined && { status: input.status.toLowerCase() as "active" | "inactive" }),
      ...(input.address !== undefined && { address: optionalText(input.address) }),
      ...(input.notes !== undefined && { notes: optionalText(input.notes) }),
      photo_path: photoPath,
    }).eq("id", id).select("*").single();
    if (error) {
      if (photoPath && photoPath !== existing.photo_path) await removeImage("staff-photos", photoPath).catch(() => undefined);
      throwIfError(error, "The staff record could not be updated.");
    }
    if (photoPath && existing.photo_path && photoPath !== existing.photo_path) {
      await removeImage("staff-photos", existing.photo_path).catch(() => undefined);
    }
    return toStaff(data);
  },

  async disable(id: string) {
    const { error } = await createClient().from("staff").update({ status: "inactive" }).eq("id", id);
    throwIfError(error, "The staff record could not be deactivated.");
  },
};
