"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { authService } from "@/services/auth";
import { getErrorMessage } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export default function ResetPasswordPage() {
  const { t } = useLocale(); const [show, setShow] = useState(false); const [done, setDone] = useState(false); const [serverError, setServerError] = useState("");
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<{ password: string; confirmPassword: string }>();
  const password = useWatch({ control, name: "password" });
  const submit = async ({ password }: { password: string }) => { setServerError(""); try { await authService.updatePassword(password); setDone(true); } catch (error) { setServerError(getErrorMessage(error)); } };
  return <AuthShell eyebrow="SECURE PASSWORD RESET"><h1 className="text-3xl font-extrabold tracking-tight">{t("auth.resetTitle")}</h1><p className="mt-2 text-sm leading-relaxed text-secondary">{t("auth.resetSubtitle")}</p>{done ? <div className="mt-8 rounded-xl border border-primary/20 bg-primary/[.06] p-5"><p className="text-sm font-semibold text-primary">Password changed successfully.</p><Link href="/login" className="mt-4 inline-flex text-xs font-semibold text-foreground underline decoration-primary underline-offset-4">Continue to sign in</Link></div> : <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">{serverError && <p className="rounded-lg border border-danger/25 bg-danger/[.08] px-4 py-3 text-xs text-danger">{serverError}</p>}<Field label={t("auth.password")} error={errors.password?.message} required><div className="relative"><LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input type={show ? "text" : "password"} className="ps-10 pe-11" {...register("password", { required: t("common.required"), minLength: { value: 10, message: "Use at least 10 characters." }, pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, message: "Include uppercase, lowercase, and a number." } })} /><button type="button" onClick={() => setShow((value) => !value)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-2 text-muted">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></Field><Field label={t("auth.confirmPassword")} error={errors.confirmPassword?.message} required><Input type={show ? "text" : "password"} {...register("confirmPassword", { validate: (value) => value === password || "Passwords do not match." })} /></Field><Button type="submit" className="w-full" loading={isSubmitting}>{t("auth.reset")}</Button></form>}</AuthShell>;
}
