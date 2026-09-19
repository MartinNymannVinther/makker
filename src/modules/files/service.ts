import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { files } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import { ACCEPTED_MIMES, extractText } from "./extract";

/**
 * Files in the database, never on disk: the bytes, the name, and the text
 * pulled out at upload. Every read and write runs in the workspace
 * context, and the policy on the table narrows it to the person's own;
 * the bytes are selected by name where they are needed and nowhere else.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;

export type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  hasText: boolean;
  extractError: string | null;
  createdAt: Date;
};

export type UploadResult =
  { ok: true; file: StoredFile } | { ok: false; reason: "tooBig" | "unsupported" | "empty" };

export async function storeFile(
  ctx: OrgContext,
  conversationId: string | null,
  input: { name: string; mime: string; bytes: Buffer },
): Promise<UploadResult> {
  if (input.bytes.length === 0) return { ok: false, reason: "empty" };
  if (input.bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "tooBig" };
  if (!ACCEPTED_MIMES.has(input.mime)) return { ok: false, reason: "unsupported" };
  const name = input.name.trim().slice(0, 255) || "fil";
  const extracted = await extractText(input.mime, input.bytes);
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .insert(files)
      .values({
        orgId: ctx.orgId,
        userId: ctx.userId,
        conversationId,
        name,
        mime: input.mime,
        size: input.bytes.length,
        bytes: input.bytes,
        text: "text" in extracted ? extracted.text : null,
        extractError: "error" in extracted ? extracted.error : null,
      })
      .returning({ id: files.id, createdAt: files.createdAt }),
  );
  return {
    ok: true,
    file: {
      id: row!.id,
      name,
      mime: input.mime,
      size: input.bytes.length,
      hasText: "text" in extracted,
      extractError: "error" in extracted ? extracted.error : null,
      createdAt: row!.createdAt,
    },
  };
}

/** What the model reads: the text, or why there is none. */
export async function readFileText(
  ctx: OrgContext,
  fileId: string,
): Promise<{ name: string; text: string } | { name: string; error: string }> {
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .select({ name: files.name, text: files.text, extractError: files.extractError })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1),
  );
  if (!row) return { name: "", error: "the file is not yours" };
  if (row.text === null) return { name: row.name, error: row.extractError ?? "no text" };
  return { name: row.name, text: row.text };
}

/** The files attached in a conversation, newest first, without their bytes. */
export async function listFiles(ctx: OrgContext, conversationId: string): Promise<StoredFile[]> {
  return withOrgContext(ctx, (tx) =>
    tx
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        hasText: sql<boolean>`${files.text} is not null`,
        extractError: files.extractError,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(eq(files.conversationId, conversationId))
      .orderBy(desc(files.createdAt)),
  );
}

/**
 * Ties freshly uploaded files to the message that carries them. Only
 * files that are the person's, not yet sent, and either loose or already
 * in this conversation; anything else is left alone, and the count says
 * how many were claimed.
 */
export async function attachFiles(
  ctx: OrgContext,
  fileIds: string[],
  conversationId: string,
  messageId: string,
): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await withOrgContext(ctx, (tx) =>
    tx
      .update(files)
      .set({ conversationId, messageId })
      .where(
        and(
          inArray(files.id, [...new Set(fileIds)]),
          isNull(files.messageId),
          sql`(${files.conversationId} is null or ${files.conversationId} = ${conversationId})`,
        ),
      )
      .returning({ id: files.id }),
  );
  return rows.length;
}

export async function deleteFile(ctx: OrgContext, fileId: string): Promise<boolean> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx.delete(files).where(eq(files.id, fileId)).returning({ id: files.id }),
  );
  return rows.length > 0;
}
