import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createConversation, getConversation } from "@/modules/chat/service";
import { DEFAULT_ROLES, DEFAULT_TASKS } from "@/modules/library/defaults";
import {
  canEditLibrary,
  deleteRole,
  deleteTask,
  getWorkspaceSettings,
  listRoles,
  listTasks,
  resetLibrary,
  saveRole,
  saveTask,
  updateWorkspaceSettings,
} from "@/modules/library/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * Who may change the library and what happens when they do (docs/adr/0012):
 * owners and admins write, members are refused in the service, a role
 * that goes leaves its tasks and conversations standing, and the reset
 * puts the defaults back.
 */

let admin: Pool;
let owner: { orgId: string; userId: string };
let member: { orgId: string; userId: string };
let manager: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  owner = await seedWorkspace(admin, "libedit_owner");
  member = await seedMember(admin, owner.orgId, "libedit_member");
  manager = await seedMember(admin, owner.orgId, "libedit_admin", "admin");
});

afterAll(async () => {
  await admin.end();
});

describe("editing the library", () => {
  it("is for owners and admins, and the service is where it is decided", async () => {
    expect(await canEditLibrary(owner)).toBe(true);
    expect(await canEditLibrary(manager)).toBe(true);
    expect(await canEditLibrary(member)).toBe(false);
    expect(await updateWorkspaceSettings(member, { systemPrompt: "Mit." })).toBe("forbidden");
    expect(await saveRole(member, { key: "x", name: "X", description: "", instruction: "" })).toBe(
      "forbidden",
    );
    expect(await resetLibrary(member)).toBe("forbidden");
    expect((await getWorkspaceSettings(member)).systemPrompt).not.toBe("Mit.");
  });

  it("changes the prompt and the ceiling, as an admin too", async () => {
    const saved = await updateWorkspaceSettings(manager, {
      systemPrompt: "Svar på engelsk.",
      maxTokens: 1024,
    });
    expect(typeof saved).not.toBe("string");
    const settings = await getWorkspaceSettings(member);
    expect([settings.systemPrompt, settings.maxTokens]).toEqual(["Svar på engelsk.", 1024]);
  });

  it("adds a role last, refuses a second with the same key, and edits in place", async () => {
    const added = await saveRole(owner, {
      key: "jurist",
      name: "Jurist",
      description: "Læser som en advokat.",
      instruction: "Vær forsigtig.",
    });
    expect(typeof added).not.toBe("string");
    const roles = await listRoles(owner);
    expect(roles[roles.length - 1]?.key).toBe("jurist");
    await expect(
      saveRole(owner, { key: "jurist", name: "Igen", description: "", instruction: "" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    if (typeof added === "string") return;
    const edited = await saveRole(owner, { ...added, name: "Husjurist" });
    expect(typeof edited !== "string" && edited.name).toBe("Husjurist");
    expect(typeof edited !== "string" && edited.sort).toBe(added.sort);
  });

  it("saves a task with a role of the workspace, and without one from elsewhere", async () => {
    const [role] = await listRoles(owner);
    const withRole = await saveTask(owner, {
      groupName: "Test",
      name: "Med rolle",
      description: "",
      prompt: "Gør noget:\n\n",
      roleId: role!.id,
    });
    expect(typeof withRole !== "string" && withRole.roleId).toBe(role!.id);
    const without = await saveTask(owner, {
      groupName: "Test",
      name: "Uden",
      description: "",
      prompt: "x",
      roleId: "role_elsewhere",
    });
    expect(typeof without !== "string" && without.roleId).toBeNull();
    if (typeof withRole !== "string") expect(await deleteTask(owner, withRole.id)).toBe(true);
    expect(await deleteTask(owner, "task_nowhere")).toBe("notFound");
  });

  it("lets a role go and leaves its tasks and conversations standing", async () => {
    const roles = await listRoles(owner);
    const sprog = roles.find((r) => r.key === "sprog")!;
    const conversation = await createConversation(owner, { roleId: sprog.id });
    const taskBefore = (await listTasks(owner)).find((t) => t.roleId === sprog.id);
    expect(taskBefore).toBeDefined();
    expect(await deleteRole(owner, sprog.id)).toBe(true);
    const taskAfter = (await listTasks(owner)).find((t) => t.id === taskBefore!.id);
    expect(taskAfter?.roleId).toBeNull();
    const view = await getConversation(owner, conversation.id);
    expect(view?.conversation.roleId).toBeNull();
  });

  it("puts the defaults back on reset", async () => {
    expect(await resetLibrary(owner)).toBe(true);
    expect((await listRoles(owner)).map((r) => r.key)).toEqual(DEFAULT_ROLES.map((r) => r.key));
    expect((await listTasks(owner)).map((t) => t.name)).toEqual(DEFAULT_TASKS.map((t) => t.name));
    expect((await getWorkspaceSettings(owner)).maxTokens).toBe(4096);
  });
});
