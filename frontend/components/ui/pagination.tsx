"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { useLocale } from "@/components/locale-provider";

export function Pagination({ page, totalPages, totalCount, onPageChange }: { page: number; totalPages: number; totalCount?: number; onPageChange: (page: number) => void }) {
  const { t, dir } = useLocale();
  if (totalPages <= 1) return totalCount !== undefined ? <p className="text-xs text-muted">{totalCount} {totalCount === 1 ? "record" : "records"}</p> : null;
  const PreviousIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;
  return <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">{totalCount ?? ""} records · {t("common.page")} {page} {t("common.of")} {totalPages}</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><PreviousIcon className="size-4" />{t("common.previous")}</Button><Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{t("common.next")}<NextIcon className="size-4" /></Button></div></div>;
}
