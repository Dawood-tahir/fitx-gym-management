"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/services";
import { getErrorMessage } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import type { MembershipPlan, MembershipPlanInput } from "@/types/api";

interface PlanFormDialogProps {
  open: boolean;
  plan?: MembershipPlan | null;
  onClose: () => void;
  onSaved: (plan: MembershipPlan) => void;
}

export function PlanFormDialog({ open, plan, onClose, onSaved }: PlanFormDialogProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MembershipPlanInput>();

  useEffect(() => {
    if (!open) return;
    reset({
      name: plan?.name ?? "",
      description: plan?.description ?? "",
      durationMonths: plan?.durationMonths ?? 1,
      price: plan?.price ?? 0,
      isActive: plan?.isActive ?? true,
    });
    setServerError("");
  }, [open, plan, reset]);

  const submit = async (values: MembershipPlanInput) => {
    setServerError("");
    const input: MembershipPlanInput = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      durationMonths: values.durationMonths,
      price: values.price,
      isActive: values.isActive,
    };

    try {
      const saved = plan
        ? await api.plans.update(plan.id, input)
        : await api.plans.create(input);
      toast(plan ? "Membership plan updated" : "Membership plan created", {
        description: `${saved.name} is ready to use.`,
      });
      onSaved(saved);
      onClose();
    } catch (error: unknown) {
      setServerError(getErrorMessage(error, "Could not save the membership plan."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plan ? "Edit membership plan" : "Add membership plan"}
      description="Plan prices and durations are snapshotted onto memberships, so historical records remain unchanged."
      size="md"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button form="plan-form" type="submit" loading={isSubmitting}>
            {plan ? t("common.save") : "Add plan"}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        {serverError && (
          <p className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger sm:col-span-2" role="alert">
            {serverError}
          </p>
        )}
        <Field label="Plan name" error={errors.name?.message} className="sm:col-span-2" required>
          <Input
            autoFocus
            maxLength={80}
            placeholder="e.g. Quarterly"
            {...register("name", {
              required: t("common.required"),
              minLength: { value: 2, message: "Use at least 2 characters." },
            })}
          />
        </Field>
        <Field label="Duration in months" error={errors.durationMonths?.message} required>
          <Input
            type="number"
            min={1}
            max={120}
            step={1}
            inputMode="numeric"
            {...register("durationMonths", {
              required: t("common.required"),
              valueAsNumber: true,
              min: { value: 1, message: "Duration must be at least one month." },
              max: { value: 120, message: "Duration cannot exceed 120 months." },
              validate: (value) => Number.isInteger(value) || "Use a whole number of months.",
            })}
          />
        </Field>
        <Field label={t("settings.price")} error={errors.price?.message} required>
          <Input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            {...register("price", {
              required: t("common.required"),
              valueAsNumber: true,
              min: { value: 0, message: "Price cannot be negative." },
              validate: (value) => Number.isFinite(value) || "Enter a valid price.",
            })}
          />
        </Field>
        <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
          <Textarea rows={3} maxLength={500} placeholder="Optional explanation of what this plan includes" {...register("description")} />
        </Field>
        <label className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] p-4 text-xs text-secondary sm:col-span-2">
          <input type="checkbox" className="size-4 rounded border-white/10 bg-background accent-primary" {...register("isActive")} />
          <span>
            <strong className="block text-foreground">Active and available for new memberships</strong>
            <span className="mt-1 block text-[11px] text-muted">Inactive plans remain visible in historical membership records.</span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}
