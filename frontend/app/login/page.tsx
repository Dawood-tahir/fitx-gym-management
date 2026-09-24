"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { useLocale } from "@/components/locale-provider";
import { useAuth } from "@/components/auth-provider";
import { getErrorMessage } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  rememberMe: z.boolean(),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useLocale();
  const { login } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });
  const submit = async (values: FormData) => {
    setServerError("");
    try {
      const signedInUser = await login(
        values.email,
        values.password,
        values.rememberMe,
      );
      const destination = new URLSearchParams(window.location.search).get(
        "next",
      );
      router.replace(
        destination?.startsWith("/") &&
          !(
            signedInUser.role === "STAFF" &&
            destination.startsWith("/dashboard")
          )
          ? destination
          : signedInUser.role === "STAFF"
            ? "/members"
            : "/dashboard",
      );
      router.refresh();
    } catch (error) {
      setServerError(getErrorMessage(error, t("auth.invalid")));
    }
  };
  return (
    <AuthShell eyebrow="FITX BUSINESS CONTROL">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.22em] text-primary">
          Secure owner access
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          {t("auth.welcome")}
        </h1>
        <p className="mt-2 text-sm text-secondary">{t("auth.loginSubtitle")}</p>
      </div>
      <form
        onSubmit={handleSubmit(submit)}
        className="mt-8 space-y-5"
        noValidate
      >
        {serverError && (
          <div
            className="rounded-lg border border-danger/25 bg-danger/[.08] px-4 py-3 text-xs text-danger"
            role="alert"
          >
            {serverError}
          </div>
        )}
        <Field label={t("common.email")} error={errors.email?.message} required>
          <div className="relative">
            <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="ps-10"
              {...register("email")}
            />
          </div>
        </Field>
        <Field
          label={t("auth.password")}
          error={errors.password?.message}
          required
        >
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••"
              className="ps-10 pe-11"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-2 text-muted hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              className="size-4 rounded border-white/10 bg-background accent-primary"
              {...register("rememberMe")}
            />
            {t("auth.remember")}
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-primary hover:text-primary-hover"
          >
            {t("auth.forgot")}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
    </AuthShell>
  );
}
