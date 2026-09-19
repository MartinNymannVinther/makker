import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { LlmError } from "@/core/llm";
import { routing } from "@/i18n/routing";
import { RateLimited } from "@/modules/ai/limits";
import { classifyAiError, NoModel, streamAnswer } from "@/modules/ai/service";
import { MAX_MESSAGE_CHARS } from "@/modules/ai/wire";
import { buildPrompt } from "@/modules/chat/prompt";
import {
  appendMessage,
  createConversation,
  getConversation,
  readAttachmentTexts,
} from "@/modules/chat/service";
import { encodeEvent, MAX_FILES_PER_MESSAGE, type ChatStreamEvent } from "@/modules/chat/wire";
import { attachFiles } from "@/modules/files/service";
import { findRole, getWorkspaceSettings } from "@/modules/library/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One line in, the answer out as it is written (docs/adr/0011).
 *
 * The person's line is saved before the model is asked, so a model that
 * never answers still leaves the question in the conversation. The
 * answer is saved when the model stops — whole, or with what got through
 * and a mark that it was cut — and saved whether or not the browser is
 * still listening: a tab closed mid-answer is not a reason to lose the
 * answer. Errors after the first byte cannot become an HTTP status, so
 * they travel as an event on the same stream.
 */
const Body = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  message: z.string().max(MAX_MESSAGE_CHARS).default(""),
  fileIds: z.array(z.string().min(1).max(64)).max(MAX_FILES_PER_MESSAGE).default([]),
  roleId: z.string().min(1).max(64).nullable().optional(),
  /** Ask the model to go on from where its last line stopped, rather than sending a new line. */
  continue: z.boolean().default(false),
});

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function refuse(error: "unauthorized" | "invalid" | "notFound", status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const ctx = await requireOrgContext();
  if (!ctx) return refuse("unauthorized", 401);
  if (crossSite(request)) return refuse("unauthorized", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid", 400);
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return refuse("invalid", 400);
  const input = parsed.data;
  const message = input.message.replace(/\r\n/g, "\n").trim();
  if (!input.continue && message === "" && input.fileIds.length === 0)
    return refuse("invalid", 400);
  if (input.continue && !input.conversationId) return refuse("invalid", 400);
  const locale = localeOf(request);

  // The conversation: the one named, as the caller, or a new one.
  const existing = input.conversationId ? await getConversation(ctx, input.conversationId) : null;
  if (input.conversationId && !existing) return refuse("notFound", 404);
  const conversation =
    existing?.conversation ?? (await createConversation(ctx, { roleId: input.roleId ?? null }));

  let userMessageId: string | null = null;
  if (!input.continue) {
    const saved = await appendMessage(ctx, conversation.id, { role: "user", content: message });
    if (!saved) return refuse("notFound", 404);
    userMessageId = saved.id;
    await attachFiles(ctx, input.fileIds, conversation.id, saved.id);
  }

  // Everything the model reads, as it stands now that the line is in.
  const [view, settings, role, attachments] = await Promise.all([
    getConversation(ctx, conversation.id),
    getWorkspaceSettings(ctx),
    findRole(ctx, conversation.roleId),
    readAttachmentTexts(ctx, conversation.id),
  ]);
  if (!view) return refuse("notFound", 404);
  const prompt = buildPrompt({
    systemPrompt: settings.systemPrompt,
    roleInstruction: role?.instruction ?? "",
    lines: view.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    attachments,
    continueLast: input.continue,
    locale,
  });

  const meta: ChatStreamEvent = { type: "meta", conversationId: conversation.id, userMessageId };

  let answer: Awaited<ReturnType<typeof streamAnswer>>;
  try {
    answer = await streamAnswer(ctx, "chat", prompt, { maxTokens: settings.maxTokens });
  } catch (error) {
    const failure =
      error instanceof NoModel
        ? "noModel"
        : error instanceof RateLimited
          ? "rateLimited"
          : classifyAiError(error);
    return new Response(encodeEvent(meta) + encodeEvent({ type: "error", error: failure }), {
      headers: SSE_HEADERS,
    });
  }

  const encoder = new TextEncoder();
  let listening = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (!listening) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          listening = false;
        }
      };
      const close = () => {
        if (!listening) return;
        try {
          controller.close();
        } catch {
          // Already gone.
        }
      };

      (async () => {
        send(meta);
        let text = "";
        let finish: "stop" | "length" | "unknown" = "unknown";
        let tokensIn = 0;
        let tokensOut = 0;
        let failure: ChatStreamEvent | null = null;
        try {
          for await (const event of answer.events) {
            if (event.type === "delta") {
              text += event.text;
              send(event);
            } else {
              finish = event.finish;
              tokensIn = event.usage?.inputTokens ?? 0;
              tokensOut = event.usage?.outputTokens ?? 0;
            }
          }
        } catch (error) {
          failure = { type: "error", error: classifyAiError(error) };
          if (!(error instanceof LlmError)) console.error("chat: stream failed", error);
        }

        if (text.trim() === "") {
          // Nothing said is not an answer. Ollama does it while a cold
          // model loads; the person is told, and nothing is saved.
          send(failure ?? { type: "error", error: "empty" });
          close();
          return;
        }
        const saved = await appendMessage(ctx, conversation.id, {
          role: "assistant",
          content: text,
          engine: answer.engine,
          tokensIn,
          tokensOut,
          truncated: finish === "length" || failure !== null,
        });
        if (saved) {
          send({
            type: "done",
            assistantMessageId: saved.id,
            finish: failure ? "unknown" : finish,
            engine: answer.engine,
          });
        }
        if (failure) send(failure);
        close();
      })().catch((error) => {
        console.error("chat: relay failed", error);
        close();
      });
    },
    cancel() {
      // The browser left. The loop above keeps reading so the answer is
      // still saved; it just stops relaying.
      listening = false;
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function localeOf(request: Request): string {
  const asked = new URL(request.url).searchParams.get("locale");
  return (routing.locales as readonly string[]).includes(asked ?? "")
    ? (asked as string)
    : routing.defaultLocale;
}
