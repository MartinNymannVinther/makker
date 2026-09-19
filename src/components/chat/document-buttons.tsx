"use client";

import { FileText, Loader2, Presentation } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DocumentFormat } from "@/modules/documents/service";

/**
 * The conversation as a file. One request, one download; the model
 * writes the content and the template shapes it on the server, and the
 * browser only ever sees the finished file.
 */
export function DocumentButtons({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled: boolean;
}) {
  const t = useTranslations("chat.documents");
  const tf = useTranslations("chat.failed");
  const locale = useLocale();
  const [making, setMaking] = useState<DocumentFormat | null>(null);

  async function fetchDocument(format: DocumentFormat) {
    setMaking(format);
    try {
      const response = await fetch(`/api/documents?locale=${encodeURIComponent(locale)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, format }),
      });
      if (response.headers.get("content-type")?.includes("application/json")) {
        const answer = (await response.json()) as { error?: string };
        toast.error(answer.error ? tf(answer.error as "generic") : t("failed"));
        return;
      }
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        `dokument.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("failed"));
    } finally {
      setMaking(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || making !== null}
        onClick={() => void fetchDocument("docx")}
      >
        {making === "docx" ? (
          <Loader2 data-slot="icon" className="animate-spin" />
        ) : (
          <FileText data-slot="icon" />
        )}
        {making === "docx" ? t("making") : t("word")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || making !== null}
        onClick={() => void fetchDocument("pptx")}
      >
        {making === "pptx" ? (
          <Loader2 data-slot="icon" className="animate-spin" />
        ) : (
          <Presentation data-slot="icon" />
        )}
        {making === "pptx" ? t("making") : t("powerpoint")}
      </Button>
    </div>
  );
}
