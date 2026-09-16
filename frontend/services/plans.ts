import { createClient } from "@/lib/supabase/client";
import type { MembershipPlan, MembershipPlanInput } from "@/types/api";
import type { MembershipPlanRow } from "@/types/database";
import { throwIfError } from "./errors";
import { numberValue, optionalText } from "./shared";

function toPlan(row: MembershipPlanRow): MembershipPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    durationMonths: row.duration_months,
    durationDays: row.duration_months * 30,
    price: numberValue(row.price),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const plansService = {
  async list() {
    const { data, error } = await createClient()
      .from("membership_plans")
      .select("*")
      .order("is_active", { ascending: false })
      .order("duration_months", { ascending: true });
    throwIfError(error, "Membership plans could not be loaded.");
    return (data ?? []).map(toPlan);
  },

  async create(input: Partial<MembershipPlan> | MembershipPlanInput) {
    const { data, error } = await createClient().from("membership_plans").insert({
      name: input.name?.trim() ?? "",
      description: optionalText(input.description),
      duration_months: Math.max(1, Number(input.durationMonths ?? 1)),
      price: Number(input.price ?? 0),
      is_active: input.isActive ?? true,
    }).select("*").single();
    throwIfError(error, "The membership plan could not be created.");
    return toPlan(data);
  },

  async update(id: string, input: Partial<MembershipPlan> | Partial<MembershipPlanInput>) {
    const { data, error } = await createClient().from("membership_plans").update({
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: optionalText(input.description) }),
      ...(input.durationMonths !== undefined && { duration_months: Math.max(1, Number(input.durationMonths)) }),
      ...(input.price !== undefined && { price: Number(input.price) }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
    }).eq("id", id).select("*").single();
    throwIfError(error, "The membership plan could not be updated.");
    return toPlan(data);
  },

  async deactivate(id: string) {
    const { error } = await createClient().from("membership_plans").update({ is_active: false }).eq("id", id);
    throwIfError(error, "The membership plan could not be deactivated.");
  },
};
