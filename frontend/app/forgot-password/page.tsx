"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export default function ForgotPasswordPage() {
  const { t } = useLocale(); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>();
  const submit = async ({ email }: { email: string }) => { setError(""); try { await api.auth.forgotPassword(email); setSent(true); } catch (caught) { setError(getErrorMessage(caught)); } };
  return <AuthShell eyebrow="ACCOUNT RECOVERY"><h1 className="text-3xl font-extrabold tracking-tight">{t("auth.forgotTitle")}</h1><p className="mt-2 text-sm leading-relaxed text-secondary">{t("auth.forgotSubtitle")}</p>{sent ? <div className="mt-8 rounded-xl border border-primary/20 bg-primary/[.06] p-5"><h2 className="text-sm font-semibold text-primary">Check your inbox</h2><p className="mt-2 text-xs leading-relaxed text-secondary">If an account exists for that email, password reset instructions have been sent. The response is intentionally the same for all addresses.</p></div> : <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">{error && <p className="rounded-lg border border-danger/25 bg-danger/[.08] px-4 py-3 text-xs text-danger">{error}</p>}<Field label={t("common.email")} error={errors.email?.message} required><div className="relative"><Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input type="email" className="ps-10" placeholder="owner@yourgym.com" {...register("email", { required: t("common.required"), pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address." } })} /></div></Field><Button type="submit" className="w-full" loading={isSubmitting}>{t("auth.sendLink")}</Button></form>}<Link href="/login" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-primary"><ArrowLeft className="size-4 rtl:rotate-180" />{t("auth.backToLogin")}</Link></AuthShell>;
}
