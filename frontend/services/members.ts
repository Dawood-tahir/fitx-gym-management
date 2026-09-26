import { createClient } from "@/lib/supabase/client";
import type {
  Member,
  MemberInput,
  MembershipHistoryItem,
  MemberTimelineEvent,
  MembershipStatus,
  PagedResult,
  Payment,
  PaymentStatus,
  RenewMembershipInput,
  RenewalHistoryItem,
} from "@/types/api";
import type {
  MemberOverviewRow,
  MembershipPlanRow,
  PaymentMethodRow,
  PaymentRow,
  ProfileRow,
  SubscriptionRow,
} from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { numberValue, optionalText, pageResult, safeSearchTerm, titleCase } from "./shared";
import { removeImage, signedImageUrl, uploadImage } from "./storage";

function membershipStatus(value: string): MembershipStatus {
  const statuses: Record<string, MembershipStatus> = {
    active: "Active",
    expiring_soon: "Expiring Soon",
    payment_due: "Payment Due",
    expired: "Expired",
    inactive: "Inactive",
    suspended: "Suspended",
    cancelled: "Cancelled",
    pending: "Pending",
  };
  return statuses[value] ?? "Expired";
}

function paymentStatus(value: string): PaymentStatus {
  const statuses: Record<string, PaymentStatus> = {
    paid: "Paid",
    partial: "Partial",
    unpaid: "Unpaid",
    voided: "Voided",
  };
  return statuses[value] ?? "Unpaid";
}

function toMember(row: MemberOverviewRow): Member {
  const memberState = titleCase(row.status) as Member["status"];
  return {
    id: row.id,
    memberId: row.member_code,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? undefined,
    cnic: row.national_id ?? undefined,
    gender: row.gender ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    address: row.address ?? undefined,
    emergencyContactName: row.emergency_contact_name ?? undefined,
    emergencyContactPhone: row.emergency_contact_phone ?? undefined,
    profilePhotoPath: row.profile_photo_path ?? undefined,
    status: memberState,
    planId: row.plan_id ?? undefined,
    planName: row.plan_name ?? "—",
    joinDate: row.join_date,
    startDate: row.start_date ?? undefined,
    expiryDate: row.end_date ?? "",
    fee: numberValue(row.membership_amount),
    discount: numberValue(row.discount),
    finalFee: numberValue(row.final_amount),
    amountPaid: numberValue(row.amount_paid),
    balance: numberValue(row.balance),
    paymentStatus: paymentStatus(row.payment_status),
    membershipStatus: membershipStatus(row.membership_status),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    currentMembershipId: row.subscription_id ?? undefined,
  };
}

function toPayment(
  row: PaymentRow,
  memberName: string,
  methodName: string,
  planName?: string,
): Payment {
  return {
    id: row.id,
    paymentId: row.payment_number,
    receiptNumber: row.payment_number,
    date: row.payment_date,
    memberId: row.member_id,
    memberName,
    subscriptionId: row.subscription_id ?? undefined,
    planName,
    amount: numberValue(row.amount),
    amountPaid: numberValue(row.amount),
    balance: 0,
    method: methodName,
    methodId: row.payment_method_id,
    paymentType: titleCase(row.payment_type),
    status: row.is_voided ? "Voided" : "Paid",
    referenceNumber: row.reference_number ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

async function enrichMember(member: Member) {
  const supabase = createClient();
  const [
    subscriptionsResult,
    paymentsResult,
    methodsResult,
    profilesResult,
    timelineResult,
  ] = await Promise.all([
    supabase.from("member_subscriptions").select("*").eq("member_id", member.id).order("start_date", { ascending: false }),
    supabase.from("payments").select("*").eq("member_id", member.id).order("payment_date", { ascending: false }),
    supabase.from("payment_methods").select("*"),
    supabase.from("profiles").select("*"),
    supabase.rpc("member_timeline", { p_member_id: member.id }),
  ]);
  throwIfError(subscriptionsResult.error, "Membership history could not be loaded.");
  throwIfError(paymentsResult.error, "Payment history could not be loaded.");
  throwIfError(timelineResult.error, "Member history could not be loaded.");

  const subscriptions = subscriptionsResult.data ?? [];
  const planIds = [...new Set(subscriptions.map((item) => item.plan_id))];
  const plansResult = planIds.length
    ? await supabase.from("membership_plans").select("*").in("id", planIds)
    : { data: [] as MembershipPlanRow[], error: null };
  throwIfError(plansResult.error, "Membership plans could not be loaded.");

  const plans = new Map((plansResult.data ?? []).map((plan) => [plan.id, plan]));
  const methods = new Map((methodsResult.data ?? []).map((method: PaymentMethodRow) => [method.id, method.name]));
  const profiles = new Map((profilesResult.data ?? []).map((profile: ProfileRow) => [profile.id, profile.full_name]));
  const paidBySubscription = new Map<string, number>();
  (paymentsResult.data ?? []).filter((payment) => !payment.is_voided && payment.subscription_id).forEach((payment) => {
    const key = payment.subscription_id as string;
    paidBySubscription.set(key, (paidBySubscription.get(key) ?? 0) + numberValue(payment.amount));
  });

  const history: MembershipHistoryItem[] = subscriptions.map((subscription: SubscriptionRow) => {
    const paid = paidBySubscription.get(subscription.id) ?? 0;
    const effectiveStatus = subscription.status === "active" && subscription.end_date < new Date().toISOString().slice(0, 10)
      ? "Expired"
      : titleCase(subscription.status);
    return {
      id: subscription.id,
      plan: plans.get(subscription.plan_id)?.name ?? "Unknown plan",
      planId: subscription.plan_id,
      startDate: subscription.start_date,
      expiryDate: subscription.end_date,
      finalFee: numberValue(subscription.final_amount),
      amountPaid: paid,
      balance: Math.max(0, numberValue(subscription.final_amount) - paid),
      status: effectiveStatus,
      isCurrent: subscription.is_current,
    };
  });

  const renewalHistory: RenewalHistoryItem[] = history.slice(0, -1).map((current, index) => ({
    id: current.id,
    previousPlan: history[index + 1]?.plan ?? "Previous membership",
    newPlan: current.plan,
    renewalDate: current.startDate,
    newExpiryDate: current.expiryDate,
    amountPaid: current.amountPaid,
  }));

  const paymentHistory = (paymentsResult.data ?? []).map((payment: PaymentRow) => {
    const subscription = subscriptions.find((item) => item.id === payment.subscription_id);
    const item = toPayment(
      payment,
      member.fullName,
      methods.get(payment.payment_method_id) ?? "Unknown",
      subscription ? plans.get(subscription.plan_id)?.name : undefined,
    );
    if (subscription) {
      item.totalFee = numberValue(subscription.final_amount);
      item.balance = Math.max(0, numberValue(subscription.final_amount) - (paidBySubscription.get(subscription.id) ?? 0));
    }
    item.receivedBy = payment.received_by ? profiles.get(payment.received_by) : undefined;
    return item;
  });

  return {
    ...member,
    profilePhotoUrl: await signedImageUrl("member-photos", member.profilePhotoPath),
    membershipHistory: history,
    paymentHistory,
    renewalHistory,
    timeline: (timelineResult.data ?? []).map((event): MemberTimelineEvent => ({
      eventAt: event.event_at,
      eventType: event.event_type,
      title: event.title,
      detail: event.detail ?? undefined,
      amount: event.amount === null ? undefined : numberValue(event.amount),
      subscriptionId: event.subscription_id ?? undefined,
      paymentId: event.payment_id ?? undefined,
    })),
  };
}

export const membersService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Member>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    let query = createClient().from("member_overview").select("*", { count: "exact" });

    const search = safeSearchTerm(String(params.search ?? ""));
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`full_name.ilike.${pattern},member_code.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
    }
    if (params.planId) query = query.eq("plan_id", String(params.planId));
    if (params.membershipStatus) {
      const value = String(params.membershipStatus).replace(/\s/g, "").toLowerCase();
      const map: Record<string, string> = { expiringssoon: "expiring_soon", expiringsoon: "expiring_soon", paymentdue: "payment_due" };
      query = query.eq("membership_status", map[value] ?? value);
    }
    if (params.paymentStatus) query = query.eq("payment_status", String(params.paymentStatus).toLowerCase());

    query = params.sortBy === "name"
      ? query.order("full_name", { ascending: true })
      : query.order("created_at", { ascending: false });
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    throwIfError(error, "Members could not be loaded.");
    return pageResult((data ?? []).map(toMember), page, pageSize, count);
  },

  async get(id: string) {
    const { data, error } = await createClient().from("member_overview").select("*").eq("id", id).maybeSingle();
    throwIfError(error, "The member could not be loaded.");
    if (!data) throw new ApiError("Member not found.", 404);
    return enrichMember(toMember(data));
  },

  async create(input: MemberInput) {
    let photoPath: string | null = null;
    if (input.profilePhoto) photoPath = await uploadImage("member-photos", input.profilePhoto, "members");
    try {
      const { data, error } = await createClient().rpc("create_member_with_membership", {
        p_full_name: input.fullName.trim(),
        p_phone: input.phone.trim(),
        p_email: optionalText(input.email),
        p_national_id: optionalText(input.cnic),
        p_gender: optionalText(input.gender)?.toLowerCase() ?? null,
        p_date_of_birth: optionalText(input.dateOfBirth),
        p_address: optionalText(input.address),
        p_emergency_contact_name: optionalText(input.emergencyContactName),
        p_emergency_contact_phone: optionalText(input.emergencyContactPhone),
        p_join_date: input.joiningDate,
        p_notes: optionalText(input.notes),
        p_profile_photo_path: photoPath,
        p_plan_id: input.membershipPlanId,
        p_start_date: input.membershipStartDate,
        p_amount: input.membershipFee,
        p_discount: input.discount,
        p_amount_paid: input.amountPaid,
        p_payment_method_id: input.paymentMethodId || null,
      });
      throwIfError(error, "The member could not be created.");
      if (!data) throw new ApiError("The member was not created.", 500);
      return membersService.get(data);
    } catch (error) {
      if (photoPath) await removeImage("member-photos", photoPath).catch(() => undefined);
      throw error;
    }
  },

  async update(id: string, input: Partial<MemberInput> & { removeProfilePhoto?: boolean }) {
    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase
      .from("members")
      .select("profile_photo_path")
      .eq("id", id)
      .maybeSingle();
    throwIfError(existingError, "The member could not be loaded.");
    if (!existing) throw new ApiError("Member not found.", 404);

    let nextPhotoPath = input.removeProfilePhoto ? null : existing.profile_photo_path;
    if (input.profilePhoto) nextPhotoPath = await uploadImage("member-photos", input.profilePhoto, "members");
    const { error } = await supabase.from("members").update({
      ...(input.fullName !== undefined && { full_name: input.fullName.trim() }),
      ...(input.phone !== undefined && { phone: input.phone.trim() }),
      ...(input.email !== undefined && { email: optionalText(input.email) }),
      ...(input.cnic !== undefined && { national_id: optionalText(input.cnic) }),
      ...(input.gender !== undefined && { gender: optionalText(input.gender)?.toLowerCase() ?? null }),
      ...(input.dateOfBirth !== undefined && { date_of_birth: optionalText(input.dateOfBirth) }),
      ...(input.address !== undefined && { address: optionalText(input.address) }),
      ...(input.emergencyContactName !== undefined && { emergency_contact_name: optionalText(input.emergencyContactName) }),
      ...(input.emergencyContactPhone !== undefined && { emergency_contact_phone: optionalText(input.emergencyContactPhone) }),
      ...(input.notes !== undefined && { notes: optionalText(input.notes) }),
      profile_photo_path: nextPhotoPath,
    }).eq("id", id);
    if (error) {
      if (nextPhotoPath && nextPhotoPath !== existing.profile_photo_path) {
        await removeImage("member-photos", nextPhotoPath).catch(() => undefined);
      }
      throwIfError(error, "The member could not be updated.");
    }
    if (existing.profile_photo_path && nextPhotoPath !== existing.profile_photo_path) {
      await removeImage("member-photos", existing.profile_photo_path).catch(() => undefined);
    }
    return membersService.get(id);
  },

  async remove(id: string) {
    const { error } = await createClient().from("members").update({
      status: "archived",
      archived_at: new Date().toISOString(),
    }).eq("id", id);
    throwIfError(error, "The member could not be archived.");
  },

  async renew(id: string, input: RenewMembershipInput) {
    const { error } = await createClient().rpc("renew_membership", {
      p_member_id: id,
      p_plan_id: input.planId,
      p_renewal_date: input.renewalDate,
      p_amount: input.membershipFee,
      p_discount: input.discount,
      p_amount_paid: input.amountPaid,
      p_payment_method_id: input.paymentMethodId || null,
      p_reference_number: optionalText(input.referenceNumber),
      p_notes: optionalText(input.notes),
    });
    throwIfError(error, "The membership could not be renewed.");
    return membersService.get(id);
  },

  async history(id: string) {
    const member = await membersService.get(id);
    return { payments: member.paymentHistory ?? [], renewals: member.renewalHistory ?? [] };
  },
};

export { toMember, toPayment };
