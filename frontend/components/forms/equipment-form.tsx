"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { getErrorMessage, todayInput } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import type { Equipment, EquipmentInput } from "@/types/api";

interface EquipmentFormValues {
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  purchasePrice: string;
  condition: Equipment["condition"];
  status: Equipment["status"];
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  notes: string;
}

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

export function EquipmentFormDialog({
  open,
  equipment,
  onClose,
  onSaved,
}: {
  open: boolean;
  equipment?: Equipment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");
  const editing = Boolean(equipment);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      name: equipment?.name ?? "",
      category: equipment?.category ?? "",
      brand: equipment?.brand ?? "",
      model: equipment?.model ?? "",
      serialNumber: equipment?.serialNumber ?? "",
      purchaseDate: equipment?.purchaseDate?.slice(0, 10) ?? "",
      purchasePrice: equipment?.purchasePrice === undefined ? "" : String(equipment.purchasePrice),
      condition: equipment?.condition ?? "Good",
      status: equipment?.status ?? "Active",
      lastMaintenanceDate: equipment?.lastMaintenanceDate?.slice(0, 10) ?? "",
      nextMaintenanceDate: equipment?.nextMaintenanceDate?.slice(0, 10) ?? "",
      notes: equipment?.notes ?? "",
    });
    setServerError("");
  }, [equipment, open, reset]);

  const lastMaintenanceDate = watch("lastMaintenanceDate");
  const submit = async (values: EquipmentFormValues) => {
    setServerError("");
    const body: EquipmentInput = {
      name: values.name.trim(),
      category: optionalText(values.category),
      brand: optionalText(values.brand),
      model: optionalText(values.model),
      serialNumber: optionalText(values.serialNumber),
      purchaseDate: values.purchaseDate || undefined,
      purchasePrice: values.purchasePrice === "" ? undefined : Number(values.purchasePrice),
      condition: values.condition,
      status: values.status,
      lastMaintenanceDate: values.lastMaintenanceDate || undefined,
      nextMaintenanceDate: values.nextMaintenanceDate || undefined,
      notes: optionalText(values.notes),
    };

    try {
      if (equipment) await api.equipment.update(equipment.id, body);
      else await api.equipment.create(body);
      toast(equipment ? "Equipment updated" : "Equipment added", {
        description: `${body.name} was saved successfully.`,
      });
      onSaved();
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, "Could not save this equipment record.");
      setServerError(message);
      toast("Could not save equipment", { description: message, tone: "error" });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit equipment" : "Add equipment"}
      description={editing ? "Update asset, condition, and maintenance details." : "Add a gym asset to the equipment register."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button form="equipment-form" type="submit" loading={isSubmitting}>{editing ? "Save changes" : "Add equipment"}</Button>
        </>
      }
    >
      <form id="equipment-form" onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
        {serverError && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger">{serverError}</div>}

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Asset details</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Equipment name" error={errors.name?.message} required className="lg:col-span-2">
              <Input autoFocus {...register("name", {
                required: "Equipment name is required.",
                validate: (value) => value.trim().length >= 2 || "Use at least 2 characters.",
              })} />
            </Field>
            <Field label="Category">
              <Input placeholder="e.g. Cardio" {...register("category")} />
            </Field>
            <Field label="Brand">
              <Input {...register("brand")} />
            </Field>
            <Field label="Model">
              <Input {...register("model")} />
            </Field>
            <Field label="Serial number">
              <Input dir="ltr" {...register("serialNumber")} />
            </Field>
            <Field label="Purchase date">
              <Input type="date" max={todayInput()} {...register("purchaseDate")} />
            </Field>
            <Field label="Purchase price" error={errors.purchasePrice?.message}>
              <Input type="number" min={0} step="0.01" inputMode="decimal" {...register("purchasePrice", {
                validate: (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0) || "Enter a valid non-negative price.",
              })} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Condition & maintenance</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Condition" required>
              <Select {...register("condition")}>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
              </Select>
            </Field>
            <Field label="Status" required>
              <Select {...register("status")}>
                <option value="Active">Active</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Damaged">Damaged</option>
                <option value="Retired">Retired</option>
              </Select>
            </Field>
            <Field label="Last maintenance date">
              <Input type="date" max={todayInput()} {...register("lastMaintenanceDate")} />
            </Field>
            <Field label="Next maintenance date" error={errors.nextMaintenanceDate?.message}>
              <Input type="date" min={lastMaintenanceDate || undefined} {...register("nextMaintenanceDate", {
                validate: (value) => !value || !lastMaintenanceDate || value >= lastMaintenanceDate || "Next maintenance cannot be before the last maintenance date.",
              })} />
            </Field>
          </div>
        </section>

        <Field label="Notes">
          <Textarea rows={3} maxLength={1000} placeholder="Optional asset or maintenance notes" {...register("notes")} />
        </Field>
      </form>
    </Dialog>
  );
}
