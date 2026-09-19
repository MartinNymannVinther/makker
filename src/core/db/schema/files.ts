import { customType, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { conversations, messages } from "./conversations";
import { domainId, users } from "./foundation";
import { tenant } from "./shared";

/**
 * A file somebody attached to a conversation — a report, a minute, a
 * draft — and the text pulled out of it at upload. The text is what the
 * model reads; the bytes are kept so the person can see what they gave
 * it and so the export carries the file's name and size.
 *
 * The bytes live in the database, not on disk, as in the rest of the
 * family: one Postgres is the whole state of an installation, a backup
 * is a backup, and a deleted workspace or account takes its files with
 * it through the cascade. The price is a row that can be twenty
 * megabytes, which is what the upload ceiling in src/modules/files
 * bounds it to.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const files = pgTable(
  "files",
  {
    id: domainId("id"),
    orgId: tenant(),
    /** Who uploaded it — the same person whose conversation it lands in. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The conversation it was attached in; null between upload and the first message that carries it. */
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    /** The message it was sent with, once it has been. */
    messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    bytes: bytea("bytes").notNull(),
    /** What the model reads: the text extracted on upload, or null when nothing could be. */
    text: text("text"),
    /** Why extraction gave nothing, when it did; a person can still see the file. */
    extractError: text("extract_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("files_user_created_idx").on(t.userId, t.createdAt),
    index("files_conversation_idx").on(t.conversationId),
  ],
);

export type FileRow = typeof files.$inferSelect;
