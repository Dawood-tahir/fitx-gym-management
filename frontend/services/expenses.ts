import { createClient } from "@/lib/supabase/client";
import { currentBusinessRange, previousBusinessRange } from "@/lib/business-period";
import type { Expense, ExpenseInput, ExpenseSummary, PagedResult } from "@/types/api";
import type { ExpenseRow, Json, ProfileRow } from "@/types/database";
import { ApiError, throwIfError } from "./errors";
import { jsonRecord, numberValue, optionalText, pageResult, percentChange, safeSearchTerm } from "./shared";

const expenseColumns = "id,expense_number,title,category_id,description,amount,expense_date,payment_method_id,reference_number,notes,created_by,created_at";
type ExpenseListRow = Pick<ExpenseRow, "id" | "expense_number" | "title" | "category_id" | "description" | "amount" | "expense_date" | "payment_method_id" | "reference_number" | "notes" | "created_by" | "created_at">;

async function enrichExpenses(rows: ExpenseListRow[]): Promise<Expense[]> {
  if (!rows.length) return [];
  const supabase = createClient();
  const categoryIds = [...new Set(rows.map((row) => row.category_id))];
  const methodIds = [...new Set(rows.map((row) => row.payment_method_id))];
  const profileIds = [...new Set(rows.map((row) => row.created_by).filter((value): value is string => Boolean(value)))];
  const [categoriesResult, methodsResult, profilesResult] = await Promise.all([
    supabase.from("expense_categories").select("id,name").in("id", categoryIds),
    supabase.from("payment_methods").select("id,name").in("id", methodIds),
    profileIds.length
      ? supabase.from("profiles").select("id,full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);
  throwIfError(categoriesResult.error, "Expense categories could not be loaded.");
  throwIfError(methodsResult.error, "Payment methods could not be loaded.");
  throwIfError(profilesResult.error, "Expense creators could not be loaded.");
  const categories = new Map((categoriesResult.data ?? []).map((row) => [row.id, row.name]));
  const methods = new Map((methodsResult.data ?? []).map((row) => [row.id, row.name]));
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row.full_name]));

  return rows.map((row) => ({
    id: row.id,
    expenseNumber: row.expense_number,
    title: row.title,
    date: row.expense_date,
    categoryId: row.category_id,
    category: categories.get(row.category_id) ?? "Uncategorized",
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
    let query = createClient().from("expenses").select(expenseColumns, { count: "exact" }).eq("is_deleted", false);
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(`title.ilike.${pattern},description.ilike.${pattern},expense_number.ilike.${pattern},reference_number.ilike.${pattern}`);
    }
    if (params.categoryId) query = query.eq("category_id", String(params.categoryId));
    if (params.paymentMethodId) query = query.eq("payment_method_id", String(params.paymentMethodId));
    const dateFrom = params.dateFrom ?? params.from;
    const dateTo = params.dateTo ?? params.to;
    if (dateFrom) query = query.gte("expense_date", String(dateFrom));
    if (dateTo) query = query.lte("expense_date", String(dateTo));
    const { data, error, count } = await query
      .order("expense_date", { ascending: false })
      .range(from, from + pageSize - 1);
    throwIfError(error, "Expenses could not be loaded.");
    return pageResult(await enrichExpenses(data ?? []), page, pageSize, count);
  },

  async get(id: string) {
    const { data, error } = await createClient().from("expenses").select(expenseColumns).eq("id", id).eq("is_deleted", false).maybeSingle();
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
    }).select(expenseColumns).single();
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
    }).eq("id", id).eq("is_deleted", false).select(expenseColumns).single();
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
      .select("id,name,is_active")
      .order("is_system", { ascending: false })
      .order("name");
    throwIfError(error, "Expense categories could not be loaded.");
    return (data ?? []).map((category) => ({ id: category.id, name: category.name, isActive: category.is_active }));
  },

  async summary(): Promise<ExpenseSummary> {
    const current = currentBusinessRange();
    const previous = previousBusinessRange();
    const thisFrom = current.from;
    const thisTo = current.to;
    const previousFrom = previous.from;
    const previousTo = previous.to;
    const supabase = createClient();
    const [currentResult, previousResult] = await Promise.all([
      supabase.rpc("report_summary", { p_from: thisFrom, p_to: thisTo }),
      supabase.rpc("report_summary", { p_from: previousFrom, p_to: previousTo }),
    ]);
    throwIfError(currentResult.error, "Expense totals could not be loaded.");
    throwIfError(previousResult.error, "Previous expense totals could not be loaded.");
    const currentReport = jsonRecord(currentResult.data as Json);
    const previousReport = jsonRecord(previousResult.data as Json);
    const currentTotal = numberValue(currentReport.total_expenses as number | string | null | undefined);
    const previousTotal = numberValue(previousReport.total_expenses as number | string | null | undefined);
    return {
      totalThisMonth: currentTotal,
      largestCategory: typeof currentReport.largest_expense_category === "string" ? currentReport.largest_expense_category : "—",
      changePercentFromLastMonth: percentChange(currentTotal, previousTotal),
    };
  },
};
