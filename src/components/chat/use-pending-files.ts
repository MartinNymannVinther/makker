"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { discardFileAction } from "@/modules/chat/actions";
import type { ChatFile } from "./message-item";

type UploadAnswer = {
  ok: boolean;
  results?: Array<
    | { name: string; ok: true; file: { id: string; name: string; size: number; hasText: boolean } }
    | { name: string; ok: false; reason: "tooBig" | "unsupported" | "empty" }
  >;
};

/**
 * The files waiting to go with the next line. Uploaded the moment they
 * are picked, so the text is already read when the line is sent; a file
 * thought better of is deleted again, not merely dropped from the list.
 */
export function usePendingFiles(conversationId: string | null) {
  const t = useTranslations("chat.composer.files");
  const [pendingFiles, setPendingFiles] = useState<ChatFile[]>([]);
  const [uploading, setUploading] = useState(false);

  async function pickFiles(list: FileList) {
    setUploading(true);
    const form = new FormData();
    if (conversationId) form.set("conversationId", conversationId);
    for (const file of Array.from(list)) form.append("files", file);
    try {
      const response = await fetch("/api/files", { method: "POST", body: form });
      const answer = (await response.json()) as UploadAnswer;
      if (!response.ok || !answer.ok || !answer.results) {
        toast.error(t("failed"));
        return;
      }
      const accepted: ChatFile[] = [];
      for (const result of answer.results) {
        if (result.ok) accepted.push({ ...result.file, messageId: null });
        else toast.error(`${result.name}: ${t(`reasons.${result.reason}`)}`);
      }
      setPendingFiles((was) => [...was, ...accepted]);
    } catch {
      toast.error(t("failed"));
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(fileId: string) {
    setPendingFiles((was) => was.filter((f) => f.id !== fileId));
    await discardFileAction({ fileId });
  }

  return { pendingFiles, setPendingFiles, uploading, pickFiles, removeFile };
}
