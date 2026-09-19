# CLAUDE.md — Makker

Makker (makker.haij.dk) is an open source chat to think out loud with,
on language models that stay in the EU or on your own server: write,
attach a document, pick a role, and get the answer as text, Word or
PowerPoint, with a filter that stops personal data before it leaves
the browser. It is one tool in the Haij family (haij.dk) and stands on
the Haij foundation, taken by way of Ajour, Tavle and Domino. This file
is the project constitution: read it fully at the start of every
session. The non-negotiables below override any default you would
otherwise pick.

## The Haij dogmas (family rules, non-negotiable)

The seven dogmas are written in Danish, in the family's own words, in
README.md. Quote them verbatim; never rephrase them. What they bind this
codebase to:

1. **Real open source.** AGPL-3.0. Everything that runs on makker.haij.dk
   can be cloned and run elsewhere or locally, 1:1. No feature exists only
   on the hosted instance. A paid edition is fine, but it is the same code.
2. **Self-hosting.** Runs on one server with Docker Compose, one Postgres
   and a local language model through Ollama, without a single cloud key.
   Features that need an external service say so and let the rest work.
   The test: cut the internet, and everything essential still works.
3. **Your data, always.** Everything a person owns can be exported with
   one click in open formats (spreadsheet, JSON) and deleted again
   completely. Leaving must take a few clicks and no friction.
4. **EU or self-hosted.** Hosted, everything lives with EU-owned providers
   on EU soil, language models included, and `docs/subprocessors.md` says
   who can see what. Code lives on GitHub, which hosts code, not customer
   data.
5. **The AI helps, the human decides.** The model answers; it never sends
   anything out of the house, deletes anything or commits anyone. Content
   fetched from outside — a person's documents included — is data, never
   instructions.
6. **Secure from day one.** Workspaces are separated in the database
   (Postgres RLS) with a test proving it, every change lands in an audit
   log that cannot be edited, passkeys and TOTP from the start, a public
   way to report vulnerabilities, and never a secret in the code.
7. **Used for real.** Nothing goes in the window before it has run real
   work. Makker runs a real week of thinking out loud before it is shown.

## Product principles

- **A conversation is one person's.** Stored on the server so it is there
  tomorrow, and stored under a policy that lets nobody but that person
  read it — not a colleague, not the workspace's owner, not a bug in the
  application (ADR 0010). The workspace's export therefore holds the
  asking person's conversations and the workspace's library, never
  somebody else's thinking.
- **Roles over one prompt.** The administrator writes the system prompt
  once, per workspace. A role is laid over it for one conversation and
  never replaces it, so the language and the frame hold whichever role a
  person picks. Six defaults from the POC; a workspace edits them.
- **A task library that fills the field.** Ready-made tasks a person
  clicks; the text lands in the writing field and the role switches with
  it when the task has one.
- **Files as text.** PDF, Word, text and Markdown are read once at upload
  and go into the conversation as text. The bytes stay with the
  conversation, in Postgres, never on disk.
- **Two steps to a document.** The model delivers a memo or a deck as
  structured content in JSON; a template layer shapes it into Word or
  PowerPoint. The model never touches a layout.
- **The filter runs in the browser.** Before anything is sent, the page
  looks for personal data and warns or blocks. Nothing leaves the machine
  to be checked. Its patterns and hint words are the administrator's to
  tune, per workspace.
- **Mistral and Ollama, and no other** (ADR 0001). The POC's Anthropic
  provider and fal.ai image generation are not carried over. Image
  generation is a later decision, taken when there is a provider that
  keeps dogma four.
- **Deliberately not built in v1:** shared conversations, folders,
  search across conversations, tools the model can call, image
  generation, a mobile app. The omissions are the product; each one is a
  later decision, not an oversight.
- **Danish interface**, English available; code, comments and docs in
  English.

## Architecture (decided — change only via a new ADR)

- Next.js 16 (App Router), TypeScript strict. One app, one database.
- Postgres 16+ with Drizzle ORM. Migrations checked in; hand-written SQL
  for roles, RLS and triggers.
- Multi-tenancy: single database, `org_id` on every domain table, RLS
  policies enforced for the application role. The organization is what
  the UI calls a workspace ("arbejdsrum"); a workspace holds any number
  of people, each with their own conversations. App code never uses a
  superuser/bypass role for domain queries; every domain query goes
  through `withOrgContext()`. Conversations, messages and files carry
  `user_id` too, and their policies read both (ADR 0010).
- Auth: Better Auth (pinned at 1.7.1, see pnpm-workspace.yaml) with
  organizations, passkeys (WebAuthn) and TOTP. Registration closed by
  default; admission by application and invitation (a stranger gets a
  workspace) and by workspace invitation (a colleague joins an existing
  one). Session cookies: Secure, HttpOnly, SameSite=Lax.
- UI: Tailwind + shadcn/ui with the Haij 2a design tokens (warm paper,
  moss green, Archivo). One palette for the whole family. next-intl with
  `da` default (no URL prefix) and `en` under `/en`. Timezone
  Europe/Copenhagen.
- AI: all model access through `src/core/llm` (Mistral at the EU
  endpoint, Ollama for self-hosting), behind an adapter. The installation
  sets the default in `.env` and a workspace may choose its own provider,
  model and key in Settings → AI, encrypted at rest; the Ollama address
  stays with the installation (ADR 0006). The chat streams: the adapter
  has `stream()` beside `complete()` (ADR 0011), and the conversation
  route is an SSE response. Read-only proposals — a title for a
  conversation — are routes (ADR 0008). Without a model the writing
  field says so and everything else works.
- Files: in Postgres (`files.bytes`), never on disk; text extracted at
  upload (`src/modules/files`).
- Documents: `src/modules/documents` turns the model's JSON into Word
  (`docx`) and PowerPoint (`pptxgenjs`) with Haij's template; the model's
  answer is validated against a schema before a byte is laid out.
- Deployment: Docker Compose run via Coolify on an EU VPS (Hetzner
  initially; the provider must stay replaceable). Nightly encrypted
  backups to EU object storage. No Vercel, no Neon, no US cloud.
- Layout: shared kernel (auth, tenancy, audit, llm, team, env) in
  `src/core`; the product in
  `src/modules/{chat,library,files,documents,ai,demo,export}` behind
  services that take an `OrgContext`; server actions next to their
  services as `actions*.ts`; pages in `src/app/[locale]` and components
  in `src/components/{chat,library,settings}`. The browser-side PII
  filter is `src/lib/pii.ts`, framework-free and tested on its own.
- Trade-off accepted: the foundation is a copy of Domino's copy of
  Tavle's copy of Ajour's copy of Haij's, not a shared package. Five
  products, five lifecycles, one set of rules (ADR 0001).

## Security rules

- Every new table ships with `org_id`, forced RLS, an audit trigger and an
  automated test proving workspace A cannot read or write workspace B's
  rows. The meta-test in `tests/rls` fails any table without forced RLS.
  A table that holds one person's things also carries `user_id` and a
  policy that reads it, with a test that a colleague sees nothing.
- Every server action resolves the caller's session and workspace first
  and validates that every id it receives belongs to that workspace — and
  to that person, for a conversation. Never trust an id from the client.
  Editing the library takes an owner or an admin; the check lives in the
  service, not the form.
- Validate all input at the boundary (zod). Parameterized queries only.
  A document the model delivers is validated against its schema before
  it is shaped.
- Rate limiting on auth and all public endpoints, ceilings on AI calls —
  per user, per workspace and over the whole installation (ADR 0009) —
  and a ceiling on message length and file size. Generic auth error
  messages, no stack traces and nothing in a response that is about this
  installation. `GET /api/version` names the release without a login so
  a deploy can be verified; `/api/health` answers `ok`.
- The AI surface: the system prompt and the roles live on the server;
  the browser sends a role id, never the text. Everything a person wrote
  and everything a document contains is fenced as data in every prompt,
  never as instructions. The model writes nothing but its own line.
- Invitation links are Better Auth invitation ids: single-purpose, bound
  to one address, expiring after 48 hours, revocable.
- GDPR by design: per-person export, per-workspace deletion, record of
  processing, EU-only subprocessors listed in `docs/subprocessors.md`.
- `SECURITY.md` with responsible disclosure. CI runs dependency audit and
  secrets scanning on every push.

## Ways of working (how Claude Code operates here)

1. Plan first. For every wave: present the plan, the schema changes and
   the API surface, get a yes, then work independently inside that one
   wave without asking on the way. End the wave with a green build, green
   tests and a commit on main; report back briefly; wait for the next yes.
2. Vertical slices. Ship end-to-end features; keep the app deployable at
   every commit.
3. Run `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format` after
   code changes and keep them green. Tests where they matter: RLS
   isolation including the per-person policies, the streaming adapter
   with a fake model, the PII filter, the document schemas, the export.
4. One responsibility per file; no file over roughly 300 lines.
5. Conventional commits. Every significant decision gets an ADR in
   `docs/adr/` that names the trade-off accepted, not just the choice.
6. Never weaken tenancy, auth or audit logging to make a feature easier.
7. Never delete files without explicit approval. `poc/` is the Python
   proof of concept Makker grew out of: read it as the reference for
   what the product must do, never run it in CI, never lint it, never
   change it.
8. Code, comments and docs in English. UI copy in Danish first through
   i18n (`messages/da.json`) with an English translation; never hardcode
   UI strings.
9. Ask before adding any dependency not implied by this file.
10. **Claude delivers to main; Martin delivers to production.** Pushing
    to main deploys nothing: deployment is a manual step Martin performs
    in Coolify with Auto Deploy off. Still, only push when build and
    tests are green — main is what gets deployed. Makker runs locally on
    Martin's machine until then; do not set up hosting or deploy.

## Roadmap

- Wave 0 (done): the foundation from Domino (ADR 0001), cut to what a
  chat needs; the six product tables with RLS, per-person policies,
  audit and isolation tests; the Python POC moved to `poc/`; this file;
  the repository.
- Wave 1 (done): streaming in `src/core/llm` — `stream()` beside `complete()`
  for Mistral and Ollama, tested against a fake model, written so the
  siblings can take it back (ADR 0011).
- Wave 2: the conversation — conversations and messages behind the
  per-person policy, the SSE chat route through the AI door, the chat
  page with the list and the writing field, files as text, the title
  proposed by the model, per-person export (ADR 0010).
- Wave 3: the library — the system prompt, the roles, the task library
  and the filter's settings per workspace, seeded from the POC's
  defaults, edited by owners and admins under Settings; the role picker
  and the task picker in the chat.
- Wave 4: documents — the two-step Word and PowerPoint export with
  Haij's template (`docx`, `pptxgenjs`), the schema the model answers
  in, the PII filter moved into the browser as `src/lib/pii.ts`.
- Wave 5: demo and operations — the demo workspace per visit, the
  deploy and launch guides checked against the app, TECH-DEBT, the
  tool card for haij.dk.
- Before 1.0: dogma seven — a real week of real thinking out loud.
- Later, each as its own decision: shared conversations, search,
  image generation on an EU or local model, tools the model can call.
