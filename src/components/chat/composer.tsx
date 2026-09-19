"use client";

import { ListChecks, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MESSAGE_CHARS } from "@/modules/ai/wire";
import type { ChatFile } from "./message-item";

export type RoleOption = { id: string; name: string; description: string };
export type TaskOption = {
  id: string;
  groupName: string;
  name: string;
  description: string;
  prompt: string;
  roleId: string | null;
};

/**
 * The writing field and what sits around it: the role for this
 * conversation, the task library, the files waiting to go with the
 * next line, and the button. Enter sends; Shift+Enter is a new line.
 */
export function Composer({
  draft,
  onDraft,
  roleId,
  onRole,
  roles,
  tasks,
  onTask,
  pendingFiles,
  onPickFiles,
  onRemoveFile,
  uploading,
  busy,
  modelConfigured,
  onSend,
}: {
  draft: string;
  onDraft: (value: string) => void;
  roleId: string | null;
  onRole: (roleId: string | null) => void;
  roles: RoleOption[];
  tasks: TaskOption[];
  onTask: (task: TaskOption) => void;
  pendingFiles: ChatFile[];
  onPickFiles: (files: FileList) => void;
  onRemoveFile: (fileId: string) => void;
  uploading: boolean;
  busy: boolean;
  modelConfigured: boolean;
  onSend: () => void;
}) {
  const t = useTranslations("chat.composer");
  const input = useRef<HTMLInputElement>(null);
  const canSend =
    modelConfigured && !busy && !uploading && (draft.trim() !== "" || pendingFiles.length > 0);
  const groups = [...new Set(tasks.map((task) => task.groupName))];

  return (
    <form
      className="border-border bg-background flex flex-col gap-2 border-t px-4 py-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {pendingFiles.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {pendingFiles.map((file) => (
            <li
              key={file.id}
              className="border-border bg-card inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
            >
              <Paperclip className="size-3" aria-hidden />
              <span className="max-w-[16rem] truncate">{file.name}</span>
              {!file.hasText ? <span className="text-meta">· {t("files.noText")}</span> : null}
              <button
                type="button"
                aria-label={t("files.remove", { name: file.name })}
                className="hover:bg-muted rounded-full p-0.5"
                onClick={() => onRemoveFile(file.id)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        value={draft}
        onChange={(event) => onDraft(event.target.value.slice(0, MAX_MESSAGE_CHARS))}
        rows={3}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder={modelConfigured ? t("placeholder") : t("noModel")}
        disabled={!modelConfigured || busy}
        aria-label={t("inputLabel")}
        className="max-h-[40svh] min-h-20"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) onPickFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? (
            <Loader2 data-slot="icon" className="animate-spin" />
          ) : (
            <Paperclip data-slot="icon" />
          )}
          {uploading ? t("files.uploading") : t("attach")}
        </Button>
        {tasks.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" disabled={busy}>
                  <ListChecks data-slot="icon" />
                  {t("tasks")}
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="max-h-[60svh] min-w-64 overflow-y-auto">
              {groups.map((group, index) => (
                <DropdownMenuGroup key={group}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{group}</DropdownMenuLabel>
                  {tasks
                    .filter((task) => task.groupName === group)
                    .map((task) => (
                      <DropdownMenuItem key={task.id} onClick={() => onTask(task)}>
                        <span className="flex flex-col">
                          <span>{task.name}</span>
                          <span className="text-meta text-xs">{task.description}</span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <label className="flex items-center gap-2 text-2sm">
          <span className="text-meta">{t("role")}</span>
          <NativeSelect
            variant="sm"
            className="w-auto min-w-40"
            value={roleId ?? ""}
            disabled={busy}
            onChange={(event) => onRole(event.target.value || null)}
          >
            <option value="">{t("noRole")}</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id} title={role.description}>
                {role.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <span className="text-meta ml-auto hidden text-xs sm:inline">{t("hint")}</span>
        <Button type="submit" size="sm" disabled={!canSend}>
          {busy ? (
            <Loader2 data-slot="icon" className="animate-spin" />
          ) : (
            <SendHorizontal data-slot="icon" />
          )}
          {busy ? t("sending") : t("send")}
        </Button>
      </div>
    </form>
  );
}
