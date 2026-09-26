import { createClient } from "@/lib/supabase/client";
import { timestampBounds } from "@/lib/business-period";
import type { ExpenseRow, Json, MemberOverviewRow, MembershipPlanRow, PaymentMethodRow, PaymentRow, SubscriptionRow } from "@/types/database";
import { jsonRecord, numberValue } from "./shared";
import { throwIfError } from "./errors";

export interface ReportRange { from: string; to: string; }
export interface ReportPoint { label: string; revenue: number; expenses: number; }
export interface ReportRow { id: string; date: string; member?: string; plan?: string; method?: string; category?: string; description?: string; amount: number; }
export interface ReportMemberRow { id: string; memberCode: string; name: string; joinDate: string; }
export interface ReportsData {
  revenue: number; expenses: number; netIncome: number; newMembers: number; activeMembers: number;
  expiringMembers: Array<{ id: string; member: string; plan: string; expiry: string }>;
  revenueTrend: ReportPoint[]; expenseTrend: ReportPoint[]; expenseCategories: Array<{ name: string; amount: number }>;
  plans: Array<{ name: string; count: number }>; payments: ReportRow[]; recentExpenses: ReportRow[]; newMemberRows: ReportMemberRow[];
}

const dateKey = (value: string) => value.slice(0, 10);
const labelFor = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

export const reportsService = {
  async get(range: ReportRange): Promise<ReportsData> {
    const supabase = createClient();
    const paymentBounds = timestampBounds(range);
    const [paymentsResult, expensesResult, membersResult, subscriptionsResult, overviewResult, plansResult, methodsResult, categoriesResult, summaryResult] = await Promise.all([
      supabase.from("payments").select("*").gte("payment_date", paymentBounds.from).lt("payment_date", paymentBounds.toExclusive).order("payment_date", { ascending: false }),
      supabase.from("expenses").select("*").eq("is_deleted", false).gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }),
      supabase.from("members").select("id,member_code,full_name,join_date", { count: "exact" }).gte("join_date", range.from).lte("join_date", range.to).order("join_date", { ascending: false }),
      supabase.from("member_subscriptions").select("*").eq("is_current", true).neq("status", "cancelled"),
      supabase.from("member_overview").select("id,plan_id,plan_name,end_date,membership_status"),
      supabase.from("membership_plans").select("id,name"),
      supabase.from("payment_methods").select("id,name"),
      supabase.from("expense_categories").select("id,name"),
      supabase.rpc("report_summary", { p_from: range.from, p_to: range.to }),
    ]);
    [paymentsResult, expensesResult, membersResult, subscriptionsResult, overviewResult, plansResult, methodsResult, categoriesResult, summaryResult].forEach((result) => throwIfError(result.error, "Report data could not be loaded."));

    const payments = (paymentsResult.data ?? []) as PaymentRow[];
    const expenses = (expensesResult.data ?? []) as ExpenseRow[];
    const currentSubscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
    const referencedSubscriptionIds = [...new Set(payments.map((item) => item.subscription_id).filter((id): id is string => Boolean(id)))];
    const referencedSubscriptionsResult = referencedSubscriptionIds.length
      ? await supabase.from("member_subscriptions").select("*").in("id", referencedSubscriptionIds)
      : { data: [] as SubscriptionRow[], error: null };
    throwIfError(referencedSubscriptionsResult.error, "Report memberships could not be loaded.");
    const subscriptions = [...new Map([...currentSubscriptions, ...(referencedSubscriptionsResult.data ?? [])].map((item) => [item.id, item])).values()];
    const memberIds = [...new Set([...payments.map((item) => item.member_id), ...subscriptions.map((item) => item.member_id)])];
    const membersById = memberIds.length ? await supabase.from("members").select("id,full_name").in("id", memberIds) : { data: [], error: null };
    throwIfError(membersById.error, "Report members could not be loaded.");
    const memberNames = new Map((membersById.data ?? []).map((item) => [item.id, item.full_name]));
    const planNames = new Map(((plansResult.data ?? []) as Pick<MembershipPlanRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const methodNames = new Map(((methodsResult.data ?? []) as Pick<PaymentMethodRow, "id" | "name">[]).map((item) => [item.id, item.name]));
    const categoryNames = new Map((categoriesResult.data ?? []).map((item) => [item.id, item.name]));
    const subscriptionPlans = new Map(subscriptions.map((item) => [item.id, item.plan_id]));
    const revenuePayments = payments.filter((item) => !item.is_voided);
    const summary = jsonRecord(summaryResult.data as Json);
    const revenue = numberValue(summary.total_revenue as number | string | null | undefined);
    const totalExpenses = numberValue(summary.total_expenses as number | string | null | undefined);
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
    const overview = (overviewResult.data ?? []) as Pick<MemberOverviewRow, "id" | "plan_id" | "plan_name" | "end_date" | "membership_status">[];
    const expiringMembers = overview.filter((item) => item.membership_status === "expiring_soon" && item.end_date && item.end_date <= range.to).sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? "")).slice(0, 8).map((item) => ({ id: item.id, member: memberNames.get(item.id) ?? "Unknown member", plan: item.plan_name ?? planNames.get(item.plan_id ?? "") ?? "Unknown plan", expiry: item.end_date ?? "" }));
    const planCounts = new Map<string, number>();
    currentSubscriptions.forEach((item) => planCounts.set(item.plan_id, (planCounts.get(item.plan_id) ?? 0) + 1));
    const reportPayments = revenuePayments.map((item) => ({ id: item.id, date: item.payment_date, member: memberNames.get(item.member_id) ?? "Unknown member", plan: item.subscription_id ? planNames.get(subscriptionPlans.get(item.subscription_id) ?? "") : undefined, method: methodNames.get(item.payment_method_id) ?? "—", amount: numberValue(item.amount) }));
    const reportExpenses = expenses.map((item) => ({ id: item.id, date: item.expense_date, category: categoryNames.get(item.category_id) ?? "—", description: item.title || item.description || "Expense", amount: numberValue(item.amount) }));
    const newMemberRows = (membersResult.data ?? []).map((item) => ({ id: item.id, memberCode: item.member_code, name: item.full_name, joinDate: item.join_date }));
    return {
      revenue, expenses: totalExpenses, netIncome: revenue - totalExpenses,
      newMembers: membersResult.count ?? newMemberRows.length,
      activeMembers: overview.filter((item) => item.membership_status === "active").length,
      expiringMembers, revenueTrend: [...points.values()], expenseTrend: [...points.values()],
      expenseCategories: [...categories.entries()].map(([id, amount]) => ({ name: categoryNames.get(id) ?? "Other", amount })).sort((a, b) => b.amount - a.amount),
      plans: [...planCounts.entries()].map(([id, count]) => ({ name: planNames.get(id) ?? "Unknown plan", count })).sort((a, b) => b.count - a.count),
      payments: reportPayments, recentExpenses: reportExpenses, newMemberRows,
    };
  },
};
