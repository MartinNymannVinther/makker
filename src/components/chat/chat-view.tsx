"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { scan, type PiiSettings, type ScanResult } from "@/lib/pii";
import { askAi } from "@/modules/ai/read-client";
import { setConversationRoleAction } from "@/modules/chat/actions";
import type { ChatFailure, ChatStreamEvent } from "@/modules/chat/wire";
import { ChatEmpty } from "./chat-empty";
import { Composer, type RoleOption, type TaskOption } from "./composer";
import { ConversationTitle } from "./conversation-title";
import { DocumentButtons } from "./document-buttons";
import { MessageItem, type ChatFile, type ChatLine } from "./message-item";
import { PiiBar } from "./pii-bar";
import { readChatStream } from "./stream";
import { usePendingFiles } from "./use-pending-files";

type Conversation = { id: string; title: string; roleId: string | null };

/** The filter's tuning, from the workspace's settings; `enabled` is the administrator's switch. */
export type PiiConfig = PiiSettings & { enabled: boolean; blockOnHint: boolean };

/**
 * The conversation itself: the lines so far, the one being written, and
 * the field for the next. A line goes to the streaming route and the
 * answer is drawn as it arrives; when it is done the page asks the model
 * for a title the first time, and moves to the conversation's own address
 * if it was new. Everything the model wrote is already saved by then; the
 * page only shows it.
 */
export function ChatView({
  conversation,
  messages: initial,
  files: initialFiles,
  roles,
  tasks,
  modelConfigured,
  pii,
}: {
  conversation: Conversation | null;
  messages: ChatLine[];
  files: ChatFile[];
  roles: RoleOption[];
  tasks: TaskOption[];
  modelConfigured: boolean;
  pii: PiiConfig;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState(conversation?.title ?? "");
  const [lines, setLines] = useState<ChatLine[]>(initial);
  const [files, setFiles] = useState<ChatFile[]>(initialFiles);
  const { pendingFiles, setPendingFiles, uploading, pickFiles, removeFile } = usePendingFiles(
    conversation?.id ?? null,
  );
  const [writing, setWriting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [roleId, setRoleId] = useState<string | null>(conversation?.roleId ?? null);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  // The filter: off for this conversation is a choice the person makes
  // here and now, and it lasts as long as the page does.
  const [piiOff, setPiiOff] = useState(false);
  const [piiApproved, setPiiApproved] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const piiActive = pii.enabled && !piiOff;
  const piiResult: ScanResult | null =
    piiActive && draft.trim()
      ? scan(draft, { disabled: pii.disabled, extraWords: pii.extraWords })
      : null;
  const piiBlocks =
    piiResult !== null &&
    (piiResult.findings.length > 0 || (pii.blockOnHint && piiResult.hints.length > 0));

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines.length, writing]);

  const last = lines[lines.length - 1];
  const canContinue = Boolean(
    conversation && last?.role === "assistant" && last.truncated && !busy,
  );

  async function send(continueLast = false, approved = piiApproved) {
    const message = draft.trim();
    if (busy) return;
    if (!continueLast && !message && pendingFiles.length === 0) return;
    // The filter runs here, on the person's own machine, before a byte
    // leaves it. A blocked line stays in the field with the notice above.
    if (!continueLast && piiBlocks && !approved) return;
    setPiiApproved(false);
    setBusy(true);
    setFailure(null);
    setWriting("");
    const sent = pendingFiles;
    const body = {
      conversationId: conversation?.id,
      message: continueLast ? "" : message,
      fileIds: continueLast ? [] : sent.map((f) => f.id),
      roleId: conversation ? undefined : roleId,
      continue: continueLast,
    };
    if (!continueLast) {
      setDraft("");
      setPendingFiles([]);
    }

    let conversationId = conversation?.id ?? null;
    let firstExchange = lines.length === 0;
    let text = "";
    let finished = false;
    try {
      const response = await fetch(`/api/chat?locale=${encodeURIComponent(locale)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!response.ok || !response.body) {
        const answer = (await response.json().catch(() => null)) as { error?: ChatFailure } | null;
        setFailure(answer?.error ?? "generic");
        setWriting(null);
        setBusy(false);
        if (!continueLast) {
          setDraft(message);
          setPendingFiles(sent);
        }
        return;
      }
      const handle = (event: ChatStreamEvent) => {
        if (event.type === "meta") {
          conversationId = event.conversationId;
          if (event.userMessageId) {
            const id = event.userMessageId;
            setLines((was) => [
              ...was,
              { id, role: "user", content: message, truncated: false, engine: "" },
            ]);
            setFiles((was) => [...was, ...sent.map((f) => ({ ...f, messageId: id }))]);
          }
        } else if (event.type === "delta") {
          text += event.text;
          setWriting(text);
        } else if (event.type === "done") {
          finished = true;
          setLines((was) => [
            ...was,
            {
              id: event.assistantMessageId,
              role: "assistant",
              content: text,
              truncated: event.finish === "length",
              engine: event.engine,
            },
          ]);
          setWriting(null);
        } else if (event.type === "error") {
          setFailure(event.error);
        }
      };
      await readChatStream(response.body, handle);
    } catch {
      setFailure("generic");
    }
    if (!finished) setWriting(null);
    setBusy(false);

    if (finished && conversationId) {
      if (firstExchange && !title) {
        firstExchange = false;
        const named = await askAi<{ title: string }>("title", { conversationId }, { locale });
        if (named.ok) setTitle(named.proposal.title);
      }
      if (!conversation) router.replace(`/chat/${conversationId}`);
      else router.refresh();
    }
  }

  async function chooseRole(next: string | null) {
    setRoleId(next);
    if (!conversation) return;
    const result = await setConversationRoleAction({
      conversationId: conversation.id,
      roleId: next,
    });
    if (!result.ok) toast.error(t("failed.generic"));
  }

  function focusDraft(select?: { start: number; end: number }) {
    const field = document.querySelector<HTMLTextAreaElement>("textarea[data-slot=textarea]");
    field?.focus();
    if (field && select) field.setSelectionRange(select.start, select.end);
  }

  function applyTask(task: TaskOption) {
    setDraft((was) => (was.trim() ? `${task.prompt}${was}` : task.prompt));
    if (task.roleId) void chooseRole(task.roleId);
    focusDraft();
  }

  const filesFor = (messageId: string) => files.filter((f) => f.messageId === messageId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {conversation ? (
        <header className="border-border flex items-center gap-2 border-b px-4 py-2 sm:px-6">
          <ConversationTitle
            conversationId={conversation.id}
            title={title}
            onRenamed={(next) => {
              setTitle(next);
              router.refresh();
            }}
          />
          {lines.length > 0 ? (
            <DocumentButtons conversationId={conversation.id} disabled={!modelConfigured || busy} />
          ) : null}
        </header>
      ) : null}
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          {lines.length === 0 && writing === null ? (
            <ChatEmpty tasks={tasks} modelConfigured={modelConfigured} onTask={applyTask} />
          ) : null}
          {lines.map((line) => (
            <MessageItem
              key={line.id}
              line={line}
              files={line.role === "user" ? filesFor(line.id) : undefined}
              noTextLabel={t("composer.files.noText")}
            />
          ))}
          {writing !== null ? (
            writing === "" ? (
              <p className="text-meta text-2sm">{t("thinking")}</p>
            ) : (
              <MessageItem
                line={{ id: "writing", role: "assistant", content: writing }}
                writing
                noTextLabel={t("composer.files.noText")}
              />
            )
          ) : null}
          {failure ? (
            <p role="alert" className="text-destructive text-2sm">
              {t(`failed.${failure}`)}
            </p>
          ) : null}
          {canContinue ? (
            <div className="flex items-center gap-3">
              <p className="text-meta text-2sm">{t("truncated")}</p>
              <Button type="button" size="xs" variant="outline" onClick={() => void send(true)}>
                {t("continue")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <PiiBar
        result={piiResult}
        blocking={piiBlocks}
        enabled={pii.enabled}
        off={piiOff}
        onEdit={() => {
          const first = piiResult?.findings[0];
          focusDraft(first ? { start: first.start, end: first.end } : undefined);
        }}
        onSendAnyway={() => {
          setPiiApproved(true);
          void send(false, true);
        }}
        onDisable={() => {
          setPiiOff(true);
          focusDraft();
        }}
        onEnable={() => setPiiOff(false)}
      />
      <Composer
        draft={draft}
        onDraft={setDraft}
        roleId={roleId}
        onRole={(next) => void chooseRole(next)}
        roles={roles}
        tasks={tasks}
        onTask={applyTask}
        pendingFiles={pendingFiles}
        onPickFiles={(list) => void pickFiles(list)}
        onRemoveFile={(id) => void removeFile(id)}
        uploading={uploading}
        busy={busy}
        modelConfigured={modelConfigured}
        onSend={() => void send(false)}
      />
    </div>
  );
}
