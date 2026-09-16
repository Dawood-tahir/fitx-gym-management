import type {
  ApiEnvelope,
  AuthSession,
  DashboardData,
  Expense,
  ExpenseInput,
  GymSettings,
  LookupItem,
  Member,
  MemberInput,
  MembershipPlan,
  NotificationItem,
  PagedResult,
  Payment,
  PaymentInput,
  PaymentSummary,
  Reminder,
  ReminderSettings,
  ReportSummary,
  StaffInput,
  User,
  ExpenseSummary,
} from "@/types/api";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api").replace(/\/$/, "");
const SESSION_KEY = "fitx-session";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function readSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY) ?? "null") as AuthSession | null;
  } catch {
    return null;
  }
}

function normalizeKeys<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => normalizeKeys(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key.charAt(0).toLowerCase() + key.slice(1), normalizeKeys(child)]),
    ) as T;
  }
  return value as T;
}

type AnyRecord = Record<string, any>;

function spacedStatus(value: unknown): string {
  return String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2") || "Unknown";
}

function adaptPlan(raw: AnyRecord): MembershipPlan {
  const durationDays = Number(raw.durationDays ?? 30);
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Plan"),
    durationDays,
    durationMonths: Math.max(1, Math.round(durationDays / 30)),
    price: Number(raw.price ?? 0),
    description: raw.description,
    isActive: Boolean(raw.isActive ?? true),
  };
}

function adaptPayment(raw: AnyRecord): Payment {
  return {
    id: String(raw.id),
    paymentId: raw.paymentNumber ?? raw.paymentId,
    receiptNumber: raw.paymentNumber ?? raw.receiptNumber,
    date: String(raw.paymentDate ?? raw.date ?? ""),
    memberId: String(raw.memberId ?? ""),
    memberName: String(raw.member ?? raw.memberName ?? ""),
    planName: raw.membershipPlan ?? raw.planName,
    amount: Number(raw.amountPaid ?? raw.amount ?? 0),
    totalFee: Number(raw.totalFee ?? 0),
    discount: Number(raw.discount ?? 0),
    amountPaid: Number(raw.amountPaid ?? raw.amount ?? 0),
    balance: Number(raw.remainingAmount ?? raw.balance ?? 0),
    method: String(raw.paymentMethod ?? raw.method ?? "\u2014"),
    status: spacedStatus(raw.status) as Payment["status"],
    referenceNumber: raw.referenceNumber,
    notes: raw.notes,
    receivedBy: raw.receivedBy,
  };
}

function adaptExpense(raw: AnyRecord): Expense {
  return {
    id: String(raw.id),
    date: String(raw.expenseDate ?? raw.date ?? ""),
    categoryId: raw.categoryId ? String(raw.categoryId) : undefined,
    category: String(raw.category ?? "Other"),
    description: String(raw.description ?? ""),
    amount: Number(raw.amount ?? 0),
    paymentMethod: raw.paymentMethod,
    reference: raw.referenceNumber ?? raw.reference,
    notes: raw.notes,
    addedBy: raw.addedBy,
  };
}

function adaptNotification(raw: AnyRecord): NotificationItem {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? ""),
    type: String(raw.kind ?? raw.type ?? "System"),
    isRead: Boolean(raw.isRead),
    createdAt: String(raw.createdAt ?? ""),
  };
}

function adaptMember(raw: AnyRecord): Member {
  const membership = raw.currentMembership ?? raw.membership ?? {};
  return {
    id: String(raw.id),
    memberId: String(raw.memberCode ?? raw.memberId ?? raw.id),
    fullName: String(raw.fullName ?? raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    email: raw.email,
    cnic: raw.nationalId ?? raw.cnic,
    gender: raw.gender,
    dateOfBirth: raw.dateOfBirth,
    address: raw.address,
    planId: membership.planId ? String(membership.planId) : raw.planId,
    planName: String(membership.plan ?? raw.planName ?? "\u2014"),
    joinDate: String(membership.joiningDate ?? raw.joinDate ?? raw.createdAt ?? ""),
    startDate: membership.startDate ?? raw.startDate,
    expiryDate: String(membership.expiryDate ?? raw.expiryDate ?? ""),
    fee: Number(membership.fee ?? raw.fee ?? 0),
    discount: Number(membership.discount ?? raw.discount ?? 0),
    finalFee: Number(membership.finalFee ?? raw.finalFee ?? 0),
    amountPaid: Number(membership.amountPaid ?? raw.amountPaid ?? 0),
    balance: Number(membership.balance ?? raw.balance ?? 0),
    paymentStatus: spacedStatus(raw.paymentStatus ?? (Number(membership.balance) === 0 ? "Paid" : Number(membership.amountPaid) > 0 ? "Partial" : "Unpaid")) as Member["paymentStatus"],
    membershipStatus: spacedStatus(raw.membershipStatus ?? membership.status ?? "Expired") as Member["membershipStatus"],
    notes: raw.notes,
    createdAt: raw.createdAt,
    currentMembershipId: membership.id ? String(membership.id) : undefined,
    membershipHistory: Array.isArray(raw.membershipHistory) ? raw.membershipHistory.map((item: AnyRecord) => ({
      id: String(item.id), plan: String(item.plan), startDate: String(item.startDate), expiryDate: String(item.expiryDate),
      finalFee: Number(item.finalFee), amountPaid: Number(item.amountPaid), balance: Number(item.balance), status: spacedStatus(item.status), isCurrent: Boolean(item.isCurrent),
    })) : undefined,
    paymentHistory: Array.isArray(raw.paymentHistory) ? raw.paymentHistory.map(adaptPayment) : undefined,
    renewalHistory: Array.isArray(raw.renewalHistory) ? raw.renewalHistory.map((item: AnyRecord) => ({
      id: String(item.id), previousPlan: String(item.previousPlan), newPlan: String(item.newPlan), renewalDate: String(item.renewalDate), newExpiryDate: String(item.newExpiryDate), amountPaid: Number(item.amountPaid),
    })) : undefined,
  };
}

function adaptPaged<T>(raw: AnyRecord, adapter: (item: AnyRecord) => T): PagedResult<T> {
  const pageSize = Number(raw.pageSize ?? 20);
  const totalCount = Number(raw.totalCount ?? raw.items?.length ?? 0);
  return {
    items: Array.isArray(raw.items) ? raw.items.map(adapter) : [],
    page: Number(raw.page ?? 1),
    pageSize,
    totalCount,
    totalPages: Number(raw.totalPages ?? Math.max(1, Math.ceil(totalCount / pageSize))),
  };
}

function adaptDashboard(raw: AnyRecord): DashboardData {
  const kpis = Array.isArray(raw.kpis) ? raw.kpis : [];
  const findKpi = (...keys: string[]) => kpis.find((item: AnyRecord) => keys.includes(String(item.key).replace(/[^a-z]/gi, "").toLowerCase())) ?? {};
  const active = findKpi("activemembers");
  const expiring = findKpi("expiringsoon", "expiringmembers");
  const unpaid = findKpi("unpaidfees", "unpaidmembers", "outstanding");
  const revenue = findKpi("monthlyrevenue", "thismonthrevenue", "revenue");
  const expenses = findKpi("monthlyexpenses", "thismonthexpenses", "expenses");
  const profit = findKpi("netprofit", "profit");
  const distributions = (values: unknown) => Array.isArray(values) ? values.map((item: AnyRecord) => ({ name: spacedStatus(item.label ?? item.name), value: Number(item.value ?? 0) })) : [];
  return {
    activeMembers: Number(active.value ?? 0), activeMembersChange: Number(active.changePercent ?? 0),
    expiringSoon: Number(expiring.value ?? 0), expiringSoonChange: Number(expiring.changePercent ?? 0),
    unpaidFees: Number(unpaid.value ?? 0), unpaidFeesChange: Number(unpaid.changePercent ?? 0),
    monthlyRevenue: Number(revenue.value ?? 0), revenueChange: Number(revenue.changePercent ?? 0),
    monthlyExpenses: Number(expenses.value ?? 0), expensesChange: Number(expenses.changePercent ?? 0),
    netProfit: Number(profit.value ?? 0), profitChange: Number(profit.changePercent ?? 0),
    trend: (raw.monthlyTrend ?? raw.trend ?? []).map((item: AnyRecord) => ({ label: String(item.label), revenue: Number(item.revenue), expenses: Number(item.expenses), profit: Number(item.profit), newMembers: Number(item.newMembers) })),
    membershipStatus: distributions(raw.membershipStatuses ?? raw.membershipStatus),
    paymentStatus: distributions(raw.paymentStatuses ?? raw.paymentStatus),
    planDistribution: distributions(raw.membershipPlans ?? raw.planDistribution),
    recentMembers: (raw.recentMembers ?? []).map(adaptMember),
    recentPayments: (raw.recentPayments ?? []).map(adaptPayment),
    recentExpenses: (raw.recentExpenses ?? []).map(adaptExpense),
  };
}

let refreshPromise: Promise<AuthSession> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<AuthSession> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).then(async (response) => {
      const normalized = normalizeKeys<ApiEnvelope<AuthSession> | AuthSession>(await response.json());
      if (!response.ok) throw new ApiError("Your session has expired. Please sign in again.", response.status);
      const next = normalized && typeof normalized === "object" && "data" in normalized
        ? (normalized as ApiEnvelope<AuthSession>).data
        : normalized as AuthSession;
      const storage = localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage;
      storage.setItem(SESSION_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("fitx-session-refreshed", { detail: next }));
      return next;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the FITX API. Check that the backend is running.", 0);
  }

  if (response.status === 401 && allowRefresh && session?.refreshToken && !path.startsWith("/auth/")) {
    try {
      await refreshAccessToken(session.refreshToken);
      return request<T>(path, init, false);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  const normalized = normalizeKeys<ApiEnvelope<T> | T>(payload);
  if (!response.ok) {
    const envelope = normalized as Partial<ApiEnvelope<T>>;
    throw new ApiError(envelope.message || `Request failed (${response.status}).`, response.status, envelope.errors);
  }
  if (normalized && typeof normalized === "object" && "success" in normalized && "data" in normalized) {
    const envelope = normalized as ApiEnvelope<T>;
    if (!envelope.success) throw new ApiError(envelope.message || "The request was not successful.", response.status, envelope.errors);
    return envelope.data;
  }
  return normalized as T;
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

async function download(path: string, filename: string) {
  const session = readSession();
  const response = await fetch(`${API_URL}${path}`, {
    headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : undefined,
  });
  if (!response.ok) throw new ApiError("Could not generate the export.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const api = {
  auth: {
    login: (email: string, password: string, rememberMe: boolean) =>
      request<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, rememberMe }) }),
    forgotPassword: (email: string) =>
      request<void>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, password: string) =>
      request<void>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword: password }) }),
    logout: (refreshToken?: string) =>
      request<void>("/auth/revoke", { method: "POST", body: JSON.stringify({ refreshToken }) }),
  },
  dashboard: async (range = "6months") => adaptDashboard(await request<AnyRecord>(`/dashboard${query({ range })}`)),
  members: {
    list: async (params: Record<string, string | number | undefined>) => adaptPaged(await request<AnyRecord>(`/members${query(params)}`), adaptMember),
    get: async (id: string) => adaptMember(await request<AnyRecord>(`/members/${id}`)),
    create: async (body: MemberInput) => adaptMember(await request<AnyRecord>("/members", { method: "POST", body: JSON.stringify({ ...body, planId: body.membershipPlanId }) })),
    update: async (id: string, body: Partial<MemberInput>) => adaptMember(await request<AnyRecord>(`/members/${id}`, { method: "PUT", body: JSON.stringify({ ...body, nationalId: body.cnic }) })),
    remove: (id: string) => request<void>(`/members/${id}`, { method: "DELETE" }),
    renew: async (id: string, body: Record<string, unknown>) => adaptMember(await request<AnyRecord>(`/members/${id}/renew`, { method: "POST", body: JSON.stringify(body) })),
    history: (id: string) => request<{ payments: Payment[]; renewals: unknown[] }>(`/members/${id}/history`),
  },
  plans: {
    list: async () => (await request<AnyRecord[]>("/membership-plans")).map(adaptPlan),
    create: async (body: Partial<MembershipPlan>) => adaptPlan(await request<AnyRecord>("/membership-plans", { method: "POST", body: JSON.stringify({ ...body, durationDays: body.durationDays ?? (body.durationMonths ?? 1) * 30 }) })),
    update: async (id: string, body: Partial<MembershipPlan>) => adaptPlan(await request<AnyRecord>(`/membership-plans/${id}`, { method: "PUT", body: JSON.stringify({ ...body, durationDays: body.durationDays ?? (body.durationMonths ?? 1) * 30 }) })),
  },
  payments: {
    list: async (params: Record<string, string | number | undefined>) => adaptPaged(await request<AnyRecord>(`/payments${query(params)}`), adaptPayment),
    get: async (id: string) => adaptPayment(await request<AnyRecord>(`/payments/${id}`)),
    create: async (body: PaymentInput) => adaptPayment(await request<AnyRecord>("/payments", { method: "POST", body: JSON.stringify(body) })),
    methods: () => request<LookupItem[]>("/settings/payment-methods"),
    summary: () => request<PaymentSummary>("/payments/summary"),
  },
  expenses: {
    list: async (params: Record<string, string | number | undefined>) => adaptPaged(await request<AnyRecord>(`/expenses${query(params)}`), adaptExpense),
    create: async (body: ExpenseInput) => adaptExpense(await request<AnyRecord>("/expenses", { method: "POST", body: JSON.stringify({ ...body, expenseDate: body.date, referenceNumber: body.reference }) })),
    update: async (id: string, body: ExpenseInput) => adaptExpense(await request<AnyRecord>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify({ ...body, expenseDate: body.date, referenceNumber: body.reference }) })),
    remove: (id: string) => request<void>(`/expenses/${id}`, { method: "DELETE" }),
    categories: () => request<LookupItem[]>("/settings/expense-categories"),
    summary: () => request<ExpenseSummary>("/expenses/summary"),
  },
  reminders: {
    list: (params: Record<string, string | number | undefined>) => request<PagedResult<Reminder>>(`/reminders${query(params)}`),
    send: (id: string) => request<Reminder>(`/reminders/${id}/send`, { method: "POST" }),
    settings: () => request<ReminderSettings>("/reminders/settings"),
    updateSettings: (body: ReminderSettings) => request<ReminderSettings>("/reminders/settings", { method: "PUT", body: JSON.stringify(body) }),
  },
  reports: {
    summary: (type: string, from: string, to: string) => request<ReportSummary>(`/reports/${type}${query({ from, to })}`),
    export: (type: string, format: string, from: string, to: string) =>
      download(`/reports/${type}/export${query({ format, from, to })}`, `fitx-${type}-${from}-${to}.${format === "excel" ? "xlsx" : format}`),
  },
  staff: {
    list: (params: Record<string, string | number | undefined>) => request<PagedResult<User>>(`/staff${query(params)}`),
    create: (body: StaffInput) => request<User>("/staff", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<StaffInput>) => request<User>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    disable: (id: string) => request<void>(`/staff/${id}/disable`, { method: "POST" }),
    resetPassword: (id: string, newPassword: string) => request<void>(`/staff/${id}/reset-password`, { method: "POST", body: JSON.stringify({ newPassword }) }),
  },
  settings: {
    get: async () => { const raw = await request<AnyRecord>("/settings/gym"); return { ...raw, locale: (raw.defaultLocale ?? "en") as "en" | "ur" } as GymSettings; },
    update: async (body: GymSettings) => { const raw = await request<AnyRecord>("/settings/gym", { method: "PUT", body: JSON.stringify({ ...body, defaultLocale: body.locale }) }); return { ...raw, locale: (raw.defaultLocale ?? "en") as "en" | "ur" } as GymSettings; },
  },
  notifications: {
    list: async () => adaptPaged(await request<AnyRecord>("/notifications"), adaptNotification).items,
    read: (id: string) => request<void>(`/notifications/${id}/read`, { method: "PUT" }),
    readAll: () => request<void>("/notifications/read-all", { method: "PUT" }),
  },
  search: async (term: string) => {
    const raw = await request<AnyRecord>(`/search${query({ q: term })}`);
    const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
    return items.map((item: AnyRecord) => ({
      type: String(item.type ?? ""),
      id: String(item.id),
      title: String(item.title ?? ""),
      subtitle: item.subtitle ? String(item.subtitle) : undefined,
    }));
  },
};

export { API_URL, SESSION_KEY };
