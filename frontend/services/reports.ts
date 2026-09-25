import { createClient } from "@/lib/supabase/client";
import type { ExpenseRow, MemberRow, MembershipPlanRow, PaymentMethodRow, PaymentRow, SubscriptionRow } from "@/types/database";
import { numberValue } from "./shared";
import { throwIfError } from "./errors";

export interface ReportRange { from: string; to: string; }
export interface ReportPoint { label: string; revenue: number; expenses: number; }
export interface ReportRow { id: string; date: string; member?: string; plan?: string; method?: string; category?: string; description?: string; amount: number; }
export interface ReportsData {
  revenue: number; expenses: number; netIncome: number; newMembers: number; activeMembers: number;
  expiringMembers: Array<{ id: string; member: string; plan: string; expiry: string }>;
  revenueTrend: ReportPoint[]; expenseTrend: ReportPoint[]; expenseCategories: Array<{ name: string; amount: number }>;
  plans: Array<{ name: string; count: number }>; payments: ReportRow[]; recentExpenses: ReportRow[];
}

const dateKey = (value: string) => value.slice(0, 10);
const labelFor = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

export const reportsService = {
  async get(range: ReportRange): Promise<ReportsData> {
    const supabase = createClient();
    const [paymentsResult, expensesResult, membersResult, subscriptionsResult, plansResult, methodsResult, categoriesResult] = await Promise.all([
      supabase.from("payments").select("*").gte("payment_date", `${range.from}T00:00:00`).lte("payment_date", `${range.to}T23:59:59.999`).order("payment_date", { ascending: false }),
      supabase.from("expenses").select("*").eq("is_deleted", false).gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }),
      supabase.from("members").select("id").gte("join_date", range.from).lte("join_date", range.to),
      supabase.from("member_subscriptions").select("*").eq("is_current", true).neq("status", "cancelled"),
      supabase.from("membership_plans").select("id,name"),
      supabase.from("payment_methods").select("id,name"),
      supabase.from("expense_categories").select("id,name"),
    ]);
    [paymentsResult, expensesResult, membersResult, subscriptionsResult, plansResult, methodsResult, categoriesResult].forEach((result) => throwIfError(result.error, "Report data could not be loaded."));

    const payments = (paymentsResult.data ?? []) as PaymentRow[];
    const expenses = (expensesResult.data ?? []) as ExpenseRow[];
    const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
    const memberIds = [...new Set([...payments.map((item) => item.member_id), ...subscriptions.map((item) => item.member_id)])];
    const membersById = memberIds.length ? await supabase.from("members").select("id,full_name").in("id", memberIds) : { data: [], error: null };
    throwIfError(membersById.error, "Report members could not be loaded.");
    const memberNames = new Map((membersById.data ?? []).map((item) => [item.id, item.full_name]));
    const planNames = new Map(((plansResult.data ?? []) as Pick<MembershipPlanRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const methodNames = new Map(((methodsResult.data ?? []) as Pick<PaymentMethodRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const categoryNames = new Map((categoriesResult.data ?? []).map((item) => [item.id, item.name]));
    const subscriptionPlans = new Map(subscriptions.map((item) => [item.id, item.plan_id]));
    const revenuePayments = payments.filter((item) => !item.is_voided);
    const revenue = revenuePayments.reduce((sum, item) => sum + numberValue(item.amount), 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + numberValue(item.amount), 0);
    const points = new Map<string, ReportPoint>();
    const point = (date: string) => {
      const key = dateKey(date);
      if (!points.has(key)) points.set(key, { label: labelFor(key), revenue: 0, expenses: 0 });
      return points.get(key)!;
    };
    revenuePayments.forEach((item) => { point(item.payment_date).revenue += numberValue(item.amount); });
    expenses.forEach((item) => { point(item.expense_date).expenses += numberValue(item.amount); });
    const categories = new Map<string, number>();
    expenses.forEach((item) => categories.set(item.category_id, (categories.get(item.category_id) ?? 0) + numberValue(item.amount)));
    const today = new Date().toISOString().slice(0, 10);
    const expiringMembers = subscriptions.filter((item) => item.end_date >= today && item.end_date <= range.to).sort((a, b) => a.end_date.localeCompare(b.end_date)).slice(0, 8).map((item) => ({ id: item.member_id, member: memberNames.get(item.member_id) ?? "Unknown member", plan: planNames.get(item.plan_id) ?? "Unknown plan", expiry: item.end_date }));
    const planCounts = new Map<string, number>();
    subscriptions.forEach((item) => planCounts.set(item.plan_id, (planCounts.get(item.plan_id) ?? 0) + 1));
    const reportPayments = revenuePayments.slice(0, 8).map((item) => ({ id: item.id, date: item.payment_date, member: memberNames.get(item.member_id) ?? "Unknown member", plan: item.subscription_id ? planNames.get(subscriptionPlans.get(item.subscription_id) ?? "") : undefined, method: methodNames.get(item.payment_method_id) ?? "â€”", amount: numberValue(item.amount) }));
    const reportExpenses = expenses.slice(0, 8).map((item) => ({ id: item.id, date: item.expense_date, category: categoryNames.get(item.category_id) ?? "â€”", description: item.title || item.description || "Expense", amount: numberValue(item.amount) }));
    return {
      revenue, expenses: totalExpenses, netIncome: revenue - totalExpenses,
      newMembers: ((membersResult.data ?? []) as Pick<MemberRow, "id">[]).length,
      activeMembers: subscriptions.filter((item) => item.status === "active" && item.end_date >= today).length,
      expiringMembers, revenueTrend: [...points.values()], expenseTrend: [...points.values()],
      expenseCategories: [...categories.entries()].map(([id, amount]) => ({ name: categoryNames.get(id) ?? "Other", amount })).sort((a, b) => b.amount - a.amount),
      plans: [...planCounts.entries()].map(([id, count]) => ({ name: planNames.get(id) ?? "Unknown plan", count })).sort((a, b) => b.count - a.count),
      payments: reportPayments, recentExpenses: reportExpenses,
    };
  },
};
