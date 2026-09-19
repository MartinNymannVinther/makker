"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { askAi } from "@/modules/ai/read-client";
import { discardFileAction, setConversationRoleAction } from "@/modules/chat/actions";
import { decodeEvents, type ChatFailure, type ChatStreamEvent } from "@/modules/chat/wire";
import { Composer, type RoleOption, type TaskOption } from "./composer";
import { ConversationTitle } from "./conversation-title";
import { MessageItem, type ChatFile, type ChatLine } from "./message-item";

type Conversation = { id: string; title: string; roleId: string | null };

type UploadAnswer = {
  ok: boolean;
  results?: Array<
    | { name: string; ok: true; file: { id: string; name: string; size: number; hasText: boolean } }
    | { name: string; ok: false; reason: "tooBig" | "unsupported" | "empty" }
  >;
};

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
}: {
  conversation: Conversation | null;
  messages: ChatLine[];
  files: ChatFile[];
  roles: RoleOption[];
  tasks: TaskOption[];
  modelConfigured: boolean;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState(conversation?.title ?? "");
  const [lines, setLines] = useState<ChatLine[]>(initial);
  const [files, setFiles] = useState<ChatFile[]>(initialFiles);
  const [pendingFiles, setPendingFiles] = useState<ChatFile[]>([]);
  const [writing, setWriting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState("");
  const [roleId, setRoleId] = useState<string | null>(conversation?.roleId ?? null);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines.length, writing]);

  const last = lines[lines.length - 1];
  const canContinue = Boolean(
    conversation && last?.role === "assistant" && last.truncated && !busy,
  );

  async function send(continueLast = false) {
    const message = draft.trim();
    if (busy) return;
    if (!continueLast && !message && pendingFiles.length === 0) return;
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
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rest = "";
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
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        rest += decoder.decode(value, { stream: true });
        const decoded = decodeEvents(rest);
        rest = decoded.rest;
        decoded.events.forEach(handle);
      }
      const tail = decodeEvents(rest + "\n\n");
      tail.events.forEach(handle);
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

  async function pickFiles(list: FileList) {
    setUploading(true);
    const form = new FormData();
    if (conversation) form.set("conversationId", conversation.id);
    for (const file of Array.from(list)) form.append("files", file);
    try {
      const response = await fetch("/api/files", { method: "POST", body: form });
      const answer = (await response.json()) as UploadAnswer;
      if (!response.ok || !answer.ok || !answer.results) {
        toast.error(t("composer.files.failed"));
        return;
      }
      const accepted: ChatFile[] = [];
      for (const result of answer.results) {
        if (result.ok) accepted.push({ ...result.file, messageId: null });
        else toast.error(`${result.name}: ${t(`composer.files.reasons.${result.reason}`)}`);
      }
      setPendingFiles((was) => [...was, ...accepted]);
    } catch {
      toast.error(t("composer.files.failed"));
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(fileId: string) {
    setPendingFiles((was) => was.filter((f) => f.id !== fileId));
    await discardFileAction({ fileId });
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

  function applyTask(task: TaskOption) {
    setDraft((was) => (was.trim() ? `${task.prompt}${was}` : task.prompt));
    if (task.roleId) void chooseRole(task.roleId);
    document.querySelector<HTMLTextAreaElement>("textarea[data-slot=textarea]")?.focus();
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
        </header>
      ) : null}
      <div
        ref={scroller}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          {lines.length === 0 && writing === null ? (
            <div className="my-auto flex flex-col gap-2 py-10">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t("empty.title")}</h1>
              <p className="text-muted-foreground max-w-prose text-reading leading-relaxed text-pretty">
                {modelConfigured ? t("empty.hint") : t("composer.noModel")}
              </p>
              {tasks.length > 0 && modelConfigured ? (
                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-meta text-2sm font-medium">{t("empty.tasks")}</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {tasks.slice(0, 6).map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => applyTask(task)}
                          className="border-border bg-card hover:bg-muted flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors"
                        >
                          <span className="text-2sm font-medium">{task.name}</span>
                          <span className="text-meta text-xs">{task.description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
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
