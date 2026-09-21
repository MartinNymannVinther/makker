# ADR 0014: The audit log reads the person too

Status: accepted · Date: 2026-09-21 · Amends 0010

## Context

ADR 0010 made a conversation one person's and named the audit log as
the hole it left open: the triggers copy every message into
`audit_log`, and the log's policy read `org_id` alone. Nobody in the
application read the log — but the workspace export does, as its
"Revisionsspor" tab, and so a member could take their colleagues' lines
out of the workspace through a tab that the messages table itself
refuses them. The release review found it before a person did.

## Decision

The application role's select policy on `audit_log` (drizzle/0005)
reads the person for rows about the personal tables:

```sql
org_id = app_current_org_id()
AND (entity_type NOT IN ('conversations', 'messages', 'files')
     OR actor_user_id = app_current_user_id())
```

A row about a conversation, a message or a file is visible to the
person who caused it. Rows about the library, the workspace and its
members stay the workspace's. A personal row with no actor — a cascade
from a deleted account, written outside any context — is visible to
nobody, which is what an account that is gone would want.

The content stays in the log. Dogma six asks for every change to land
in a log that cannot be edited, and a conversation is a change; the
policy, not redaction, is what keeps it private, the same way it keeps
the message itself private.

## Alternatives rejected

- **No content in the audit row for messages.** Redact `content` in
  `audit_redact()`. It would make the log say a line was written and
  never what — and it would still leave the _existence_ and timing of a
  colleague's every line readable. Half a leak is a leak.
- **Leave the audit tab out of the export.** The export is dogma three's
  proof; a tab that goes missing to hide a policy hole is the wrong fix
  in the wrong place.

## Trade-offs accepted

- **The workspace's owner cannot audit a member's conversations.** That
  is the same trade ADR 0010 already made for the rows themselves, and
  it is the right one for a place to think out loud.
- **A row's `entity_type` is now load-bearing.** A future personal table
  has to be added to the list in the policy, or its audit rows are the
  workspace's. `tests/rls/product-isolation.test.ts` proves the three
  that exist; CONTRIBUTING's tenancy checklist names the step.
