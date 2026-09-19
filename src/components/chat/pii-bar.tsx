"use client";

import { useTranslations } from "next-intl";
import type { ScanResult } from "@/lib/pii";
import { PiiNotice } from "./pii-notice";

/**
 * The filter's place above the writing field: the notice when there is
 * something to say, and the one line that says it is off for this
 * conversation, with the way back on.
 */
export function PiiBar({
  result,
  blocking,
  enabled,
  off,
  onEdit,
  onSendAnyway,
  onDisable,
  onEnable,
}: {
  result: ScanResult | null;
  blocking: boolean;
  enabled: boolean;
  off: boolean;
  onEdit: () => void;
  onSendAnyway: () => void;
  onDisable: () => void;
  onEnable: () => void;
}) {
  const t = useTranslations("chat.pii");
  const shows = result !== null && (blocking || result.hints.length > 0);
  return (
    <>
      {shows && result ? (
        <div className="px-4 pb-2 sm:px-6">
          <PiiNotice
            result={result}
            blocking={blocking}
            onEdit={onEdit}
            onSendAnyway={onSendAnyway}
            onDisable={onDisable}
          />
        </div>
      ) : null}
      {enabled && off ? (
        <p className="text-meta px-4 pb-1 text-xs sm:px-6">
          {t("off")}{" "}
          <button type="button" className="underline" onClick={onEnable}>
            {t("enable")}
          </button>
        </p>
      ) : null}
    </>
  );
}
