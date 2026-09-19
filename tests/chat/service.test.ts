import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  readAttachmentTexts,
  renameConversation,
  setConversationRole,
} from "@/modules/chat/service";
import { attachFiles, storeFile } from "@/modules/files/service";
import { listRoles } from "@/modules/library/service";
import { adminPool } from "../helpers/db";
import { seedMember, seedWorkspace } from "../helpers/workspace";

/**
 * A conversation is one person's (docs/adr/0010), proven through the
 * service as the application role: a colleague in the same workspace
 * lists nothing, opens nothing, renames nothing and deletes nothing.
 */

let admin: Pool;
let me: { orgId: string; userId: string };
let colleague: { orgId: string; userId: string };

beforeAll(async () => {
  admin = adminPool();
  me = await seedWorkspace(admin, "chat_me");
  colleague = await seedMember(admin, me.orgId, "chat_colleague");
});

afterAll(async () => {
  await admin.end();
});

describe("a conversation", () => {
  it("opens with a role of the workspace and none from anywhere else", async () => {
    const [role] = await listRoles(me);
    const withRole = await createConversation(me, { roleId: role!.id });
    expect(withRole.roleId).toBe(role!.id);
    const withNone = await createConversation(me, { roleId: "role_from_elsewhere" });
    expect(withNone.roleId).toBeNull();
  });

  it("moves to the top of the list with every line, and carries its files", async () => {
    const older = await createConversation(me, { title: "Ældre" });
    const newer = await createConversation(me, { title: "Nyere" });
    const line = await appendMessage(me, older.id, { role: "user", content: "Hej" });
    expect(line?.role).toBe("user");
    const list = await listConversations(me);
    expect(list.slice(0, 2).map((c) => c.id)).toEqual([older.id, newer.id]);

    const stored = await storeFile(me, null, {
      name: "notat.txt",
      mime: "text/plain",
      bytes: Buffer.from("Et notat om noget."),
    });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(await attachFiles(me, [stored.file.id], older.id, line!.id)).toBe(1);
    // A second claim finds nothing left to claim.
    expect(await attachFiles(me, [stored.file.id], older.id, line!.id)).toBe(0);

    const view = await getConversation(me, older.id);
    expect(view?.messages.map((m) => m.content)).toEqual(["Hej"]);
    expect(view?.files.map((f) => [f.name, f.messageId, f.hasText])).toEqual([
      ["notat.txt", line!.id, true],
    ]);
    expect(await readAttachmentTexts(me, older.id)).toEqual([
      { messageId: line!.id, name: "notat.txt", text: "Et notat om noget.", error: null },
    ]);
  });

  it("is invisible to a colleague in every way the service offers", async () => {
    const mine = await createConversation(me, { title: "Privat" });
    await appendMessage(me, mine.id, { role: "user", content: "Kun min" });

    expect((await listConversations(colleague)).map((c) => c.id)).not.toContain(mine.id);
    expect(await getConversation(colleague, mine.id)).toBeNull();
    expect(await renameConversation(colleague, mine.id, "Deres")).toBe(false);
    expect(await setConversationRole(colleague, mine.id, null)).toBe(false);
    expect(await appendMessage(colleague, mine.id, { role: "user", content: "x" })).toBeNull();
    expect(await deleteConversation(colleague, mine.id)).toBe(false);

    const still = await getConversation(me, mine.id);
    expect(still?.conversation.title).toBe("Privat");
    expect(still?.messages).toHaveLength(1);
  });

  it("goes whole when deleted, lines and files included", async () => {
    const gone = await createConversation(me, { title: "Væk" });
    const line = await appendMessage(me, gone.id, { role: "user", content: "Farvel" });
    const stored = await storeFile(me, gone.id, {
      name: "bilag.md",
      mime: "text/markdown",
      bytes: Buffer.from("# Bilag"),
    });
    if (stored.ok) await attachFiles(me, [stored.file.id], gone.id, line!.id);
    expect(await deleteConversation(me, gone.id)).toBe(true);
    const rows = await admin.query(
      `select (select count(*) from messages where conversation_id = $1)::int as m,
              (select count(*) from files where conversation_id = $1)::int as f`,
      [gone.id],
    );
    expect(rows.rows[0]).toEqual({ m: 0, f: 0 });
  });
});
