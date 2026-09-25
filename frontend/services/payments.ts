import { createClient } from "@/lib/supabase/client";
import { currentBusinessRange, timestampBounds } from "@/lib/business-period";
import type { PagedResult, Payment, PaymentInput, PaymentSummary } from "@/types/api";
import type { Json, MemberRow, MembershipPlanRow, PaymentMethodRow, PaymentRow, ProfileRow, SubscriptionRow } from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { toPayment } from "./members";
import { jsonRecord, numberValue, optionalText, pageResult, safeSearchTerm } from "./shared";

async function enrichPayments(rows: PaymentRow[]): Promise<Payment[]> {
  if (!rows.length) return [];
  const supabase = createClient();
  const memberIds = [...new Set(rows.map((row) => row.member_id))];
  const methodIds = [...new Set(rows.map((row) => row.payment_method_id))];
  const subscriptionIds = [...new Set(rows.map((row) => row.subscription_id).filter((value): value is string => Boolean(value)))];
  const profileIds = [...new Set(rows.map((row) => row.received_by).filter((value): value is string => Boolean(value)))];

  const [membersResult, methodsResult, subscriptionsResult, profilesResult, paidResult] = await Promise.all([
    supabase.from("members").select("*").in("id", memberIds),
    supabase.from("payment_methods").select("*").in("id", methodIds),
    subscriptionIds.length
      ? supabase.from("member_subscriptions").select("*").in("id", subscriptionIds)
      : Promise.resolve({ data: [] as SubscriptionRow[], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("*").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    subscriptionIds.length
      ? supabase.from("payments").select("*").in("subscription_id", subscriptionIds).eq("is_voided", false)
      : Promise.resolve({ data: [] as PaymentRow[], error: null }),
  ]);
  throwIfError(membersResult.error, "Payment members could not be loaded.");
  throwIfError(methodsResult.error, "Payment methods could not be loaded.");
  throwIfError(subscriptionsResult.error, "Payment memberships could not be loaded.");
  throwIfError(profilesResult.error, "Payment receivers could not be loaded.");
  throwIfError(paidResult.error, "Payment balances could not be loaded.");

  const subscriptions = subscriptionsResult.data ?? [];
  const planIds = [...new Set(subscriptions.map((item) => item.plan_id))];
  const plansResult = planIds.length
    ? await supabase.from("membership_plans").select("*").in("id", planIds)
    : { data: [] as MembershipPlanRow[], error: null };
  throwIfError(plansResult.error, "Membership plans could not be loaded.");

  const members = new Map((membersResult.data ?? []).map((row: MemberRow) => [row.id, row.full_name]));
  const methods = new Map((methodsResult.data ?? []).map((row: PaymentMethodRow) => [row.id, row.name]));
  const subscriptionsById = new Map(subscriptions.map((row: SubscriptionRow) => [row.id, row]));
  const plans = new Map((plansResult.data ?? []).map((row: MembershipPlanRow) => [row.id, row.name]));
  const profiles = new Map((profilesResult.data ?? []).map((row: ProfileRow) => [row.id, row.full_name]));
  const paid = new Map<string, number>();
  (paidResult.data ?? []).forEach((row: PaymentRow) => {
    if (row.subscription_id) paid.set(row.subscription_id, (paid.get(row.subscription_id) ?? 0) + numberValue(row.amount));
  });

  return rows.map((row) => {
    const subscription = row.subscription_id ? subscriptionsById.get(row.subscription_id) : undefined;
    const payment = toPayment(
      row,
      members.get(row.member_id) ?? "Unknown member",
      methods.get(row.payment_method_id) ?? "Unknown method",
      subscription ? plans.get(subscription.plan_id) : undefined,
    );
    if (subscription) {
      payment.totalFee = numberValue(subscription.final_amount);
      payment.discount = numberValue(subscription.discount);
      payment.balance = Math.max(0, numberValue(subscription.final_amount) - (paid.get(subscription.id) ?? 0));
    }
    payment.receivedBy = row.received_by ? profiles.get(row.received_by) : undefined;
    return payment;
  });
}

export const paymentsService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Payment>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const supabase = createClient();
    let memberIds: string[] | null = null;
    const search = safeSearchTerm(String(params.search ?? ""));

    if (search) {
      const pattern = `%${search}%`;
      const { data, error } = await supabase
        .from("members")
        .select("id")
        .or(`full_name.ilike.${pattern},member_code.ilike.${pattern}`)
        .limit(200);
      throwIfError(error, "Payment search could not be completed.");
      memberIds = (data ?? []).map((row) => row.id);
      if (!memberIds.length) return pageResult([], page, pageSize, 0);
    }

    let query = supabase.from("payments").select("*", { count: "exact" });
    if (memberIds) query = query.in("member_id", memberIds);
    if (params.memberId) query = query.eq("member_id", String(params.memberId));
    if (params.paymentMethodId || params.methodId) query = query.eq("payment_method_id", String(params.paymentMethodId ?? params.methodId));
    const dateFrom = params.dateFrom ?? params.from;
    const dateTo = params.dateTo ?? params.to;
    if (dateFrom) query = query.gte("payment_date", timestampBounds({ from: String(dateFrom), to: String(dateFrom) }).from);
    if (dateTo) query = query.lt("payment_date", timestampBounds({ from: String(dateTo), to: String(dateTo) }).toExclusive);
    if (params.status === "Voided") query = query.eq("is_voided", true);
    if (params.status === "Paid") query = query.eq("is_voided", false);

    const { data, error, count } = await query
      .order("payment_date", { ascending: false })
      .range(from, from + pageSize - 1);
    throwIfError(error, "Payments could not be loaded.");
    return pageResult(await enrichPayments(data ?? []), page, pageSize, count);
  },

  async get(id: string) {
    const { data, error } = await createClient().from("payments").select("*").eq("id", id).maybeSingle();
    throwIfError(error, "The payment could not be loaded.");
    if (!data) throw new ApiError("Payment not found.", 404);
    return (await enrichPayments([data]))[0];
  },

  async create(input: PaymentInput) {
    const { data, error } = await createClient().rpc("record_payment", {
      p_member_id: input.memberId,
      p_subscription_id: input.membershipId || null,
      p_amount: input.amountPaid,
      p_payment_method_id: input.paymentMethodId,
      p_payment_date: input.paymentDate,
      p_payment_type: input.paymentType ?? "membership",
      p_reference_number: optionalText(input.referenceNumber),
      p_notes: optionalText(input.notes),
    });
    throwIfError(error, "The payment could not be recorded.");
    if (!data) throw new ApiError("The payment was not recorded.", 500);
    return paymentsService.get(data);
  },

  async void(id: string, reason: string) {
    const { error } = await createClient().rpc("void_payment", {
      p_payment_id: id,
      p_reason: reason.trim(),
    });
    throwIfError(error, "The payment could not be voided.");
  },

  async methods() {
    const { data, error } = await createClient()
      .from("payment_methods")
      .select("*")
      .order("is_system", { ascending: false })
      .order("name");
    throwIfError(error, "Payment methods could not be loaded.");
    return (data ?? []).map((method) => ({ id: method.id, name: method.name, isActive: method.is_active }));
  },

  async summary(): Promise<PaymentSummary> {
    const { from, to } = currentBusinessRange();
    const supabase = createClient();
    const [reportResult, paidResult, unpaidResult] = await Promise.all([
      supabase.rpc("report_summary", { p_from: from, p_to: to }),
      supabase.from("member_overview").select("id", { count: "exact", head: true }).eq("payment_status", "paid"),
      supabase.from("member_overview").select("id", { count: "exact", head: true }).in("payment_status", ["partial", "unpaid"]),
    ]);
    throwIfError(reportResult.error, "Payment totals could not be loaded.");
    const report = jsonRecord(reportResult.data as Json);
    return {
      paymentsThisMonth: numberValue(report.total_revenue as number | string | null | undefined),
      outstandingAmount: numberValue(report.outstanding_amount as number | string | null | undefined),
      paidMembers: paidResult.count ?? 0,
      unpaidMembers: unpaidResult.count ?? 0,
    };
  },
};
