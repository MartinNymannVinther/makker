# Decisions

Every significant decision in Makker is written down here, numbered in
the order it was taken, and says what trade-off was accepted rather than
only what was chosen. A decision is never rewritten once it is accepted:
a later one amends it and says so in both directions, so a reader who
arrives at the old number is told where the story continues.

This index is the way in. It is checked in, which means it has to be
re-read when an ADR is added. The number of the next one is the highest
here plus one.

ADR 0002 to 0009 came with the foundation from Domino and are the
family's decisions; each says so at the top. Makker's own start at 0001
and continue from 0010.

Where the product's own words live instead: **README.md** has the seven
dogmas in the family's voice, **CLAUDE.md** is the constitution every
session reads, and **TECH-DEBT.md** is what we know is not right yet.

| #                                                                     | Decision                                                               | Relations |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| [0001](0001-foundation-from-domino.md)                                | Makker becomes a Haij app on a copy of the Domino foundation           |           |
| [0002](0002-tenancy-rls.md)                                           | Multi-tenancy enforced with RLS and two runtime roles                  | ← 0010    |
| [0003](0003-audit-logging.md)                                         | Trigger-based, append-only audit log                                   |           |
| [0004](0004-admission-by-invitation.md)                               | Admission by application and invitation                                |           |
| [0005](0005-demo-workspaces.md)                                       | A demo workspace per visitor                                           |           |
| [0006](0006-workspace-chosen-models.md)                               | A workspace can choose its own model                                   |           |
| [0007](0007-design-scale-and-tokens.md)                               | A named small-text scale, and the last hard-coded values become tokens |           |
| [0008](0008-ai-reads-on-their-own-route.md)                           | An AI read is a route, not an action                                   |           |
| [0009](0009-ai-installation-roof.md)                                  | The installation's own roof over the AI                                |           |
| [0010](0010-a-conversation-is-one-persons.md)                         | A conversation is one person's — RLS reads the person too              | → 0002    |
| [0011](0011-streaming-in-the-adapter.md)                              | Streaming in the adapter — `stream()` beside `complete()`              |           |
| [0012](0012-the-library-is-the-workspaces.md)                         | The library is the workspace's, seeded from the POC on first use       |           |
| [0013](0013-two-steps-to-a-document-and-the-filter-in-the-browser.md) | Two steps to a document, and the filter stays in the browser           |           |
| [0014](0014-the-audit-log-reads-the-person-too.md)                    | The audit log reads the person too                                     | → 0010    |
