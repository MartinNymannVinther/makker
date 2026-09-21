-- The audit log reads the person too, for rows about a person's things.
--
-- 0001 lets the application role read every audit row of the active
-- workspace. That was right when everything in a workspace was the
-- team's; it is wrong now that a conversation is one person's (docs/adr
-- /0010): the triggers copy every message into audit_log, and the
-- workspace's export carries the audit tab, so a member could read a
-- colleague's lines there that the messages table itself refuses them.
--
-- So a row about a personal table — conversations, messages, files — is
-- visible to the person who caused it, and to nobody else in the
-- workspace. Rows about everything else (the library, the workspace, the
-- members) stay the workspace's. A row about a personal table with no
-- actor at all — a cascade from a deleted account, written outside any
-- context — is visible to nobody, which is what an account that is gone
-- would want.
DROP POLICY app_select_audit ON "audit_log";
--> statement-breakpoint
CREATE POLICY app_select_audit ON "audit_log" FOR SELECT TO makker_app
  USING (
    org_id = app_current_org_id()
    AND (
      entity_type NOT IN ('conversations', 'messages', 'files')
      OR actor_user_id = app_current_user_id()
    )
  );
