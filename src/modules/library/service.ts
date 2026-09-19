import { asc, eq } from "drizzle-orm";
import { roles, tasks, workspaceSettings } from "@/core/db/schema";
import type { RoleRow, TaskRow, WorkspaceSettingsRow } from "@/core/db/schema";
import { withOrgContext, type AppTransaction, type OrgContext } from "@/core/db/tenant";
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
