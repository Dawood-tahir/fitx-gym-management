"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { getErrorMessage, todayInput } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import type { Expense, ExpenseInput, LookupItem } from "@/types/api";

interface ExpenseFormValues {
  title: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  paymentMethodId: string;
  reference: string;
  notes: string;
}

interface ExpenseFormDialogProps {
  open: boolean;
  expense?: Expense | null;
  onClose: () => void;
  onSaved: (expense: Expense) => void;
}

export function ExpenseFormDialog({ open, expense, onClose, onSaved }: ExpenseFormDialogProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [methods, setMethods] = useState<LookupItem[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const editing = Boolean(expense);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      title: expense?.title ?? expense?.description ?? "",
      categoryId: expense?.categoryId ?? "",
      description: expense?.description ?? "",
      amount: expense?.amount ?? 0,
      date: expense?.date?.slice(0, 10) ?? todayInput(),
      paymentMethodId: expense?.paymentMethodId ?? "",
      reference: expense?.reference ?? "",
      notes: expense?.notes ?? "",
    });
    setServerError("");
  }, [expense, open, reset]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLookupsLoading(true);
    Promise.all([api.expenses.categories(), api.payments.methods()])
      .then(([nextCategories, nextMethods]) => {
        if (!active) return;
        const activeCategories = nextCategories.filter((item) => item.isActive !== false);
        const activeMethods = nextMethods.filter((item) => item.isActive !== false);
        setCategories(activeCategories);
        setMethods(activeMethods);

        if (expense && !expense.categoryId) {
          const category = activeCategories.find((item) => item.name === expense.category);
          if (category) setValue("categoryId", category.id);
        }
        if (expense && !expense.paymentMethodId) {
          const method = activeMethods.find((item) => item.name === expense.paymentMethod);
          if (method) setValue("paymentMethodId", method.id);
        }
      })
      .catch((error: unknown) => {
        if (active) setServerError(getErrorMessage(error, "Could not load expense options."));
      })
      .finally(() => {
        if (active) setLookupsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [expense, open, setValue]);

  const submit = async (values: ExpenseFormValues) => {
    setServerError("");
    const input: ExpenseInput = {
      title: values.title.trim(),
      categoryId: values.categoryId,
      description: values.description.trim(),
      amount: values.amount,
      date: values.date,
      paymentMethodId: values.paymentMethodId,
      reference: values.reference.trim() || undefined,
      notes: values.notes.trim() || undefined,
    };

    try {
      const saved = expense
        ? await api.expenses.update(expense.id, input)
        : await api.expenses.create(input);
      toast(expense ? "Expense updated" : "Expense added", {
        description: `${input.title || input.description} was saved successfully.`,
      });
      onSaved(saved);
      onClose();
    } catch (error: unknown) {
      setServerError(getErrorMessage(error, "Could not save the expense."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit expense" : t("expenses.add")}
      description={editing ? "Update this cost while retaining its audit history." : "Record an actual business cost for accurate profit reporting."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button form="expense-form" type="submit" loading={isSubmitting} disabled={lookupsLoading}>
            {editing ? t("common.save") : t("expenses.add")}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        {serverError && (
          <p className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger sm:col-span-2" role="alert">
            {serverError}
          </p>
        )}
        <Field label="Title" error={errors.title?.message} className="sm:col-span-2" required>
          <Input
            autoFocus
            maxLength={120}
            placeholder="e.g. September electricity bill"
            {...register("title", {
              required: t("common.required"),
              minLength: { value: 2, message: "Use at least 2 characters." },
            })}
          />
        </Field>
        <Field label={t("expenses.category")} error={errors.categoryId?.message} required>
          <Select disabled={lookupsLoading} {...register("categoryId", { required: t("common.required") })}>
            <option value="">{lookupsLoading ? "Loading categories…" : "Select category"}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("expenses.paymentMethod")} error={errors.paymentMethodId?.message} required>
          <Select disabled={lookupsLoading} {...register("paymentMethodId", { required: t("common.required") })}>
            <option value="">{lookupsLoading ? "Loading methods…" : "Select method"}</option>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>{method.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("common.amount")} error={errors.amount?.message} required>
          <Input
            type="number"
            min={0.01}
            step="0.01"
            inputMode="decimal"
            {...register("amount", {
              required: t("common.required"),
              valueAsNumber: true,
              min: { value: 0.01, message: "Amount must be greater than zero." },
              validate: (value) => Number.isFinite(value) || "Enter a valid amount.",
            })}
          />
        </Field>
        <Field label={t("common.date")} error={errors.date?.message} required>
          <Input type="date" max={todayInput()} {...register("date", { required: t("common.required") })} />
        </Field>
        <Field label={t("expenses.description")} error={errors.description?.message} className="sm:col-span-2" required>
          <Textarea
            rows={3}
            maxLength={500}
            placeholder="What was this expense for?"
            {...register("description", {
              required: t("common.required"),
              minLength: { value: 2, message: "Use at least 2 characters." },
            })}
          />
        </Field>
        <Field label={t("expenses.reference")} error={errors.reference?.message}>
          <Input maxLength={120} dir="ltr" placeholder="Invoice or transaction reference" {...register("reference")} />
        </Field>
        <Field label={t("common.notes")} error={errors.notes?.message}>
          <Input maxLength={1000} placeholder="Optional internal note" {...register("notes")} />
        </Field>
      </form>
    </Dialog>
  );
}
