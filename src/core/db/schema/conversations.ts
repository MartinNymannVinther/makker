import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { domainId, users } from "./foundation";
import { roles } from "./library";
import { tenant, timestamps } from "./shared";

/**
 * A conversation is one person's: the place they think out loud with a
 * model. It belongs to the workspace like every domain row, and to the
 * person who opened it — the RLS policy (drizzle/0003) reads both, so a
 * colleague in the same workspace never sees it. That is what the POC's
 * localStorage gave for free and what a server has to say out loud
 * (docs/adr/0010).
 */
export const conversations = pgTable(
  "conversations",
  {
    id: domainId("id"),
    orgId: tenant(),
    /** Whose conversation it is. Goes with the person: no account, no conversation. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Written by the person or proposed by the model from the first exchange; empty until then. */
    title: text("title").notNull().default(""),
    /** The role laid over the system prompt for this conversation, if one was chosen. */
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
);

/**
 * One line in a conversation, the person's or the model's. The model's
 * line records which engine wrote it and what it cost, so the history
 * says what was actually asked of whom.
 */
export const messages = pgTable(
  "messages",
  {
    id: domainId("id"),
    orgId: tenant(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** The conversation's owner, on every line, so the per-person policy has one column to read. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** "provider:model" for the model's lines; empty for the person's. */
    engine: text("engine").notNull().default(""),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    /** The model hit its token ceiling mid-answer; the person may ask it to go on. */
    truncated: boolean("truncated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    check("messages_role_ck", sql`${t.role} in ('user', 'assistant')`),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
