"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "@/messages/en.json";
import ur from "@/messages/ur.json";

export type Locale = "en" | "ur";
type Messages = typeof en;

interface LocaleContextValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const dictionaries: Record<Locale, Messages> = { en, ur };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem("fitx-locale");
    if (stored === "en" || stored === "ur") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ur" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem("fitx-locale", next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) => {
      const value = key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, dictionaries[locale]);
      const fallback = key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, dictionaries.en);
      const template = typeof value === "string" ? value : typeof fallback === "string" ? fallback : key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
        template,
      );
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, dir: locale === "ur" ? "rtl" as const : "ltr" as const, setLocale, t }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
