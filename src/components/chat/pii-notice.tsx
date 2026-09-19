"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ScanResult } from "@/lib/pii";

type Key =
  "cpr" | "card" | "iban" | "account" | "email" | "phone" | "icd" | "name" | "health" | "union";

/**
 * What the filter found, above the writing field. The blocking variant
 * names the findings and offers the three ways on: edit the line, send
 * it anyway, or switch the filter off for this conversation. The soft
 * variant names the hint words and blocks nothing.
 */
export function PiiNotice({
  result,
  blocking,
  onEdit,
  onSendAnyway,
  onDisable,
}: {
  result: ScanResult;
  blocking: boolean;
  onEdit: () => void;
  onSendAnyway: () => void;
  onDisable: () => void;
}) {
  const t = useTranslations("chat.pii");
  const Icon = blocking ? ShieldAlert : ShieldCheck;
  return (
    <div
      role={blocking ? "alert" : "status"}
      className={
        blocking
          ? "border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-lg border p-3 text-2sm"
          : "border-border bg-warning-tint flex flex-col gap-2 rounded-lg border p-3 text-2sm"
      }
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">{blocking ? t("title") : t("softTitle")}</span>{" "}
          {blocking ? t("notSent") : t("softBody")}
        </p>
      </div>
      <ul className="flex flex-col gap-1 pl-6">
        {result.findings.map((finding, i) => (
          <li key={`${finding.start}-${i}`} className="flex flex-wrap items-baseline gap-2">
            <span className="text-meta">{t(`names.${finding.key as Key}`)}</span>
            <code className="bg-background rounded px-1 font-mono text-xs">{finding.text}</code>
          </li>
        ))}
        {result.hints.map((hint) => (
          <li
            key={hint.key}
            className="flex flex-wrap items-baseline gap-2"
            title={t(`explain.${hint.key as "health" | "union"}`)}
          >
            <span className="text-meta">{t(`names.${hint.key as Key}`)}</span>
            <span>{hint.words.join(", ")}</span>
          </li>
        ))}
      </ul>
      {blocking ? (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <Button type="button" size="xs" onClick={onEdit}>
            {t("edit")}
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={onSendAnyway}>
            {t("sendAnyway")}
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={onDisable}>
            {t("disable")}
          </Button>
        </div>
      ) : null}
      <p className="text-meta pl-6 text-xs">{blocking ? t("note") : t("softNote")}</p>
    </div>
  );
}
