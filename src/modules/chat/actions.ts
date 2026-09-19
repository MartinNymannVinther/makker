"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type Result } from "@/core/result";
import { MAX_TITLE_CHARS } from "@/modules/ai/wire";
import { deleteFile } from "@/modules/files/service";
import { deleteConversation, renameConversation, setConversationRole } from "./service";

/**
 * The conversation's server actions: the small writes around it. The
 * lines themselves go through the streaming route (src/app/api/chat),
 * because a model's answer is not a thing to wait for in an action
 * queue (docs/adr/0008). Every action resolves the caller first; the
 * policy on the tables does the rest, so a colleague's id finds nothing.
 */

const Id = z.string().min(1).max(64);

export async function renameConversationAction(raw: unknown): Promise<Result<string>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z
    .object({ conversationId: Id, title: z.string().trim().min(1).max(MAX_TITLE_CHARS) })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await renameConversation(ctx, parsed.data.conversationId, parsed.data.title);
  if (!done) return fail("notFound");
  revalidatePath("/chat");
  return ok(parsed.data.title);
}

export async function setConversationRoleAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ conversationId: Id, roleId: Id.nullable() }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await setConversationRole(ctx, parsed.data.conversationId, parsed.data.roleId);
  return done ? ok(true) : fail("notFound");
}

export async function deleteConversationAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ conversationId: Id }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const done = await deleteConversation(ctx, parsed.data.conversationId);
  if (!done) return fail("notFound");
  revalidatePath("/chat");
  redirect("/chat");
}

/** A file uploaded and then thought better of, before it was sent with a line. */
export async function discardFileAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ fileId: Id }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  return (await deleteFile(ctx, parsed.data.fileId)) ? ok(true) : fail("notFound");
}
