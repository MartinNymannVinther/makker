import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { adminPool, appClient, asApp, expectSqlError } from "../helpers/db";

/**
 * Workspace isolation for every product table, proven as the application
 * role with raw SQL. Each table gets one row per workspace, seeded as the
 * superuser; the application role must then see exactly its own row with
 * its context, nothing without one, and be refused when writing for the
 * other workspace. New tables are added to TABLES here or the meta-test in
 * tenant-isolation fails them for missing RLS anyway.
 *
 * Three tables go further (docs/adr/0010): a conversation, its lines and
 * its files are one person's, and a colleague in the same workspace must
 * see nothing of them. That is proven below, separately, with a second
 * member of workspace A.
 */

const A = { orgId: "org_prod_a", userId: "user_prod_a" };
const B = { orgId: "org_prod_b", userId: "user_prod_b" };
/** A colleague of A's in the same workspace. */
const A2 = { orgId: "org_prod_a", userId: "user_prod_a2" };

/** Table → a row factory keyed by workspace suffix and owner. */
const TABLES: Array<{
  table: string;
  personal: boolean;
  row: (suffix: string, userId: string) => Record<string, unknown>;
}> = [
  {
    table: "conversations",
    personal: true,
    row: (s, userId) => ({ id: `conv_${s}`, user_id: userId, title: `Samtale ${s}` }),
  },
  {
    table: "messages",
    personal: true,
    row: (s, userId) => ({
      conversation_id: `conv_${s}`,
      user_id: userId,
      role: "user",
      content: `Besked ${s}`,
    }),
  },
  {
    table: "files",
    personal: true,
    row: (s, userId) => ({
      id: `file_${s}`,
      user_id: userId,
      conversation_id: `conv_${s}`,
      name: `fil-${s}.txt`,
      mime: "text/plain",
      size: 3,
      bytes: Buffer.from("abc"),
      text: "abc",
    }),
  },
  { table: "workspace_settings", personal: false, row: () => ({ system_prompt: "Svar kort." }) },
  {
    table: "roles",
    personal: false,
    row: (s) => ({ id: `role_${s}`, key: `rolle-${s}`, name: `Rolle ${s}` }),
  },
  {
    table: "tasks",
    personal: false,
    row: (s) => ({ group_name: "Skriv", name: `Opgave ${s}`, prompt: "Skriv…" }),
  },
  { table: "ai_calls", personal: false, row: () => ({ kind: "chat" }) },
  {
    table: "workspace_llm_settings",
    personal: false,
    row: (s) => ({ provider: "ollama", model: `model-${s}` }),
  },
];

let admin: Pool;
let app: Client;

async function insertAsAdmin(table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values);
  const params = columns.map((_, i) => `$${i + 1}`);
  await admin.query(
    `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${params.join(", ")})`,
    columns.map((c) => values[c]),
  );
}

beforeAll(async () => {
  admin = adminPool();
  app = await appClient();
  for (const [org, s] of [
    [A, "a"],
    [B, "b"],
  ] as const) {
    await admin.query(
      `insert into organizations (id, name, slug) values ($1, $2, $3) on conflict do nothing`,
      [org.orgId, `Prod ${s}`, `prod-${s}`],
    );
    await admin.query(
      `insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing`,
      [org.userId, `User ${s}`, `prod-${s}@example.com`],
    );
    await admin.query(
      `insert into memberships (id, organization_id, user_id, role) values ($1, $2, $3, 'owner') on conflict do nothing`,
      [`mem_prod_${s}`, org.orgId, org.userId],
    );
    for (const spec of TABLES) {
      await insertAsAdmin(spec.table, { org_id: org.orgId, ...spec.row(s, org.userId) });
    }
  }
  await admin.query(
    `insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing`,
    [A2.userId, "User a2", "prod-a2@example.com"],
  );
  await admin.query(
    `insert into memberships (id, organization_id, user_id, role) values ($1, $2, $3, 'member') on conflict do nothing`,
    ["mem_prod_a2", A2.orgId, A2.userId],
  );
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe.each(TABLES.map((spec) => spec.table))("product table %s", (table) => {
  it("shows only the active workspace's rows", async () => {
    const asA = await asApp(app, A, (c) => c.query(`select org_id from "${table}"`));
    expect(asA.rows.length).toBeGreaterThan(0);
    expect(asA.rows.every((r) => r.org_id === A.orgId)).toBe(true);

    const asB = await asApp(app, B, (c) => c.query(`select org_id from "${table}"`));
    expect(asB.rows.every((r) => r.org_id === B.orgId)).toBe(true);
  });

  it("shows nothing without a context", async () => {
    const rows = await asApp(app, null, (c) => c.query(`select 1 from "${table}"`));
    expect(rows.rows).toEqual([]);
  });

  it("refuses to update the other workspace's row", async () => {
    // An update that matches no visible row is a silent no-op under RLS,
    // which is the point: workspace B's row is invisible to A.
    const result = await asApp(app, A, (c) =>
      c.query(`update "${table}" set org_id = org_id where org_id = $1`, [B.orgId]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("refuses to insert a row for the other workspace", async () => {
    const spec = TABLES.find((t) => t.table === table)!;
    const values: Record<string, unknown> = { org_id: B.orgId, ...spec.row("x", A.userId) };
    const columns = Object.keys(values);
    const params = columns.map((_, i) => `$${i + 1}`);
    const code = await expectSqlError(
      asApp(app, A, (c) =>
        c.query(
          `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${params.join(", ")})`,
          columns.map((c) => values[c]),
        ),
      ),
    );
    // 42501 = RLS policy violation; a foreign key that cannot see its
    // target row is the same refusal by another name.
    expect(["42501", "23503"]).toContain(code);
  });
});

describe.each(TABLES.filter((spec) => spec.personal).map((spec) => spec.table))(
  "personal table %s",
  (table) => {
    it("is invisible to a colleague in the same workspace", async () => {
      const rows = await asApp(app, A2, (c) => c.query(`select 1 from "${table}"`));
      expect(rows.rows).toEqual([]);
    });

    it("cannot be written in a colleague's name", async () => {
      const spec = TABLES.find((t) => t.table === table)!;
      const values: Record<string, unknown> = { org_id: A.orgId, ...spec.row("y", A.userId) };
      const columns = Object.keys(values);
      const params = columns.map((_, i) => `$${i + 1}`);
      const code = await expectSqlError(
        asApp(app, A2, (c) =>
          c.query(
            `insert into "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${params.join(", ")})`,
            columns.map((c) => values[c]),
          ),
        ),
      );
      expect(["42501", "23503"]).toContain(code);
    });

    it("cannot be reached by a colleague even by primary key", async () => {
      const rows = await asApp(app, A2, (c) =>
        c.query(`select 1 from "${table}" where org_id = $1`, [A.orgId]),
      );
      expect(rows.rows).toEqual([]);
    });
  },
);

describe.each(TABLES.filter((spec) => !spec.personal).map((spec) => spec.table))(
  "workspace table %s",
  (table) => {
    it("is shared with a colleague in the same workspace", async () => {
      const rows = await asApp(app, A2, (c) => c.query(`select org_id from "${table}"`));
      expect(rows.rows.length).toBeGreaterThan(0);
      expect(rows.rows.every((r) => r.org_id === A.orgId)).toBe(true);
    });
  },
);

describe("a line and a file follow their conversation (drizzle/0004)", () => {
  it("refuses a colleague's line into somebody else's conversation, even in their own name", async () => {
    const code = await expectSqlError(
      asApp(app, A2, (c) =>
        c.query(
          `insert into messages (org_id, user_id, conversation_id, role, content)
           values ($1, $2, 'conv_a', 'user', 'smuglet ind')`,
          [A2.orgId, A2.userId],
        ),
      ),
    );
    expect(code).toBe("42501");
  });

  it("refuses a colleague's file into somebody else's conversation, and allows one with none", async () => {
    const into = await expectSqlError(
      asApp(app, A2, (c) =>
        c.query(
          `insert into files (org_id, user_id, conversation_id, name, mime, size, bytes)
           values ($1, $2, 'conv_a', 'x.txt', 'text/plain', 1, $3)`,
          [A2.orgId, A2.userId, Buffer.from("x")],
        ),
      ),
    );
    expect(into).toBe("42501");
    const loose = await asApp(app, A2, (c) =>
      c.query(
        `insert into files (org_id, user_id, conversation_id, name, mime, size, bytes)
         values ($1, $2, null, 'x.txt', 'text/plain', 1, $3) returning id`,
        [A2.orgId, A2.userId, Buffer.from("x")],
      ),
    );
    expect(loose.rowCount).toBe(1);
  });
});

describe("the export path", () => {
  it("reads through RLS, so one person's export cannot contain another's rows", async () => {
    const rows = await asApp(app, A, (c) => c.query(`select org_id, user_id from conversations`));
    expect(rows.rows.map((r) => [r.org_id, r.user_id])).toEqual([[A.orgId, A.userId]]);
  });
});
