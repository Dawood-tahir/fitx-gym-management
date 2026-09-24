"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/services";
import { getErrorMessage, todayInput } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import type { Staff, StaffInput } from "@/types/api";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface StaffFormValues {
  fullName: string;
  phone: string;
  email: string;
  position: string;
  salary: string;
  hireDate: string;
  status: Staff["status"];
  address: string;
  notes: string;
  photo?: FileList;
}

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

function validatePhoto(files?: FileList) {
  const file = files?.item(0);
  if (!file) return true;
  if (!ACCEPTED_PHOTO_TYPES.has(file.type)) return "Use a JPG, PNG, or WebP image.";
  return file.size <= MAX_PHOTO_BYTES || "Photo must be 5 MB or smaller.";
}

export function StaffFormDialog({
  open,
  staff,
  onClose,
  onSaved,
}: {
  open: boolean;
  staff?: Staff | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");
  const editing = Boolean(staff);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      fullName: staff?.fullName ?? "",
      phone: staff?.phone ?? "",
      email: staff?.email ?? "",
      position: staff?.position ?? "",
      salary: staff?.salary === undefined ? "" : String(staff.salary),
      hireDate: staff?.hireDate?.slice(0, 10) ?? todayInput(),
      status: staff?.status ?? "Active",
      address: staff?.address ?? "",
      notes: staff?.notes ?? "",
      photo: undefined,
    });
    setServerError("");
  }, [open, reset, staff]);

  const submit = async (values: StaffFormValues) => {
    setServerError("");
    const photo = values.photo?.item(0) ?? undefined;
    const body: StaffInput = {
      fullName: values.fullName.trim(),
      phone: values.phone.trim(),
      email: optionalText(values.email),
      position: values.position.trim(),
      salary: values.salary === "" ? undefined : Number(values.salary),
      hireDate: values.hireDate,
      status: values.status,
      address: optionalText(values.address),
      notes: optionalText(values.notes),
      photo,
    };

    try {
      if (staff) await api.staff.update(staff.id, body);
      else await api.staff.create(body);
      toast(staff ? "Staff member updated" : "Staff member added", {
        description: `${body.fullName} was saved successfully.`,
      });
      onSaved();
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, "Could not save the staff member.");
      setServerError(message);
      toast("Could not save staff member", { description: message, tone: "error" });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit staff member" : "Add staff member"}
      description={editing ? "Update employment and contact information." : "Create a staff record for this gym."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button form="staff-form" type="submit" loading={isSubmitting}>{editing ? "Save changes" : "Add staff member"}</Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
        {serverError && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger">{serverError}</div>}

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Personal details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.fullName?.message} required>
              <Input autoFocus autoComplete="name" {...register("fullName", {
                required: "Full name is required.",
                validate: (value) => value.trim().length >= 2 || "Use at least 2 characters.",
              })} />
            </Field>
            <Field label="Phone" error={errors.phone?.message} required>
              <Input type="tel" dir="ltr" autoComplete="tel" {...register("phone", {
                required: "Phone number is required.",
                pattern: { value: /^[+0-9()\-\s]{7,20}$/, message: "Enter a valid phone number." },
              })} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" dir="ltr" autoComplete="email" {...register("email", {
                pattern: { value: /^$|^\S+@\S+\.\S+$/, message: "Enter a valid email address." },
              })} />
            </Field>
            <Field label="Photo" error={errors.photo?.message} hint="JPG, PNG, or WebP. Maximum 5 MB.">
              <Input type="file" accept="image/jpeg,image/png,image/webp" {...register("photo", { validate: validatePhoto })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input autoComplete="street-address" {...register("address")} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Employment</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Position" error={errors.position?.message} required>
              <Input placeholder="e.g. Manager or Receptionist" {...register("position", {
                required: "Position is required.",
                validate: (value) => value.trim().length >= 2 || "Use at least 2 characters.",
              })} />
            </Field>
            <Field label="Monthly salary" error={errors.salary?.message} hint="Optional">
              <Input type="number" min={0} step="0.01" inputMode="decimal" {...register("salary", {
                validate: (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0) || "Enter a valid non-negative salary.",
              })} />
            </Field>
            <Field label="Hire date" error={errors.hireDate?.message} required>
              <Input type="date" max={todayInput()} {...register("hireDate", { required: "Hire date is required." })} />
            </Field>
            <Field label="Status" required>
              <Select {...register("status")}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </Field>
          </div>
        </section>

        <Field label="Notes">
          <Textarea rows={3} maxLength={1000} placeholder="Optional employment notes" {...register("notes")} />
        </Field>
      </form>
    </Dialog>
  );
}
