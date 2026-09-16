import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseInput, ExpenseSummary, PagedResult } from "@/types/api";
import type { ExpenseCategoryRow, ExpenseRow, Json, PaymentMethodRow, ProfileRow } from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { jsonRecord, numberValue, optionalText, pageResult, percentChange, safeSearchTerm } from "./shared";

async function enrichExpenses(rows: ExpenseRow[]): Promise<Expense[]> {
  if (!rows.length) return [];
  const supabase = createClient();
  const categoryIds = [...new Set(rows.map((row) => row.category_id))];
  const methodIds = [...new Set(rows.map((row) => row.payment_method_id))];
  const profileIds = [...new Set(rows.map((row) => row.created_by).filter((value): value is string => Boolean(value)))];
  const [categoriesResult, methodsResult, profilesResult] = await Promise.all([
    supabase.from("expense_categories").select("*").in("id", categoryIds),
    supabase.from("payment_methods").select("*").in("id", methodIds),
    profileIds.length
      ? supabase.from("profiles").select("*").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);
  throwIfError(categoriesResult.error, "Expense categories could not be loaded.");
  throwIfError(methodsResult.error, "Payment methods could not be loaded.");
  throwIfError(profilesResult.error, "Expense creators could not be loaded.");
  const categories = new Map((categoriesResult.data ?? []).map((row: ExpenseCategoryRow) => [row.id, row.name]));
  const methods = new Map((methodsResult.data ?? []).map((row: PaymentMethodRow) => [row.id, row.name]));
  const profiles = new Map((profilesResult.data ?? []).map((row: ProfileRow) => [row.id, row.full_name]));

  return rows.map((row) => ({
    id: row.id,
    expenseNumber: row.expense_number,
    title: row.title,
    date: row.expense_date,
    categoryId: row.category_id,
    category: categories.get(row.category_id) ?? "Unknown",
    description: row.description ?? row.title,
    amount: numberValue(row.amount),
    paymentMethod: methods.get(row.payment_method_id) ?? "Unknown",
    paymentMethodId: row.payment_method_id,
    reference: row.reference_number ?? undefined,
    notes: row.notes ?? undefined,
    addedBy: row.created_by ? profiles.get(row.created_by) : undefined,
    createdAt: row.created_at,
  }));
}

export const expensesService = {
  async list(params: Record<string, string | number | undefined>): Promise<PagedResult<Expense>> {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const search = safeSearchTerm(String(params.search ?? ""));
    let query = createClient().from("expenses").select("*", { count: "exact" }).eq("is_deleted", false);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`title.ilike.${pattern},description.ilike.${pattern},expense_number.ilike.${pattern},reference_number.ilike.${pattern}`);
    }
    if (params.categoryId) query = query.eq("category_id", String(params.categoryId));
    if (params.paymentMethodId) query = query.eq("payment_method_id", String(params.paymentMethodId));
    if (params.dateFrom) query = query.gte("expense_date", String(params.dateFrom));
    if (params.dateTo) query = query.lte("expense_date", String(params.dateTo));
    const { data, error, count } = await query
      .order("expense_date", { ascending: false })
      .range(from, from + pageSize - 1);
    throwIfError(error, "Expenses could not be loaded.");
    return pageResult(await enrichExpenses(data ?? []), page, pageSize, count);
  },

  async get(id: string) {
    const { data, error } = await createClient().from("expenses").select("*").eq("id", id).eq("is_deleted", false).maybeSingle();
    throwIfError(error, "The expense could not be loaded.");
    if (!data) throw new ApiError("Expense not found.", 404);
    return (await enrichExpenses([data]))[0];
  },

  async create(input: ExpenseInput) {
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    throwIfError(authError, "Your session could not be verified.");
    if (!authData.user) throw new ApiError("Sign in before recording an expense.", 401);
    const { data, error } = await supabase.from("expenses").insert({
      title: input.title?.trim() || input.description.trim().slice(0, 120),
      category_id: input.categoryId,
      description: optionalText(input.description),
      amount: input.amount,
      expense_date: input.date,
      payment_method_id: input.paymentMethodId,
      reference_number: optionalText(input.reference),
      notes: optionalText(input.notes),
      created_by: authData.user.id,
    }).select("*").single();
    throwIfError(error, "The expense could not be recorded.");
    return (await enrichExpenses([data]))[0];
  },

  async update(id: string, input: ExpenseInput) {
    const { data, error } = await createClient().from("expenses").update({
      title: input.title?.trim() || input.description.trim().slice(0, 120),
      category_id: input.categoryId,
      description: optionalText(input.description),
      amount: input.amount,
      expense_date: input.date,
      payment_method_id: input.paymentMethodId,
      reference_number: optionalText(input.reference),
      notes: optionalText(input.notes),
    }).eq("id", id).eq("is_deleted", false).select("*").single();
    throwIfError(error, "The expense could not be updated.");
    return (await enrichExpenses([data]))[0];
  },

  async remove(id: string) {
    const { error } = await createClient().from("expenses").update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    }).eq("id", id);
    throwIfError(error, "The expense could not be deleted.");
  },

  async categories() {
    const { data, error } = await createClient()
      .from("expense_categories")
      .select("*")
      .order("is_system", { ascending: false })
      .order("name");
    throwIfError(error, "Expense categories could not be loaded.");
    return (data ?? []).map((category) => ({ id: category.id, name: category.name, isActive: category.is_active }));
  },

  async summary(): Promise<ExpenseSummary> {
    const now = new Date();
    const thisFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const thisTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const previousFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const previousTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    const supabase = createClient();
    const [currentResult, previousResult, categoryRowsResult] = await Promise.all([
      supabase.rpc("report_summary", { p_from: thisFrom, p_to: thisTo }),
      supabase.rpc("report_summary", { p_from: previousFrom, p_to: previousTo }),
      supabase.from("expenses").select("category_id,amount").eq("is_deleted", false).gte("expense_date", thisFrom).lte("expense_date", thisTo),
    ]);
    throwIfError(currentResult.error, "Expense totals could not be loaded.");
    throwIfError(previousResult.error, "Previous expense totals could not be loaded.");
    throwIfError(categoryRowsResult.error, "Expense categories could not be summarized.");
    const current = jsonRecord(currentResult.data as Json);
    const previous = jsonRecord(previousResult.data as Json);
    const currentTotal = numberValue(current.total_expenses as number | string | null | undefined);
    const previousTotal = numberValue(previous.total_expenses as number | string | null | undefined);
    const byCategory = new Map<string, number>();
    (categoryRowsResult.data ?? []).forEach((row) => byCategory.set(row.category_id, (byCategory.get(row.category_id) ?? 0) + numberValue(row.amount)));
    const largestId = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    let largestCategory = "—";
    if (largestId) {
      const { data } = await supabase.from("expense_categories").select("name").eq("id", largestId).maybeSingle();
      largestCategory = data?.name ?? "—";
    }
    return {
      totalThisMonth: currentTotal,
      largestCategory,
      changePercentFromLastMonth: percentChange(currentTotal, previousTotal),
    };
  },
};
