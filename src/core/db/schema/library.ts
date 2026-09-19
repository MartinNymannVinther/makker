import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { domainId, users } from "./foundation";
import { tenant, timestamps } from "./shared";

/**
 * What the workspace's administrator can shape without touching code:
 * the system prompt every conversation opens with, the roles a person
 * can lay over it, the task library that fills the writing field, and
 * the PII filter's settings. The POC kept these in one JSON file on the
 * server; here they are the workspace's own rows, so two workspaces on
 * one installation can disagree.
 *
 * The defaults live in code (src/modules/library/defaults.ts) and are
 * seeded into a workspace the first time it asks; a workspace with no
 * rows is one that has not been touched yet, not one with nothing.
 */

/** One row per workspace: the prompt and the filter. Absent until seeded. */
export const workspaceSettings = pgTable("workspace_settings", {
  id: domainId("id"),
  orgId: tenant().unique(),
  /** Opens every conversation. Server-side on purpose: the browser sends a role id, never the text. */
  systemPrompt: text("system_prompt").notNull().default(""),
  /** How long an answer may become; documents get their own, larger ceiling. */
  maxTokens: integer("max_tokens").notNull().default(4096),
  piiEnabled: boolean("pii_enabled").notNull().default(true),
  /** Names of patterns and hints switched off; see static PII catalogue. */
  piiDisabled: jsonb("pii_disabled").$type<string[]>().notNull().default([]),
  /** Extra words per hint group, e.g. { "Helbredsoplysninger": ["migræne"] }. */
  piiExtraWords: jsonb("pii_extra_words").$type<Record<string, string[]>>().notNull().default({}),
  /** Whether a hint alone may block sending. Off by default, or people stop reading the warnings. */
  piiBlockOnHint: boolean("pii_block_on_hint").notNull().default(false),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

/**
 * A role is laid over the system prompt for one conversation. It never
 * replaces it, so the language and the frame the administrator set still
 * hold whichever role a person picks.
 */
export const roles = pgTable(
  "roles",
  {
    id: domainId("id"),
    orgId: tenant(),
    /** Stable handle a task can point at ("sparring"); unique within the workspace. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instruction: text("instruction").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("roles_org_sort_idx").on(t.orgId, t.sort),
    uniqueIndex("roles_org_key_uq").on(t.orgId, t.key),
  ],
);

/**
 * A ready-made task the person can click: the prompt lands in the
 * writing field, and the role is set at the same time when the task has
 * one that fits.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: domainId("id"),
    orgId: tenant(),
    groupName: text("group_name").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    prompt: text("prompt").notNull(),
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("tasks_org_sort_idx").on(t.orgId, t.sort)],
);

export type WorkspaceSettingsRow = typeof workspaceSettings.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
