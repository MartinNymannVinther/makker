import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { DEFAULT_ROLES, DEFAULT_TASKS } from "@/modules/library/defaults";
import {
  ensureLibrary,
  findRole,
  getWorkspaceSettings,
  listRoles,
  listTasks,
} from "@/modules/library/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * A workspace opens with the POC's defaults, once. The first read seeds
 * them, the second finds them, a colleague sees the same rows, and a
 * role from another workspace is no role here.
 */

let admin: Pool;
let a: { orgId: string; userId: string };
let colleague: { orgId: string; userId: string };
let b: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  a = await seedWorkspace(admin, "lib_a");
  colleague = await seedMember(admin, a.orgId, "lib_a2");
  b = await seedWorkspace(admin, "lib_b");
});

afterAll(async () => {
  await admin.end();
});

describe("the library", () => {
  it("is seeded on the first read and never again", async () => {
    expect(await ensureLibrary(a)).toBe(true);
    expect(await ensureLibrary(a)).toBe(false);
    const roles = await listRoles(a);
    expect(roles.map((r) => r.key)).toEqual(DEFAULT_ROLES.map((r) => r.key));
    const tasks = await listTasks(a);
    expect(tasks.map((t) => t.name)).toEqual(DEFAULT_TASKS.map((t) => t.name));
    // The task that switches role points at the role of that key.
    const sprog = roles.find((r) => r.key === "sprog")!;
    expect(tasks.find((t) => t.name === "Ret sproget igennem")?.roleId).toBe(sprog.id);
  });

  it("seeds through the settings read too, and holds the POC's prompt", async () => {
    const settings = await getWorkspaceSettings(b);
    expect(settings.systemPrompt).toContain("dansk");
    expect(settings.maxTokens).toBe(4096);
    expect((await listRoles(b)).length).toBe(DEFAULT_ROLES.length);
  });

  it("is the workspace's, so a colleague reads the same rows", async () => {
    const mine = await listRoles(a);
    const theirs = await listRoles(colleague);
    expect(theirs.map((r) => r.id)).toEqual(mine.map((r) => r.id));
  });

  it("does not find another workspace's role", async () => {
    const [roleOfB] = await listRoles(b);
    expect(await findRole(a, roleOfB!.id)).toBeNull();
    expect(await findRole(b, roleOfB!.id)).not.toBeNull();
    expect(await findRole(a, null)).toBeNull();
  });
});
