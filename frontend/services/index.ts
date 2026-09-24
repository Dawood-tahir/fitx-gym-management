import { createClient } from "@/lib/supabase/client";
import type { NotificationItem } from "@/types/api";
import { complaintsService } from "./complaints";
import { dashboardService } from "./dashboard";
import { equipmentService } from "./equipment";
import { expensesService } from "./expenses";
import { membersService } from "./members";
import { paymentsService } from "./payments";
import { plansService } from "./plans";
import { staffService } from "./staff";
import { throwIfError } from "./errors";
import { safeSearchTerm } from "./shared";

const notifications = {
  async list(): Promise<NotificationItem[]> {
    const { data, error } = await createClient().from("notifications").select("*").order("created_at", { ascending: false }).limit(25);
    throwIfError(error, "Notifications could not be loaded.");
    return (data ?? []).map((row) => ({ id: row.id, title: row.title, message: row.message, type: row.kind, isRead: row.is_read, createdAt: row.created_at }));
  },
  async read(id: string) {
    const { error } = await createClient().from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    throwIfError(error, "The notification could not be marked as read.");
  },
  async readAll() {
    const { error } = await createClient().from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("is_read", false);
    throwIfError(error, "Notifications could not be marked as read.");
  },
};

async function search(term: string) {
  const value = safeSearchTerm(term);
  if (value.length < 2) return [];
  const pattern = `%${value}%`;
  const { data, error } = await createClient().from("members").select("id,member_code,full_name,phone").or(`full_name.ilike.${pattern},member_code.ilike.${pattern},phone.ilike.${pattern}`).limit(8);
  throwIfError(error, "Search could not be completed.");
  return (data ?? []).map((row) => ({ type: "Member", id: row.id, title: row.full_name, subtitle: `${row.member_code} · ${row.phone}` }));
}

export const api = {
  dashboard: dashboardService.get,
  members: membersService,
  plans: plansService,
  payments: paymentsService,
  expenses: expensesService,
  staff: staffService,
  equipment: equipmentService,
  complaints: complaintsService,
  notifications,
  search,
};
