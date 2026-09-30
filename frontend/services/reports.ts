import { createClient } from "@/lib/supabase/client";
import type { ExpenseRow, Json, MembershipPlanRow, PaymentMethodRow, PaymentRow, SubscriptionRow } from "@/types/database";
import { jsonArray, jsonRecord, numberValue } from "./shared";
import { throwIfError } from "./errors";

export interface ReportRange { from: string; to: string; }
export interface ReportPoint { label: string; revenue: number; expenses: number; }
export interface ReportRow { id: string; date: string; member?: string; plan?: string; method?: string; category?: string; description?: string; amount: number; }
export interface ReportMemberRow { id: string; memberCode: string; name: string; joinDate: string; }
export interface ReportsData {
  revenue: number; expenses: number; netIncome: number; newMembers: number; activeMembers: number;
  expiringMembers: Array<{ id: string; member: string; plan: string; expiry: string }>;
  revenueTrend: ReportPoint[]; expenseTrend: ReportPoint[]; expenseCategories: Array<{ name: string; amount: number }>;
  plans: Array<{ name: string; count: number }>; payments: ReportRow[]; recentExpenses: ReportRow[];
}
export interface ReportExportData { payments: ReportRow[]; expenses: ReportRow[]; newMembers: ReportMemberRow[]; }

type ExportPaymentRow = Pick<PaymentRow, "id" | "reporting_date" | "member_id" | "subscription_id" | "payment_method_id" | "amount">;
type ExportExpenseRow = Pick<ExpenseRow, "id" | "expense_date" | "category_id" | "title" | "description" | "amount">;
type ExportSubscriptionRow = Pick<SubscriptionRow, "id" | "plan_id">;

const labelFor = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
const textValue = (record: Record<string, Json | undefined>, key: string) => typeof record[key] === "string" ? record[key] as string : "";

function reportRows(value: Json | undefined): ReportRow[] {
  return jsonArray(value).map((entry) => {
    const row = jsonRecord(entry);
    return {
      id: textValue(row, "id"), date: textValue(row, "date"), member: textValue(row, "member") || undefined,
      plan: textValue(row, "plan") || undefined, method: textValue(row, "method") || undefined,
      category: textValue(row, "category") || undefined, description: textValue(row, "description") || undefined,
      amount: numberValue(row.amount as number | string | null | undefined),
    };
  });
}

export const reportsService = {
  async get(range: ReportRange): Promise<ReportsData> {
    const { data, error } = await createClient().rpc("report_details", { p_from: range.from, p_to: range.to });
    throwIfError(error, "Report data could not be loaded.");
    const root = jsonRecord(data as Json);
    const revenue = numberValue(root.revenue as number | string | null | undefined);
    const expenses = numberValue(root.expenses as number | string | null | undefined);
    const trend = jsonArray(root.trend).map((entry) => {
      const row = jsonRecord(entry);
      return {
        label: labelFor(textValue(row, "date")),
        revenue: numberValue(row.revenue as number | string | null | undefined),
        expenses: numberValue(row.expenses as number | string | null | undefined),
      };
    });
    return {
      revenue, expenses, netIncome: revenue - expenses,
      newMembers: numberValue(root.new_members as number | string | null | undefined),
      activeMembers: numberValue(root.active_members as number | string | null | undefined),
      revenueTrend: trend, expenseTrend: trend,
      expenseCategories: jsonArray(root.expense_categories).map((entry) => { const row = jsonRecord(entry); return { name: textValue(row, "name"), amount: numberValue(row.amount as number | string | null | undefined) }; }),
      plans: jsonArray(root.plans).map((entry) => { const row = jsonRecord(entry); return { name: textValue(row, "name"), count: numberValue(row.count as number | string | null | undefined) }; }),
      expiringMembers: jsonArray(root.expiring_members).map((entry) => { const row = jsonRecord(entry); return { id: textValue(row, "id"), member: textValue(row, "member"), plan: textValue(row, "plan"), expiry: textValue(row, "expiry") }; }),
      payments: reportRows(root.recent_payments), recentExpenses: reportRows(root.recent_expenses),
    };
  },

  async export(range: ReportRange): Promise<ReportExportData> {
    const supabase = createClient();
    const [paymentsResult, expensesResult, membersResult, plansResult, methodsResult, categoriesResult] = await Promise.all([
      supabase.from("payments").select("id,reporting_date,member_id,subscription_id,payment_method_id,amount").eq("is_voided", false).gte("reporting_date", range.from).lte("reporting_date", range.to).order("reporting_date", { ascending: false }),
      supabase.from("expenses").select("id,expense_date,category_id,title,description,amount").eq("is_deleted", false).gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }),
      supabase.from("members").select("id,member_code,full_name,join_date").gte("join_date", range.from).lte("join_date", range.to).order("join_date", { ascending: false }),
      supabase.from("membership_plans").select("id,name"),
      supabase.from("payment_methods").select("id,name"),
      supabase.from("expense_categories").select("id,name"),
    ]);
    [paymentsResult, expensesResult, membersResult, plansResult, methodsResult, categoriesResult]
      .forEach((result) => throwIfError(result.error, "Report export could not be loaded."));

    const paymentRows = (paymentsResult.data ?? []) as ExportPaymentRow[];
    const subscriptionIds = [...new Set(paymentRows.map((item) => item.subscription_id).filter((id): id is string => Boolean(id)))];
    const memberIds = [...new Set(paymentRows.map((item) => item.member_id))];
    const [subscriptionsResult, paymentMembersResult] = await Promise.all([
      subscriptionIds.length
        ? supabase.from("member_subscriptions").select("id,plan_id").in("id", subscriptionIds)
        : Promise.resolve({ data: [] as ExportSubscriptionRow[], error: null }),
      memberIds.length
        ? supabase.from("members").select("id,full_name").in("id", memberIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }>, error: null }),
    ]);
    throwIfError(subscriptionsResult.error, "Report memberships could not be loaded.");
    throwIfError(paymentMembersResult.error, "Report members could not be loaded.");

    const subscriptions = new Map((subscriptionsResult.data ?? []).map((item) => [item.id, item.plan_id]));
    const memberNames = new Map((paymentMembersResult.data ?? []).map((item) => [item.id, item.full_name]));
    const planNames = new Map(((plansResult.data ?? []) as Pick<MembershipPlanRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const methodNames = new Map(((methodsResult.data ?? []) as Pick<PaymentMethodRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const categoryNames = new Map((categoriesResult.data ?? []).map((item) => [item.id, item.name]));

    return {
      payments: paymentRows.map((item) => ({
        id: item.id, date: item.reporting_date, member: memberNames.get(item.member_id) ?? "Unknown member",
        plan: item.subscription_id ? planNames.get(subscriptions.get(item.subscription_id) ?? "") : undefined,
        method: methodNames.get(item.payment_method_id) ?? "—", amount: numberValue(item.amount),
      })),
      expenses: ((expensesResult.data ?? []) as ExportExpenseRow[]).map((item) => ({
        id: item.id, date: item.expense_date, category: categoryNames.get(item.category_id) ?? "—",
        description: item.title || item.description || "Expense", amount: numberValue(item.amount),
      })),
      newMembers: (membersResult.data ?? []).map((item) => ({ id: item.id, memberCode: item.member_code, name: item.full_name, joinDate: item.join_date })),
    };
  },
};
