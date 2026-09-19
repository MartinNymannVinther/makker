-- A line and a file belong to the conversation they are in, and the
-- conversation belongs to one person (docs/adr/0010). The policies from
-- 0003 read the row's own user_id, which keeps a colleague from reading
-- these rows — but not from writing one: an insert carrying their own
-- user_id and somebody else's conversation_id passed WITH CHECK, because
-- a foreign key is checked as the table's owner and sees every row. The
-- row would then sit in a conversation its owner could not see, written
-- by somebody who could not see the conversation. The check now follows
-- the conversation: the row must be the caller's, and so must the
-- conversation it names. A file with no conversation yet — uploaded,
-- not yet sent — is the caller's alone.
DROP POLICY app_own_messages ON "messages";
--> statement-breakpoint
CREATE POLICY app_own_messages ON "messages" FOR ALL TO makker_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND user_id = app_current_user_id()
    AND EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = conversation_id AND c.user_id = app_current_user_id()
    )
  );
--> statement-breakpoint
DROP POLICY app_own_files ON "files";
--> statement-breakpoint
CREATE POLICY app_own_files ON "files" FOR ALL TO makker_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (
    org_id = app_current_org_id()
    AND user_id = app_current_user_id()
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM "conversations" c
        WHERE c.id = conversation_id AND c.user_id = app_current_user_id()
      )
    )
  );
