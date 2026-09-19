import { asc, eq, sql } from "drizzle-orm";
import { roles, tasks, workspaceSettings } from "@/core/db/schema";
import type { RoleRow, TaskRow, WorkspaceSettingsRow } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
import { currentRole } from "@/modules/export/workspace";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_ROLES,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TASKS,
} from "./defaults";

/**
 * The workspace's library: the system prompt and the filter's settings,
 * the roles, the tasks. Read by every member; written by owners and
 * admins (the actions check). A workspace that has never been asked has
 * no rows, and the first read seeds the defaults — so a fresh workspace
 * and a demo both open with something to click, and a settings page
 * always has a row to edit.
 */

async function seed(tx: AppTransaction, ctx: OrgContext): Promise<boolean> {
  // The settings row is the marker: one per workspace by constraint, so
  // two first reads at once cannot both seed — the second finds the row
  // already there and inserts nothing.
  const inserted = await tx
    .insert(workspaceSettings)
    .values({
      orgId: ctx.orgId,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxTokens: DEFAULT_MAX_TOKENS,
      updatedBy: ctx.userId,
    })
    .onConflictDoNothing({ target: workspaceSettings.orgId })
    .returning({ id: workspaceSettings.id });
  if (inserted.length === 0) return false;

  const roleRows = await tx
    .insert(roles)
    .values(DEFAULT_ROLES.map((role, sort) => ({ orgId: ctx.orgId, sort, ...role })))
    .returning({ id: roles.id, key: roles.key });
  const idByKey = new Map(roleRows.map((row) => [row.key, row.id]));
  await tx.insert(tasks).values(
    DEFAULT_TASKS.map((task, sort) => ({
      orgId: ctx.orgId,
      groupName: task.group,
      name: task.name,
      description: task.description,
      prompt: task.prompt,
      roleId: task.roleKey ? (idByKey.get(task.roleKey) ?? null) : null,
      sort,
    })),
  );
  return true;
}

/** Seeds the defaults once; true when this call was the one that did. */
export async function ensureLibrary(ctx: OrgContext): Promise<boolean> {
  return withOrgContext(ctx, (tx) => seed(tx, ctx));
}

export async function getWorkspaceSettings(ctx: OrgContext): Promise<WorkspaceSettingsRow> {
  return withOrgContext(ctx, async (tx) => {
    const read = () =>
      tx.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, ctx.orgId)).limit(1);
    let [row] = await read();
    if (!row) {
      await seed(tx, ctx);
      [row] = await read();
    }
    return row!;
  });
}

export async function listRoles(ctx: OrgContext): Promise<RoleRow[]> {
  await ensureLibrary(ctx);
  return withOrgContext(ctx, (tx) =>
    tx.select().from(roles).where(eq(roles.orgId, ctx.orgId)).orderBy(asc(roles.sort)),
  );
}

/** The role, if it is this workspace's; null for any other id. */
export async function findRole(ctx: OrgContext, roleId: string | null): Promise<RoleRow | null> {
  if (!roleId) return null;
  const [row] = await withOrgContext(ctx, (tx) =>
    tx.select().from(roles).where(eq(roles.id, roleId)).limit(1),
  );
  return row ?? null;
}

export async function listTasks(ctx: OrgContext): Promise<TaskRow[]> {
  await ensureLibrary(ctx);
  return withOrgContext(ctx, (tx) =>
    tx.select().from(tasks).where(eq(tasks.orgId, ctx.orgId)).orderBy(asc(tasks.sort)),
  );
}

/**
 * Writes. Owners and admins only: the library is what the workspace
 * says to the model on everybody's behalf, and a member who can start a
 * conversation has no business rewriting the frame around everyone
 * else's. The check is here, in the service, not in the form.
 */

export type LibraryError = "forbidden" | "notFound" | "invalid";

export async function canEditLibrary(ctx: OrgContext): Promise<boolean> {
  const role = await currentRole(ctx);
  return role === "owner" || role === "admin";
}

export type SettingsPatch = {
  systemPrompt?: string;
  maxTokens?: number;
  piiEnabled?: boolean;
  piiDisabled?: string[];
  piiExtraWords?: Record<string, string[]>;
  piiBlockOnHint?: boolean;
};

export async function updateWorkspaceSettings(
  ctx: OrgContext,
  patch: SettingsPatch,
): Promise<WorkspaceSettingsRow | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  await ensureLibrary(ctx);
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .update(workspaceSettings)
      .set({ ...patch, updatedBy: ctx.userId, updatedAt: sql`now()` })
      .where(eq(workspaceSettings.orgId, ctx.orgId))
      .returning(),
  );
  return row ?? "notFound";
}

export type RoleInput = {
  id?: string | null;
  key: string;
  name: string;
  description: string;
  instruction: string;
};

/** A role the workspace can pick; a new one lands last in the list. */
export async function saveRole(ctx: OrgContext, input: RoleInput): Promise<RoleRow | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  await ensureLibrary(ctx);
  return withOrgContext(ctx, async (tx) => {
    const values = {
      key: input.key,
      name: input.name,
      description: input.description,
      instruction: input.instruction,
    };
    if (input.id) {
      const [row] = await tx
        .update(roles)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(roles.id, input.id))
        .returning();
      return row ?? "notFound";
    }
    const [last] = await tx
      .select({ sort: sql<number>`coalesce(max(${roles.sort}), -1)` })
      .from(roles)
      .where(eq(roles.orgId, ctx.orgId));
    const [row] = await tx
      .insert(roles)
      .values({ orgId: ctx.orgId, sort: Number(last?.sort ?? -1) + 1, ...values })
      .returning();
    return row!;
  });
}

/** The role goes; the tasks and conversations that pointed at it keep going without one. */
export async function deleteRole(ctx: OrgContext, roleId: string): Promise<true | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  const rows = await withOrgContext(ctx, (tx) =>
    tx.delete(roles).where(eq(roles.id, roleId)).returning({ id: roles.id }),
  );
  return rows.length > 0 ? true : "notFound";
}

export type TaskInput = {
  id?: string | null;
  groupName: string;
  name: string;
  description: string;
  prompt: string;
  roleId: string | null;
};

export async function saveTask(ctx: OrgContext, input: TaskInput): Promise<TaskRow | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  await ensureLibrary(ctx);
  // A role from elsewhere is no role: the task is saved without one
  // rather than refused, and the form shows what was kept.
  const role = await findRole(ctx, input.roleId);
  return withOrgContext(ctx, async (tx) => {
    const values = {
      groupName: input.groupName,
      name: input.name,
      description: input.description,
      prompt: input.prompt,
      roleId: role?.id ?? null,
    };
    if (input.id) {
      const [row] = await tx
        .update(tasks)
        .set({ ...values, updatedAt: sql`now()` })
        .where(eq(tasks.id, input.id))
        .returning();
      return row ?? "notFound";
    }
    const [last] = await tx
      .select({ sort: sql<number>`coalesce(max(${tasks.sort}), -1)` })
      .from(tasks)
      .where(eq(tasks.orgId, ctx.orgId));
    const [row] = await tx
      .insert(tasks)
      .values({ orgId: ctx.orgId, sort: Number(last?.sort ?? -1) + 1, ...values })
      .returning();
    return row!;
  });
}

export async function deleteTask(ctx: OrgContext, taskId: string): Promise<true | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  const rows = await withOrgContext(ctx, (tx) =>
    tx.delete(tasks).where(eq(tasks.id, taskId)).returning({ id: tasks.id }),
  );
  return rows.length > 0 ? true : "notFound";
}

/**
 * Back to the defaults: every role and task the workspace has goes, the
 * prompt with them, and the POC's set is seeded again. Conversations
 * that pointed at a role keep going without one. The filter's own
 * settings are part of the row and go too.
 */
export async function resetLibrary(ctx: OrgContext): Promise<true | LibraryError> {
  if (!(await canEditLibrary(ctx))) return "forbidden";
  await withOrgContext(ctx, async (tx) => {
    await tx.delete(tasks).where(eq(tasks.orgId, ctx.orgId));
    await tx.delete(roles).where(eq(roles.orgId, ctx.orgId));
    await tx.delete(workspaceSettings).where(eq(workspaceSettings.orgId, ctx.orgId));
    await seed(tx, ctx);
  });
  return true;
}
