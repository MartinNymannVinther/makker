-- Security for the product tables: grants, forced row-level security, audit
-- triggers, and the one privileged operation the application role is
-- allowed: deleting a whole workspace. See docs/adr/0010 for why three of
-- the tables are scoped to the person and not only to the workspace.

-- The application role owns the product tables in the only sense that
-- matters: it may read and write them, and RLS decides which rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "conversations", "messages", "files", "workspace_settings", "roles", "tasks"
TO makker_app;
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A conversation, its lines and its files are one person's. The policy
-- reads the workspace AND the person, so a colleague in the same
-- workspace sees nothing of it — not the owner either. Without a context
-- every predicate is NULL and nothing matches.
CREATE POLICY app_own_conversations ON "conversations" FOR ALL TO makker_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_own_messages ON "messages" FOR ALL TO makker_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint
CREATE POLICY app_own_files ON "files" FOR ALL TO makker_app
  USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
  WITH CHECK (org_id = app_current_org_id() AND user_id = app_current_user_id());
--> statement-breakpoint

-- The library is the workspace's: every member reads it, and who may
-- write it is decided in the service (owner or admin), not here.
CREATE POLICY app_tenant_workspace_settings ON "workspace_settings" FOR ALL TO makker_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_roles ON "roles" FOR ALL TO makker_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint
CREATE POLICY app_tenant_tasks ON "tasks" FOR ALL TO makker_app
  USING (org_id = app_current_org_id()) WITH CHECK (org_id = app_current_org_id());
--> statement-breakpoint

-- Audit triggers on every table that holds what a person or a workspace
-- owns. The files table is audited, but audit_redact drops its bytes: the
-- audit row says a file came and went, never what was in it.
CREATE TRIGGER audit_conversations
  AFTER INSERT OR UPDATE OR DELETE ON "conversations"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_messages
  AFTER INSERT OR UPDATE OR DELETE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_files
  AFTER INSERT OR UPDATE OR DELETE ON "files"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_workspace_settings
  AFTER INSERT OR UPDATE OR DELETE ON "workspace_settings"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_roles
  AFTER INSERT OR UPDATE OR DELETE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint

-- The redaction list from 0001, with the files' bytes added: an audit
-- row must say a file came and went, never carry the file. The extracted
-- text stays — it is what the model read, and what a person may need to
-- see to understand an answer.
CREATE OR REPLACE FUNCTION audit_redact(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN data IS NULL THEN NULL
    ELSE data - ARRAY[
      'password', 'token', 'secret', 'backup_codes',
      'access_token', 'refresh_token', 'id_token', 'value',
      'key_hash', 'token_hash', 'api_key_cipher', 'bytes'
    ]
  END
$$;
--> statement-breakpoint

-- Deleting a workspace: the one thing the application role may do that RLS
-- and grants would otherwise forbid, wrapped in a function that checks the
-- caller itself. Dogma 3 says everything a workspace owns can be deleted
-- again completely, and that includes the audit rows about it: they carry
-- the conversations' lines and the files' text, and a team that leaves
-- must not leave a shadow. The append-only guard is stepped around for
-- exactly this transaction, and one context-free row records that the
-- deletion happened.
--
-- The owner check raises with ERRCODE 42501 (insufficient_privilege), which
-- is what src/modules/export/workspace.ts matches; the wording is free to
-- change. The active-workspace check keeps plpgsql's default P0001 on
-- purpose: it is a backstop against a call the application cannot make.
CREATE OR REPLACE FUNCTION delete_workspace(p_org_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user text := nullif(current_setting('app.user_id', true), '');
  v_role text;
BEGIN
  IF p_org_id IS NULL OR p_org_id <> nullif(current_setting('app.org_id', true), '') THEN
    RAISE EXCEPTION 'delete_workspace: not the active workspace';
  END IF;
  SELECT role INTO v_role FROM memberships WHERE organization_id = p_org_id AND user_id = v_user;
  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'delete_workspace: only the workspace owner may delete it'
      USING ERRCODE = '42501';
  END IF;

  -- Domain rows, memberships and invitations follow the organization
  -- through cascading foreign keys; their audit rows are written by the
  -- triggers on the way out and purged just below.
  DELETE FROM organizations WHERE id = p_org_id;

  PERFORM set_config('session_replication_role', 'replica', true);
  DELETE FROM audit_log WHERE org_id = p_org_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  INSERT INTO audit_log (org_id, actor_user_id, actor_type, action, entity_type, entity_id)
  VALUES (NULL, v_user, 'user', 'workspace.deleted', 'organizations', p_org_id);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION delete_workspace(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION delete_workspace(text) TO makker_app;
