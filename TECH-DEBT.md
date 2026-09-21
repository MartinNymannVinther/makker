# Tech debt

What we know is not right yet, why it is not right, and what fixing it
would take. A debt item is written down when it is discovered and moved
to **Paid** when it is done — an item nobody can find is an item nobody
pays.

CLAUDE.md's ways of working point at this file; this is it.

Opened at wave 0, September 2026, when the foundation was taken from
Domino and the product did not yet exist. What is here was inherited with
the foundation, checked against this repository's code, and kept only
where it still applies. **Check an item against the code before acting
on it.** A debt file that is trusted without being checked is worse than
no file.

Three kinds of item live here, and they are kept apart on purpose. What
is **open** is wrong and worth fixing. What is **accepted** is a
boundary we chose, written down so nobody re-discovers it as a bug. What
is **waiting for real use** is a product question we refuse to answer
from the armchair (dogma seven).

## Open

### Files over 300 lines

One responsibility per file and no file over roughly 300 lines. Five
inherited files are over it, none of them the product's:

| lines | file                                                  | the seam                                             |
| ----- | ----------------------------------------------------- | ---------------------------------------------------- |
| 371   | `tests/access/admission.test.ts`                      | the application, the invitation, the registration    |
| 369   | `tests/rls/tenant-isolation.test.ts`                  | the roles' reach vs. the coverage meta-tests         |
| 332   | `app/[locale]/(app)/settings/access/access-admin.tsx` | the applications list vs. the invitation form        |
| 318   | `core/access/service.ts`                              | applications vs. invitations                         |
| 304   | `core/db/schema/foundation.ts`                        | Better Auth's tables vs. the audit log and admission |

They are the family's, not Makker's; a split here is a split the other
tools would want too, and is better made once and carried across than
made five times. The product's own files start at zero and stay under
the line.

### The inherited ADRs speak of flows

ADR 0002 to 0009 came with the foundation and were written for Domino.
Where they explain the foundation — tenancy, audit, admission, demos,
the workspace's model, the tokens, the AI door and roof — they hold
here word for word. Where an example names a flow, a brick or a run, it
is Domino's example, not a feature of Makker. Each carries a line at the
top saying so. Rewriting them for Makker's examples is worth doing once
the product has examples of its own.

### The filter's "off for this conversation" lasts the page

Switching the filter off for a conversation (ADR 0013) is state in the
chat page: reload, and it is on again. That is deliberate for now — the
administrator is the right person to switch it off for good — but a
person who is asked three times in one afternoon will disagree. A
per-conversation flag in the database is small work once somebody asks.

## Accepted, with the reason written down

### The content policy still allows inline scripts

`next.config.ts` sends a Content-Security-Policy, and it blocks
everything Makker never uses: no external scripts, no framing, no
`<base>`, no form posting off-site. But `script-src` keeps
`'unsafe-inline'`, because Next.js writes its own bootstrap inline and
next-themes writes the one that sets the theme before first paint.

Closing it means a per-request nonce, set on the _request_ headers in
`src/proxy.ts` so Next stamps it onto its own scripts — and composed with
`next-intl`'s middleware, which builds its own response and will not
carry modified request headers by itself. It also forces every page to
render dynamically, which `src/app/[locale]/layout.tsx` currently avoids
with `generateStaticParams` and `setRequestLocale`.

That is a real trade with a real cost. It deserves its own change, with a
test, not a line in a hardening pass.

### Rate limiting is per process

`src/core/rate-limit.ts` counts in memory, which is correct for one
container behind one proxy and says so. An installation scaled to several
instances gets a limit per instance rather than a limit. The file is
written so that it is the only one to replace; the call sites do not
change.

### The workspace model key is bound to its workspace, but old ciphertexts are not

`src/core/crypto/secret-box.ts` seals as `v2` with the workspace id as
additional authenticated data, so a stored key only opens for the
workspace it was stored for. `v1` values are still read, without that
binding, for installations upgraded from an older foundation. Makker has
never written a `v1` value; the read path can go the day the family's
other tools no longer need it.

### The date helpers are wider than the product

`src/core/dates.ts` carries week numbers, plan-date arithmetic and three
formatters, all inherited and all tested. Makker uses the stamp
formatters. The rest stays because it is the family's one calendar; it
costs nothing while it waits.

### The POC is a reference, not a build

`poc/` holds the Python app Makker grew out of. It is excluded from
lint, format, typecheck, CI and the Docker image, and nothing imports
it. It will stop running against new Python and library versions, and
that is accepted: it is read more than run (ADR 0001).

## Paid

### Every message was audited, and the audit tab was the workspace's

The triggers copy every message into `audit_log`, and until the release
review the log's policy read `org_id` alone — so the export's audit tab
handed a member their colleagues' lines. Closed 2026-09-21 by ADR 0014
and drizzle/0005: rows about personal tables are visible to the person
who caused them. Found by reading, not by a person; the isolation test
now holds it.

## Waiting for real use

Not debt: product questions the tool refuses to answer from the armchair
(dogma seven). Each one is a decision somebody will ask for, and the
answer should come from a person who ran into it with real conversations.

### How much a conversation may carry

Twelve thousand characters per message, twenty megabytes per file, ten
files per upload, and the model reads the whole conversation every
time. The first person whose conversation grows past what the model's
context holds is the reason to summarise or window it — not a guess
about them.

### Sixty calls an hour per person

The ceilings in `src/modules/ai/limits.ts` were sized for a team adding
cards and kept as inherited. A chat is more talkative than a board;
whether sixty an hour is generous or mean for a person thinking out loud
is a question for the first week of real use.
