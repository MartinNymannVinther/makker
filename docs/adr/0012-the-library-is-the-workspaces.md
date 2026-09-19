# ADR 0012: The library is the workspace's, seeded from the POC on first use

Status: accepted · Date: 2026-09-19

## Context

The POC kept its administrator's settings — the system prompt, the
roles, the task library, the filter's tuning — in one JSON file on the
server, with the defaults in code and only the difference saved. One
installation, one file, one administrator. Makker has many workspaces
on one installation, and each has its own administrator with their own
opinion about what the model should be told.

Two things had to be decided: where the defaults live, and when a
workspace gets its own copy.

## Decision

The library is three tables — `workspace_settings`, `roles`, `tasks` —
scoped to the workspace like every domain row, read by every member,
written by owners and admins. The check that decides who may write is
in the service (`canEditLibrary`), not in the form.

The defaults are code (`src/modules/library/defaults.ts`): the POC's
prompt, six roles and twelve tasks, in Danish, because they are content
a workspace owns and edits rather than UI copy. A workspace with no
rows is one that has not been asked yet; **the first read seeds them**.
The settings row is the marker, unique per workspace by constraint, so
two first reads at once cannot both seed. A workspace can put the
defaults back with one action, which deletes its rows and seeds again.

A role is referenced by id from tasks and conversations, with
`ON DELETE SET NULL`: a role that goes leaves the task and the
conversation standing, without one. A role also carries a `key`, unique
within the workspace, so a task's default can name it before either has
an id.

## Alternatives rejected

- **Defaults as rows, seeded on workspace creation.** A hook in the
  sign-up path and in the demo and in the invitation flow — three
  places to remember, and a workspace created any fourth way opens
  empty. Seeding on read has one place and cannot be forgotten.
- **Only the difference saved, defaults merged at read.** The POC's
  shape. Right for one file, wrong for three tables: "this task is the
  default one, edited" and "this task is the workspace's own" need
  different rows anyway, and a list that is half code and half table is
  a list nobody can sort.
- **One library for the installation.** The operator writes the prompt
  in `.env`. Simple, and it makes every workspace speak with one voice,
  which is the opposite of what a workspace is for here.

## Trade-offs accepted

- **The defaults are frozen at seeding.** A better default role in a
  later release does not reach a workspace that has already seeded;
  only the reset does, and the reset takes the workspace's own roles
  with it. A merge that keeps the workspace's changes and adds new
  defaults is a later decision.
- **Danish content in code.** A workspace whose people write English
  rewrites six roles and twelve tasks once. The alternative — defaults
  per locale — would need a workspace to have a locale, which it does
  not; people do.
- **A read that writes.** `listRoles` on an untouched workspace inserts
  rows. It is idempotent and it runs as the member reading, under the
  same policy; but a reader of the code should know that the first
  member to open the chat is the one whose name is on the seed's audit
  rows.
