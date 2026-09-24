"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/services";
import { getErrorMessage } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import type { Complaint, ComplaintInput } from "@/types/api";

interface ComplaintFormValues {
  memberId: string;
  name: string;
  phone: string;
  type: ComplaintInput["type"];
  subject: string;
  message: string;
  status: NonNullable<ComplaintInput["status"]>;
  priority: ComplaintInput["priority"];
  adminResponse: string;
}

interface ResolveFormValues {
  response: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalText(value: string) {
  const normalized = value.trim();
  return normalized || undefined;
}

function inputType(type?: Complaint["type"]): ComplaintInput["type"] {
  if (type === "Suggestion") return "suggestion";
  if (type === "Feedback") return "feedback";
  return "complaint";
}

function inputPriority(priority?: Complaint["priority"]): ComplaintInput["priority"] {
  if (priority === "Low") return "low";
  if (priority === "High") return "high";
  return "medium";
}

function inputStatus(status?: Complaint["status"]): NonNullable<ComplaintInput["status"]> {
  if (status === "Reviewing") return "reviewing";
  if (status === "Resolved") return "resolved";
  if (status === "Closed") return "closed";
  return "new";
}

export function ComplaintFormDialog({
  open,
  complaint,
  onClose,
  onSaved,
}: {
  open: boolean;
  complaint?: Complaint | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");
  const editing = Boolean(complaint);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ComplaintFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      memberId: complaint?.memberId ?? "",
      name: complaint?.name ?? complaint?.memberName ?? "",
      phone: complaint?.phone ?? "",
      type: inputType(complaint?.type),
      subject: complaint?.subject ?? "",
      message: complaint?.message ?? "",
      status: inputStatus(complaint?.status),
      priority: inputPriority(complaint?.priority),
      adminResponse: complaint?.adminResponse ?? "",
    });
    setServerError("");
  }, [complaint, open, reset]);

  const memberId = watch("memberId");
  const submit = async (values: ComplaintFormValues) => {
    setServerError("");
    const body: ComplaintInput = {
      memberId: optionalText(values.memberId),
      name: optionalText(values.name),
      phone: optionalText(values.phone),
      type: values.type,
      subject: values.subject.trim(),
      message: values.message.trim(),
      status: values.status,
      priority: values.priority,
      adminResponse: optionalText(values.adminResponse),
    };

    try {
      if (complaint) await api.complaints.update(complaint.id, body);
      else await api.complaints.create(body);
      toast(complaint ? "Feedback record updated" : "Feedback recorded", {
        description: `${body.subject} was saved successfully.`,
      });
      onSaved();
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, "Could not save this feedback record.");
      setServerError(message);
      toast("Could not save feedback", { description: message, tone: "error" });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit complaint or feedback" : "Record complaint or feedback"}
      description="Link a member when known, or keep contact details for an external submission."
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button form="complaint-form" type="submit" loading={isSubmitting}>{editing ? "Save changes" : "Save record"}</Button>
        </>
      }
    >
      <form id="complaint-form" onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
        {serverError && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger">{serverError}</div>}

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Source</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Member record ID" error={errors.memberId?.message} hint="Optional UUID when linked to an existing member.">
              <Input dir="ltr" {...register("memberId", {
                validate: (value) => !value.trim() || UUID_PATTERN.test(value.trim()) || "Enter a valid member UUID.",
              })} />
            </Field>
            <Field label="Name" error={errors.name?.message} required={!memberId.trim()}>
              <Input autoFocus={!editing} autoComplete="name" {...register("name", {
                validate: (value) => Boolean(memberId.trim() || value.trim()) || "Enter a name or link a member.",
              })} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input type="tel" dir="ltr" autoComplete="tel" {...register("phone", {
                pattern: { value: /^$|^[+0-9()\-\s]{7,20}$/, message: "Enter a valid phone number." },
              })} />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-primary">Case details</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type" required>
              <Select {...register("type")}>
                <option value="complaint">Complaint</option>
                <option value="suggestion">Suggestion</option>
                <option value="feedback">Feedback</option>
              </Select>
            </Field>
            <Field label="Priority" required>
              <Select {...register("priority")}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </Field>
            {editing && <Field label="Status" required>
              <Select {...register("status")}>
                <option value="new">New</option>
                <option value="reviewing">Reviewing</option>
                {complaint?.status === "Resolved" && <option value="resolved">Resolved</option>}
                <option value="closed">Closed</option>
              </Select>
            </Field>}
            <Field label="Subject" error={errors.subject?.message} required className="sm:col-span-3">
              <Input autoFocus={editing} maxLength={160} {...register("subject", {
                required: "Subject is required.",
                validate: (value) => value.trim().length >= 3 || "Use at least 3 characters.",
              })} />
            </Field>
            <Field label="Message" error={errors.message?.message} required className="sm:col-span-3">
              <Textarea rows={5} maxLength={4000} {...register("message", {
                required: "Message is required.",
                validate: (value) => value.trim().length >= 10 || "Use at least 10 characters.",
              })} />
            </Field>
            {editing && complaint?.adminResponse && <Field label="Administrator response" className="sm:col-span-3">
              <Textarea rows={3} maxLength={2000} {...register("adminResponse")} />
            </Field>}
          </div>
        </section>
      </form>
    </Dialog>
  );
}

export function ResolveComplaintDialog({
  complaint,
  onClose,
  onSaved,
}: {
  complaint: Complaint | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResolveFormValues>();

  useEffect(() => {
    if (!complaint) return;
    reset({ response: complaint.adminResponse ?? "" });
    setServerError("");
  }, [complaint, reset]);

  const submit = async ({ response }: ResolveFormValues) => {
    if (!complaint) return;
    setServerError("");
    try {
      await api.complaints.resolve(complaint.id, response.trim());
      toast("Case resolved", { description: `${complaint.subject} was marked as resolved.` });
      onSaved();
      onClose();
    } catch (error) {
      const message = getErrorMessage(error, "Could not resolve this case.");
      setServerError(message);
      toast("Could not resolve case", { description: message, tone: "error" });
    }
  };

  return (
    <Dialog
      open={Boolean(complaint)}
      onClose={onClose}
      title="Resolve this case?"
      description="The response is saved with the case and its status changes to Resolved."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button form="resolve-complaint-form" type="submit" loading={isSubmitting}>Resolve case</Button>
        </>
      }
    >
      <form id="resolve-complaint-form" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        {serverError && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/[.08] p-3 text-xs text-danger">{serverError}</div>}
        <p className="text-sm text-secondary">Resolve <strong className="text-foreground">{complaint?.subject}</strong> with the following response:</p>
        <Field label="Administrator response" error={errors.response?.message} required>
          <Textarea autoFocus rows={5} maxLength={2000} {...register("response", {
            required: "A response is required before resolving the case.",
            validate: (value) => value.trim().length >= 3 || "Use at least 3 characters.",
          })} />
        </Field>
      </form>
    </Dialog>
  );
}
