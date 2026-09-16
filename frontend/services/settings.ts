import { createClient } from "@/lib/supabase/client";
import type { GymSettings, LookupItem } from "@/types/api";
import type { GymSettingsRow } from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { numberValue, optionalText } from "./shared";
import { removeImage, signedImageUrl, uploadImage } from "./storage";

async function toSettings(row: GymSettingsRow): Promise<GymSettings> {
  return {
    id: row.id,
    gymName: row.gym_name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    currency: row.currency,
    timezone: row.timezone,
    locale: row.default_locale,
    expiringSoonDays: row.membership_expiry_warning_days,
    highExpenseThreshold: numberValue(row.high_expense_threshold),
    logoPath: row.logo_path ?? undefined,
    logoUrl: await signedImageUrl("gym-assets", row.logo_path),
  };
}

export const settingsService = {
  async get() {
    const { data, error } = await createClient().from("gym_settings").select("*").eq("singleton", true).maybeSingle();
    throwIfError(error, "Gym settings could not be loaded.");
    if (!data) throw new ApiError("Gym settings are not initialized. Apply the Supabase seed.", 404);
    return toSettings(data);
  },

  async update(input: GymSettings) {
    const current = await settingsService.get();
    let logoPath = current.logoPath ?? null;
    if (input.logo) logoPath = await uploadImage("gym-assets", input.logo, "branding");
    const { data, error } = await createClient().from("gym_settings").update({
      gym_name: input.gymName.trim(),
      phone: optionalText(input.phone),
      email: optionalText(input.email),
      address: optionalText(input.address),
      currency: input.currency.trim().toUpperCase(),
      timezone: input.timezone.trim(),
      default_locale: input.locale,
      membership_expiry_warning_days: input.expiringSoonDays ?? 7,
      high_expense_threshold: input.highExpenseThreshold ?? 50000,
      logo_path: logoPath,
    }).eq("id", current.id ?? "").select("*").single();
    if (error) {
      if (logoPath && logoPath !== current.logoPath) await removeImage("gym-assets", logoPath).catch(() => undefined);
      throwIfError(error, "Gym settings could not be updated.");
    }
    if (logoPath && current.logoPath && logoPath !== current.logoPath) {
      await removeImage("gym-assets", current.logoPath).catch(() => undefined);
    }
    return toSettings(data);
  },

  paymentMethods: {
    async list(): Promise<LookupItem[]> {
      const { data, error } = await createClient().from("payment_methods").select("*").order("name");
      throwIfError(error, "Payment methods could not be loaded.");
      return (data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active }));
    },
    async create(name: string) {
      const { data, error } = await createClient().from("payment_methods").insert({ name: name.trim() }).select("*").single();
      throwIfError(error, "The payment method could not be created.");
      return { id: data.id, name: data.name, isActive: data.is_active };
    },
    async update(id: string, values: Partial<LookupItem>) {
      const { error } = await createClient().from("payment_methods").update({
        ...(values.name !== undefined && { name: values.name.trim() }),
        ...(values.isActive !== undefined && { is_active: values.isActive }),
      }).eq("id", id);
      throwIfError(error, "The payment method could not be updated.");
    },
  },

  expenseCategories: {
    async list(): Promise<LookupItem[]> {
      const { data, error } = await createClient().from("expense_categories").select("*").order("name");
      throwIfError(error, "Expense categories could not be loaded.");
      return (data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active }));
    },
    async create(name: string) {
      const { data, error } = await createClient().from("expense_categories").insert({ name: name.trim() }).select("*").single();
      throwIfError(error, "The expense category could not be created.");
      return { id: data.id, name: data.name, isActive: data.is_active };
    },
    async update(id: string, values: Partial<LookupItem>) {
      const { error } = await createClient().from("expense_categories").update({
        ...(values.name !== undefined && { name: values.name.trim() }),
        ...(values.isActive !== undefined && { is_active: values.isActive }),
      }).eq("id", id);
      throwIfError(error, "The expense category could not be updated.");
    },
  },
};
