"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { MAX_TITLE_CHARS } from "@/modules/ai/wire";
import { deleteConversationAction, renameConversationAction } from "@/modules/chat/actions";

/**
 * The conversation's name at the top of the page: read, or edited in
 * place, and beside it the one way to make the conversation go away.
 */
export function ConversationTitle({
  conversationId,
  title,
  onRenamed,
}: {
  conversationId: string;
  title: string;
  onRenamed: (title: string) => void;
}) {
  const t = useTranslations("chat.header");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      setDraft(title);
      return;
    }
    setSaving(true);
    const result = await renameConversationAction({ conversationId, title: next });
    setSaving(false);
    if (!result.ok) {
      toast.error(tc("error"));
      return;
    }
    onRenamed(result.data);
    setEditing(false);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={MAX_TITLE_CHARS}
            aria-label={t("renameLabel")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditing(false);
                setDraft(title);
              }
            }}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={saving}>
            <Check data-slot="icon" />
            {t("save")}
          </Button>
        </form>
      ) : (
        <>
          <h1 className="truncate text-base font-semibold">{title || t("untitled")}</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("rename")}
            title={t("rename")}
            onClick={() => {
              setDraft(title);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
        </>
      )}
      <div className="ml-auto">
        <ConfirmButton
          variant="ghost"
          size="sm"
          title={t("deleteTitle")}
          body={t("deleteBody")}
          confirmLabel={t("deleteConfirm")}
          onConfirm={async () => {
            const result = await deleteConversationAction({ conversationId });
            // The action redirects on success and never returns; a return
            // is a refusal.
            if (result && !result.ok) toast.error(tc("error"));
          }}
        >
          <Trash2 data-slot="icon" />
          {t("delete")}
        </ConfirmButton>
      </div>
    </div>
  );
}
