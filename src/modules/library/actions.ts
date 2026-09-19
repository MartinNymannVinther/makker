"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/core/auth/guard";
import { fail, ok, type ActionError, type Result } from "@/core/result";
import type { RoleRow, TaskRow, WorkspaceSettingsRow } from "@/core/db/schema";
import {
  deleteRole,
  deleteTask,
  resetLibrary,
  saveRole,
  saveTask,
  updateWorkspaceSettings,
  type LibraryError,
} from "./service";

/**
 * The library's server actions: what an owner or admin changes under
 * Settings → Library. Every action resolves the caller first and
 * validates at the boundary; the service decides who may write.
 */

const PATH = "/settings/library";
const Id = z.string().min(1).max(64);

/** A role's handle: short, lower-case, no spaces, the way the tasks name it. */
const Key = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const SettingsInput = z.object({
  systemPrompt: z.string().max(8_000),
  maxTokens: z.coerce.number().int().min(256).max(32_000),
});

export const PiiInput = z.object({
  piiEnabled: z.boolean(),
  piiDisabled: z.array(z.string().min(1).max(20)).max(20),
  piiExtraWords: z.record(
    z.string().min(1).max(20),
    z.array(z.string().trim().min(1).max(40)).max(50),
  ),
  piiBlockOnHint: z.boolean(),
});

export const RoleInput = z.object({
  id: Id.nullable().optional(),
  key: Key,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(""),
  instruction: z.string().max(4_000).default(""),
});

export const TaskInput = z.object({
  id: Id.nullable().optional(),
  groupName: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(""),
  prompt: z.string().min(1).max(4_000),
  roleId: Id.nullable().default(null),
});

function refusal(error: LibraryError): ActionError {
  return error === "forbidden" ? "forbidden" : error === "notFound" ? "notFound" : "invalid";
}

export async function saveSettingsAction(raw: unknown): Promise<Result<WorkspaceSettingsRow>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = SettingsInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await updateWorkspaceSettings(ctx, parsed.data);
  if (typeof result === "string") return fail(refusal(result));
  revalidatePath(PATH);
  return ok(result);
}

export async function savePiiAction(raw: unknown): Promise<Result<WorkspaceSettingsRow>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = PiiInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await updateWorkspaceSettings(ctx, parsed.data);
  if (typeof result === "string") return fail(refusal(result));
  revalidatePath(PATH);
  revalidatePath("/chat");
  return ok(result);
}

export async function saveRoleAction(raw: unknown): Promise<Result<RoleRow>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = RoleInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  try {
    const result = await saveRole(ctx, parsed.data);
    if (typeof result === "string") return fail(refusal(result));
    revalidatePath(PATH);
    return ok(result);
  } catch (error) {
    // Two roles with one key: the unique index says no, and the form says which field.
    if ((error as { cause?: { code?: string } }).cause?.code === "23505")
      return fail("conflict", "key");
    console.error("library: saving role failed", error);
    return fail("generic");
  }
}

export async function deleteRoleAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ roleId: Id }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await deleteRole(ctx, parsed.data.roleId);
  if (result !== true) return fail(refusal(result));
  revalidatePath(PATH);
  return ok(true);
}

export async function saveTaskAction(raw: unknown): Promise<Result<TaskRow>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = TaskInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await saveTask(ctx, parsed.data);
  if (typeof result === "string") return fail(refusal(result));
  revalidatePath(PATH);
  return ok(result);
}

export async function deleteTaskAction(raw: unknown): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const parsed = z.object({ taskId: Id }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const result = await deleteTask(ctx, parsed.data.taskId);
  if (result !== true) return fail(refusal(result));
  revalidatePath(PATH);
  return ok(true);
}

export async function resetLibraryAction(): Promise<Result<boolean>> {
  const ctx = await requireOrgContext();
  if (!ctx) return fail("unauthorized");
  const result = await resetLibrary(ctx);
  if (result !== true) return fail(refusal(result));
  revalidatePath(PATH);
  revalidatePath("/chat");
  return ok(true);
}
