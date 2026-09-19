import type { OrgContext } from "@/core/db/tenant";
import { askForJson } from "@/modules/ai/service";
import { buildPrompt } from "@/modules/chat/prompt";
import { getConversation, readAttachmentTexts } from "@/modules/chat/service";
import { findRole, getWorkspaceSettings } from "@/modules/library/service";
import { buildDocx } from "./docx";
import { buildPptx } from "./pptx";
import {
  DECK_INSTRUCTION,
  documentFileName,
  MEMO_INSTRUCTION,
  sanitizeDeck,
  sanitizeMemo,
} from "./schema";

/**
 * Conversation in, document out — Word or PowerPoint. Two sharply
 * separated steps, and that is the whole point:
 *
 *   1. The model delivers CONTENT as JSON. It never sees an Office file.
 *   2. The template layer pours the content into Haij's template. The
 *      form is ours, not the model's, so every document looks the same.
 *
 * The difference between the two formats is which instruction is asked
 * and which builder is called.
 */

export type DocumentFormat = "docx" | "pptx";

export const MIME: Record<DocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export type BuiltDocument = { bytes: Buffer; filename: string; mime: string; engine: string };

export async function buildDocument(
  ctx: OrgContext,
  conversationId: string,
  format: DocumentFormat,
  locale: string,
): Promise<BuiltDocument | null> {
  const view = await getConversation(ctx, conversationId);
  if (!view || view.messages.length === 0) return null;
  const language = locale === "en" ? "en" : "da";
  const [settings, role, attachments] = await Promise.all([
    getWorkspaceSettings(ctx),
    findRole(ctx, view.conversation.roleId),
    readAttachmentTexts(ctx, conversationId),
  ]);

  // The conversation as the model saw it, with the instruction last.
  const prompt = buildPrompt({
    systemPrompt: settings.systemPrompt,
    roleInstruction: role?.instruction ?? "",
    lines: view.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    attachments,
    locale: language,
  });
  const instruction = format === "docx" ? MEMO_INSTRUCTION : DECK_INSTRUCTION;
  prompt.push({ role: "user", content: instruction[language] });

  const { data, engine } = await askForJson(ctx, "document", prompt, { maxTokens: 4096 });
  const fallback = view.conversation.title || (language === "en" ? "Document" : "Dokument");

  if (format === "docx") {
    const memo = sanitizeMemo(data, fallback);
    return {
      bytes: await buildDocx(memo, language),
      filename: documentFileName(memo.title, "docx"),
      mime: MIME.docx,
      engine,
    };
  }
  const deck = sanitizeDeck(data, fallback);
  return {
    bytes: await buildPptx(deck, language),
    filename: documentFileName(deck.title, "pptx"),
    mime: MIME.pptx,
    engine,
  };
}
