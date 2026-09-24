import { createClient } from "@/lib/supabase/client";
import type { Equipment, EquipmentInput, PagedResult } from "@/types/api";
import type { EquipmentRow } from "@/types/database";
import { throwIfError } from "./errors";
import { numberValue, optionalText, pageResult, safeSearchTerm, titleCase } from "./shared";

function toEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? undefined,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchasePrice: row.purchase_price === null ? undefined : numberValue(row.purchase_price),
    condition: titleCase(row.condition) as Equipment["condition"],
    status: titleCase(row.status) as Equipment["status"],
    lastMaintenanceDate: row.last_maintenance_date ?? undefined,
    nextMaintenanceDate: row.next_maintenance_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function inputRow(input: Partial<EquipmentInput>) {
  return {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.category !== undefined && { category: optionalText(input.category) }),
    ...(input.brand !== undefined && { brand: optionalText(input.brand) }),
    ...(input.model !== undefined && { model: optionalText(input.model) }),
    ...(input.serialNumber !== undefined && { serial_number: optionalText(input.serialNumber) }),
    ...(input.purchaseDate !== undefined && { purchase_date: input.purchaseDate || null }),
    ...(input.purchasePrice !== undefined && { purchase_price: input.purchasePrice }),
    ...(input.condition !== undefined && { condition: input.condition.toLowerCase() as EquipmentRow["condition"] }),
    ...(input.status !== undefined && { status: input.status.toLowerCase() as EquipmentRow["status"] }),
    ...(input.lastMaintenanceDate !== undefined && { last_maintenance_date: input.lastMaintenanceDate || null }),
    ...(input.nextMaintenanceDate !== undefined && { next_maintenance_date: input.nextMaintenanceDate || null }),
    ...(input.notes !== undefined && { notes: optionalText(input.notes) }),
  };
}

export const equipmentService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Equipment>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const search = safeSearchTerm(String(params.search ?? ""));
    let query = createClient().from("equipment").select("*", { count: "exact" });
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`name.ilike.${pattern},category.ilike.${pattern},brand.ilike.${pattern},model.ilike.${pattern},serial_number.ilike.${pattern}`);
    }
    if (params.status) query = query.eq("status", String(params.status).toLowerCase() as EquipmentRow["status"]);
    if (params.condition) query = query.eq("condition", String(params.condition).toLowerCase() as EquipmentRow["condition"]);
    if (params.category) query = query.ilike("category", String(params.category));
    const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
    throwIfError(error, "Equipment could not be loaded.");
    return pageResult((data ?? []).map(toEquipment), page, pageSize, count);
  },

  async create(input: EquipmentInput) {
    const { data: userData, error: userError } = await createClient().auth.getUser();
    throwIfError(userError, "Your session could not be verified.");
    const { data, error } = await createClient().from("equipment").insert({
      name: input.name.trim(),
      ...inputRow(input),
      created_by: userData.user?.id ?? null,
    }).select("*").single();
    throwIfError(error, "The equipment record could not be created.");
    return toEquipment(data);
  },

  async update(id: string, input: Partial<EquipmentInput>) {
    const { data, error } = await createClient().from("equipment").update(inputRow(input)).eq("id", id).select("*").single();
    throwIfError(error, "The equipment record could not be updated.");
    return toEquipment(data);
  },

  async retire(id: string) {
    const { error } = await createClient().from("equipment").update({ status: "retired" }).eq("id", id);
    throwIfError(error, "The equipment record could not be retired.");
  },

  async remove(id: string) {
    return equipmentService.retire(id);
  },
};
