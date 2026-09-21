# ADR 0010: A conversation is one person's — RLS reads the person too

Status: accepted · Date: 2026-09-19 · Amends 0002

## Context

The foundation's tenancy model (ADR 0002) draws one line: the workspace.
Every domain row carries `org_id`, the policy on every table reads it,
and everyone in a workspace sees everything in it. That is right for a
board, a plan and a flow, which are the team's.

A conversation is not the team's. The POC kept conversations in the
browser's localStorage, which made them private by accident: nobody
else could see them because nobody else had the browser. Moving them to
the server — which dogma three and a phone both require — would, under
the workspace line alone, make every conversation readable by every
colleague and by the workspace's owner. A place to think out loud where
the boss can read along is not a place anyone thinks out loud.

## Decision

Three tables — `conversations`, `messages`, `files` — carry `user_id`
beside `org_id`, and their RLS policy reads both:

```sql
USING (org_id = app_current_org_id() AND user_id = app_current_user_id())
```

The person is the conversation's owner, set on every message and every
file of it, so the policy has one column to read and no join. The
application role sees a colleague's rows as if they did not exist, in
the same workspace, with the same context mechanism: `withOrgContext()`
already sets `app.user_id`, and nothing in the application changes to
get this. `tests/rls/product-isolation.test.ts` proves it with a second
member of the same workspace.

The library — `workspace_settings`, `roles`, `tasks` — stays the
workspace's: every member reads it, and owners and admins write it.

What follows for the rest of dogma three:

- **Export** reads through RLS as the person asking. Settings → Data
  hands a person their own conversations, messages and files, the
  workspace's library, and the audit trail. It never hands the owner a
  colleague's conversations; the page says so.
- **Deleting a workspace** takes every member's conversations with it
  through the cascade, as before. The confirmation says so.
- **Removing a member** does not delete their conversations. Rows that
  nobody can read are not a leak, and an account is the thing that
  deletes them: `user_id` cascades from `users`.

## Alternatives rejected

- **Privacy in the service layer only.** Every query filtered on
  `user_id` by the code that runs it. That is exactly the kind of
  promise dogma six refuses: separation in the code, not in the
  database, and one forgotten `where` away from the owner reading
  along.
- **A workspace per person.** Every conversation private because every
  person has their own workspace. It throws away the one thing a
  workspace is for here — a shared system prompt, shared roles, a
  shared task library, one bill — to get a policy that is one line of
  SQL.
- **Shared conversations from day one.** A flag on the conversation
  that opens it to the workspace. Wanted, plausibly, and deliberately
  not built: the first version should prove the private case is
  airtight before a second policy branch is added to it. It is a later
  decision, and this ADR is where it will be amended.

## Trade-offs accepted

- **The owner cannot read what the workspace pays for.** A workspace on
  Mistral pays for every member's conversations and can read none of
  them. The ceilings (ADR 0009) and the call counter are what the owner
  gets instead; the library is what they control.
- **The audit log is wider than the policy.** `audit_log` copies every
  message and is read by the workspace's `org_id` policy alone. Nobody
  reads it in the application yet; TECH-DEBT.md carries the decision
  that must be made before 1.0. _Closed by ADR 0014: the log reads the
  person too for rows about personal tables._
- **Two ownership models in one schema.** A reader of the policies has
  to know which tables are personal. The schema files say it in their
  comments, the isolation test says it in a list, and this ADR is what
  both point at.
