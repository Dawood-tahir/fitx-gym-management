import { createClient } from "@/lib/supabase/client";
import type { DashboardData, DistributionPoint, Expense, Member, Payment, TrendPoint } from "@/types/api";
import type { Json, MemberOverviewRow } from "@/types/database";
import { throwIfError } from "./errors";
import { toMember } from "./members";
import { jsonArray, jsonRecord, numberValue, titleCase } from "./shared";

function first(record: Record<string, Json | undefined>, ...keys: string[]) {
  for (const key of keys) if (record[key] !== undefined) return record[key];
  return undefined;
}

function numeric(record: Record<string, Json | undefined>, ...keys: string[]) {
  const value = first(record, ...keys);
  return numberValue(typeof value === "number" || typeof value === "string" ? value : 0);
}

function textValue(record: Record<string, Json | undefined>, ...keys: string[]) {
  const value = first(record, ...keys);
  return typeof value === "string" ? value : "";
}

function distribution(value: Json | undefined): DistributionPoint[] {
  return jsonArray(value).map((entry) => {
    const row = jsonRecord(entry);
    return {
      name: titleCase(textValue(row, "name", "label", "status", "method", "plan")),
      value: numeric(row, "value", "count", "total"),
    };
  }).filter((item) => item.value > 0);
}

function recentMember(value: Json): Member {
  const row = jsonRecord(value);
  return toMember({
    ...row,
    id: textValue(row, "id"),
    member_code: textValue(row, "member_code", "memberId"),
    full_name: textValue(row, "full_name", "fullName"),
    phone: textValue(row, "phone"),
    join_date: textValue(row, "join_date", "joinDate"),
    status: textValue(row, "status") || "active",
    membership_status: textValue(row, "membership_status") || "expired",
    payment_status: textValue(row, "payment_status") || "unpaid",
    created_at: textValue(row, "created_at"),
    updated_at: textValue(row, "updated_at"),
  } as unknown as MemberOverviewRow);
}

function recentPayment(value: Json): Payment {
  const row = jsonRecord(value);
  const amount = numeric(row, "amount", "amount_paid");
  return {
    id: textValue(row, "id"),
    paymentId: textValue(row, "payment_number", "payment_id"),
    receiptNumber: textValue(row, "payment_number", "receipt_number"),
    date: textValue(row, "payment_date", "date"),
    memberId: textValue(row, "member_id"),
    memberName: textValue(row, "member_name", "member"),
    planName: textValue(row, "plan_name", "plan") || undefined,
    amount,
    amountPaid: amount,
    balance: numeric(row, "balance"),
    method: textValue(row, "payment_method", "method") || "—",
    status: textValue(row, "status") === "voided" ? "Voided" : "Paid",
    referenceNumber: textValue(row, "reference_number") || undefined,
    receivedBy: textValue(row, "received_by_name", "received_by") || undefined,
  };
}

function recentExpense(value: Json): Expense {
  const row = jsonRecord(value);
  return {
    id: textValue(row, "id"),
    expenseNumber: textValue(row, "expense_number") || undefined,
    title: textValue(row, "title") || undefined,
    date: textValue(row, "expense_date", "date"),
    category: textValue(row, "category_name", "category") || "—",
    description: textValue(row, "description", "title"),
    amount: numeric(row, "amount"),
    addedBy: textValue(row, "created_by_name", "added_by") || undefined,
  };
}

export const dashboardService = {
  async get(range = "6months"): Promise<DashboardData> {
    const months = range === "6months" ? 6 : 12;
    const { data, error } = await createClient().rpc("dashboard_summary", { p_months: months });
    throwIfError(error, "Dashboard data could not be loaded.");
    const root = jsonRecord(data as Json);
    const metrics = jsonRecord(first(root, "metrics", "kpis") as Json);
    const cycle = jsonRecord(first(root, "business_cycle") as Json);
    const source = Object.keys(metrics).length ? metrics : root;
    const trend: TrendPoint[] = jsonArray(first(root, "trend", "monthly_trend")).map((entry) => {
      const row = jsonRecord(entry);
      return {
        label: textValue(row, "label", "month"),
        revenue: numeric(row, "revenue"),
        expenses: numeric(row, "expenses"),
        profit: numeric(row, "profit", "net_income"),
        newMembers: numeric(row, "new_members", "newMembers"),
      };
    });

    return {
      totalMembers: numeric(source, "total_members"),
      activeMembers: numeric(source, "active_members"),
      activeMembersChange: numeric(source, "active_members_change"),
      expiringSoon: numeric(source, "expiring_soon"),
      expiringSoonChange: numeric(source, "expiring_soon_change"),
      expiredMembers: numeric(source, "expired_members"),
      paymentDueMembers: numeric(source, "payment_due_members"),
      unpaidFees: numeric(source, "unpaid_fees", "outstanding_members"),
      unpaidFeesChange: numeric(source, "unpaidpaid_fees_change", "unpaid_fees_change"),
      monthlyRevenue: numeric(source, "monthly_revenue", "revenue_this_month"),
      revenueToday: numeric(source, "revenue_today"),
      businessCycleLabel: textValue(cycle, "label"),
      revenueChange: numeric(source, "revenue_change"),
      monthlyExpenses: numeric(source, "monthly_expenses", "expenses_this_month"),
      expensesChange: numeric(source, "expenses_change"),
      netProfit: numeric(source, "net_profit", "net_income"),
      profitChange: numeric(source, "profit_change"),
      pendingComplaints: numeric(source, "pending_complaints"),
      equipmentMaintenance: numeric(source, "equipment_maintenance"),
      trend,
      membershipStatus: distribution(first(root, "membership_status")),
      paymentStatus: distribution(first(root, "payment_status")),
      planDistribution: distribution(first(root, "plan_distribution", "membership_plans")),
      recentMembers: jsonArray(first(root, "recent_members")).map(recentMember),
      recentPayments: jsonArray(first(root, "recent_payments")).map(recentPayment),
      recentExpenses: jsonArray(first(root, "recent_expenses")).map(recentExpense),
    };
  },

  subscribe(onChange: () => void) {
    const client = createClient();
    const channel = client.channel("fitx-dashboard");
    ["members", "member_subscriptions", "payments", "expenses", "complaints_feedback", "equipment"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    });
    channel.subscribe();
    return () => { void client.removeChannel(channel); };
  },
};
