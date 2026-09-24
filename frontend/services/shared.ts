import type { PagedResult } from "@/types/api";
import type { Json } from "@/types/database";

export function pageResult<T>(items: T[], page: number, pageSize: number, count: number | null): PagedResult<T> {
  const totalCount = count ?? items.length;
  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function safeSearchTerm(value: string | undefined) {
  return (value ?? "").trim().replace(/[%,()_*]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function jsonRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

export function jsonArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}
