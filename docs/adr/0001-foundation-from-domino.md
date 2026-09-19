# ADR 0001: Makker becomes a Haij app on a copy of the Domino foundation

Status: accepted · Date: 2026-09-19

## Context

Makker started as a customer proof of concept: a Python/FastAPI server
with a hand-written browser front end, talking to whichever model APIs
the customer already paid for through the OpenAI wire format. It has no
database, no login and no tenancy; settings live in a JSON file on disk
and conversations in the browser's localStorage. As a demo it is exactly
right — it runs in five seconds and shows the whole product: chat with
streaming, text out of uploaded files, Word and PowerPoint export in two
sharply separated steps (the model delivers content as JSON, a template
layer shapes it), an administrator page with system prompt, roles and a
task library, and a PII filter that warns and blocks in the browser
before anything is sent.

Makker is now to become a hosted, multi-tenant tool in the Haij family,
on haij.dk, and the family has a foundation proven four times over.
Haij built it: Better Auth with passkeys and TOTP, organizations with
Postgres RLS enforced through two confined database roles, an
append-only audit log written by triggers, admission by application and
invitation, CI with dependency audit and secrets scanning, Docker Compose
deployed through Coolify, the 2a design system. Ajour took a copy and
added per-workspace model settings, the demo workspace per visit, the
deploy and launch guides. Tavle took a copy of that and hardened it.
Domino took a copy of Tavle's (Domino's ADR 0001) and is the newest and
most complete copy.

None of that foundation can be bolted onto the Python app. Multi-tenancy,
audit and workspace-owned settings are not features on top of a server
without a database; they are the ground it stands on.

## Decision

Makker stays in this repository under this name and becomes a Next.js
application on a copy of Domino's foundation, taken at Domino commit
`e9e2d04` and adapted: the same stack (Next.js 16, Postgres 16, Drizzle,
Better Auth, Tailwind + shadcn/ui, next-intl, pnpm, Vitest), the same
tenancy model, the same audit model, the same admission model, the same
demo mechanics, the same workspace-chosen models, the same design tokens
and shell, the same AI door and roof, the same CI gates and deployment
shape. Every Domino-specific module (the flow format, the canvas, the
engine, the runs) is removed rather than disabled.

The runtime roles are `makker_app` and `makker_auth`, the environment
variables `MAKKER_*`, the invitation headers `x-makker-*`, the cookie
`makker-sidebar`, so the family's tools can share one Postgres cluster
and one browser without colliding.

Three choices that were open are closed with this decision:

- **Mistral and Ollama only.** The family's `src/core/llm` knows two
  providers on purpose: one EU-hosted, one local. Makker keeps that and
  nothing else. The POC's Anthropic provider is not carried over, and
  neither is image generation through fal.ai — there is no EU or
  self-hosted image model behind the adapter today, so the feature
  leaves with the provider. Image generation is a later decision, taken
  when there is a provider that keeps dogma four, not before.
- **English code, Danish UI.** Code, comments and docs in English; UI
  copy in Danish first through `messages/da.json`, with an English
  translation. The POC is written in Danish throughout and is not
  translated; it is replaced.
- **Same repository, same name.** The Python app moves to `poc/` and
  is tagged `poc` at the commit before the move, so the history of
  what was learned — the Danish-to-English image prompt, the two-step
  export, the PII filter — stays with the product that learned it. It
  is kept as the reference for what Makker must do, and is not
  maintained beyond that.

What is carried over is the product, not the code: chat with streaming
against a model, files as text in the conversation, the two-step
document export, the administrator's settings (now per workspace), and
the PII filter (which is browser code without a stack, and moves as it
is). Conversations move server-side, per user, with export — which is
what dogma three requires and what localStorage could never give.

## Alternatives rejected

- **Extend the Python app.** Add a database, a login and tenancy to
  FastAPI. Every one of those is a first attempt at something the
  family already has proven, tested and deployed four times, and the
  result would be a fifth foundation to keep in step with the other
  four, in a different language.
- **A module inside Domino.** Domino already talks to a model on a
  person's behalf and already extracts text from documents. But a
  conversation is not a flow: the people at the door are different
  (someone thinking out loud, not a case worker with a pile), and the
  product's centre — the chat — is a sidebar in Domino. Sharing a
  repository would make the smaller product bend to the larger.
- **A new repository.** Cleaner history, and nothing else. The name,
  the README's lessons and the POC's git log are worth more than a
  clean slate; a tag and a folder keep them.
- **Keep Anthropic as a marked opt-in.** It could be done — a provider
  behind a flag, listed in `docs/subprocessors.md`. It was rejected
  because the marking would be the only thing standing between the
  installation and a non-EU processor, and because the family's adapter
  deliberately has no such door. A tool that thinks out loud with
  someone is exactly the tool whose text must not leave the EU.

## Trade-offs accepted

- **Five copies of the foundation.** A fix in any sibling's auth,
  tenancy or audit code does not reach Makker by itself. Bounded, as
  before, by keeping the copied code unchanged where possible and
  naming the commit it came from.
- **A feature is lost.** Image generation worked in the POC and will
  not work in Makker v1. Chosen over keeping a non-EU provider.
- **Streaming is new ground.** The family's LLM adapter answers with
  one completion; every sibling asks for one JSON object. A chat lives
  on tokens as they arrive, so `src/core/llm` gains streaming here,
  first. It is written so the siblings can take it back — an ADR of its
  own when it lands.
- **The POC goes stale.** `poc/` is not run in CI and is not kept
  working against new Python or library versions. It is a reference,
  read more than run.
- **Five accounts for one person.** A shared identity across the family
  is a later decision that must not be forced by a shortcut.
