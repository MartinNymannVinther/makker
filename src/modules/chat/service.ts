import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { conversations, files, messages } from "@/core/db/schema";
import type { ConversationRow, MessageRow } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { findRole } from "@/modules/library/service";
import type { StoredFile } from "@/modules/files/service";

/**
 * Conversations and their lines. Every read and write runs in the
 * workspace context, and the policy on the tables narrows it to the
 * person's own (docs/adr/0010): a colleague's id, handed to any function
 * here, finds nothing.
 */

export type ConversationSummary = {
  id: string;
  title: string;
  roleId: string | null;
  updatedAt: Date;
};

export type AttachedFile = StoredFile & { messageId: string | null };

export type ConversationView = {
  conversation: ConversationRow;
  messages: MessageRow[];
  files: AttachedFile[];
};

export async function listConversations(ctx: OrgContext): Promise<ConversationSummary[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: conversations.id,
        title: conversations.title,
        roleId: conversations.roleId,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(and(eq(conversations.userId, ctx.userId), isNull(conversations.archivedAt)))
      .orderBy(desc(conversations.updatedAt)),
  );
}

export async function createConversation(
  ctx: OrgContext,
  input: { title?: string; roleId?: string | null } = {},
): Promise<ConversationRow> {
  // A role from another workspace, or one that no longer exists, is no
  // role: the conversation opens without one rather than failing.
  const role = await findRole(ctx, input.roleId ?? null);
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .insert(conversations)
      .values({
        orgId: ctx.orgId,
        userId: ctx.userId,
        title: (input.title ?? "").trim().slice(0, 120),
        roleId: role?.id ?? null,
      })
      .returning(),
  );
  return row!;
}

export async function getConversation(
  ctx: OrgContext,
  conversationId: string,
): Promise<ConversationView | null> {
  return withOrgContext(ctx, async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) return null;
    const lines = await tx
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    const attached = await tx
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        text: files.text,
        extractError: files.extractError,
        createdAt: files.createdAt,
        messageId: files.messageId,
      })
      .from(files)
      .where(eq(files.conversationId, conversationId))
      .orderBy(asc(files.createdAt));
    return {
      conversation,
      messages: lines,
      files: attached.map(({ text, ...file }) => ({ ...file, hasText: text !== null })),
    };
  });
}

/** The text of every file sent with a message, for the prompt; nothing else about the files. */
export async function readAttachmentTexts(
  ctx: OrgContext,
  conversationId: string,
): Promise<Array<{ messageId: string; name: string; text: string | null; error: string | null }>> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .select({
        messageId: files.messageId,
        name: files.name,
        text: files.text,
        error: files.extractError,
      })
      .from(files)
      .where(eq(files.conversationId, conversationId))
      .orderBy(asc(files.createdAt)),
  );
  return rows.flatMap((row) => (row.messageId ? [{ ...row, messageId: row.messageId }] : []));
}

export async function renameConversation(
  ctx: OrgContext,
  conversationId: string,
  title: string,
): Promise<boolean> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .update(conversations)
      .set({ title: title.trim().slice(0, 120) })
      .where(eq(conversations.id, conversationId))
      .returning({ id: conversations.id }),
  );
  return rows.length > 0;
}

export async function setConversationRole(
  ctx: OrgContext,
  conversationId: string,
  roleId: string | null,
): Promise<boolean> {
  const role = await findRole(ctx, roleId);
  if (roleId && !role) return false;
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .update(conversations)
      .set({ roleId: role?.id ?? null })
      .where(eq(conversations.id, conversationId))
      .returning({ id: conversations.id }),
  );
  return rows.length > 0;
}

export async function deleteConversation(
  ctx: OrgContext,
  conversationId: string,
): Promise<boolean> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .delete(conversations)
      .where(eq(conversations.id, conversationId))
      .returning({ id: conversations.id }),
  );
  return rows.length > 0;
}

export type NewMessage = {
  role: "user" | "assistant";
  content: string;
  engine?: string;
  tokensIn?: number;
  tokensOut?: number;
  truncated?: boolean;
};

/**
 * One line more, and the conversation moves to the top of the list. The
 * conversation is read first, as the caller: the policy on messages
 * (drizzle/0004) refuses a line into somebody else's conversation, and
 * this makes that refusal a null rather than an exception.
 */
export async function appendMessage(
  ctx: OrgContext,
  conversationId: string,
  input: NewMessage,
): Promise<MessageRow | null> {
  return withOrgContext(ctx, async (tx) => {
    const [own] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!own) return null;
    const [row] = await tx
      .insert(messages)
      .values({
        orgId: ctx.orgId,
        conversationId,
        userId: ctx.userId,
        role: input.role,
        content: input.content,
        engine: input.engine ?? "",
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        truncated: input.truncated ?? false,
      })
      .returning();
    if (!row) return null;
    // The database's clock, not this process's: a container's clock can
    // sit seconds from the host's, and the list is sorted by this column.
    await tx
      .update(conversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(conversations.id, conversationId));
    return row;
  });
}
