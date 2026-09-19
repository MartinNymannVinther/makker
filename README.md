# Makker

Makker ([makker.haij.dk](https://makker.haij.dk)) is an open source chat
to think out loud with, on language models that stay in the EU or on
your own server. Write the way you talk, attach a report or a draft,
pick a role — sparring partner, devil's advocate, plain-language editor,
teacher — and read the answer as it is written. Ask for a memo or a
deck and download it as Word or PowerPoint in Haij's template. A filter
in the browser stops personal data before it leaves the machine.

Every conversation is one person's: nobody else in the workspace can
see it, not the owner either. The workspace's administrator shapes the
frame — the system prompt, the roles, the task library, the filter —
and a person thinks inside it.

Makker is one tool in the [Haij](https://haij.dk) family and stands on
the Haij foundation, taken by way of
[Ajour](https://github.com/MartinNymannVinther/ajour),
[Tavle](https://github.com/MartinNymannVinther/tavle) and
[Domino](https://github.com/MartinNymannVinther/domino): Danish-first,
EU-sovereign, secure by design. The project constitution — dogmas,
principles, architecture and rules — lives in [CLAUDE.md](CLAUDE.md).
Decisions and their trade-offs live in [docs/adr](docs/adr/).

## Status

0.1, wave 0: the foundation from Domino (auth with passkeys and TOTP,
workspaces separated in the database, admission by invitation, the
audit log, CI, Docker), the product's tables with RLS, audit and
isolation tests, and an empty front door. The conversation itself, the
roles, the files and the exports arrive wave by wave (CLAUDE.md,
roadmap). Nothing has run real work yet; dogma seven is what 1.0 waits
for.

Makker grew out of a Python proof of concept that showed the whole
product on one machine with no database and no login. It lives on in
[`poc/`](poc/) as the reference for what Makker must do, tagged `poc`
at its last commit, and is not maintained beyond that (ADR 0001).

Much of the code is written together with Claude Code, under the rules
in [CLAUDE.md](CLAUDE.md). Every change is reviewed, tested and deployed
by a person; the tests for tenancy isolation are the part of the
codebase that is trusted least to good intentions.

## What it is

**A conversation is yours.** It is stored on the server, so it is there
tomorrow and on your phone, and it is stored under a policy in the
database that lets nobody but you read it — not a colleague, not the
workspace's owner, not a bug in the application.

**Roles, not prompts.** The workspace's administrator writes the system
prompt once. A role is laid over it for one conversation and never
replaces it, so the language and the frame hold whichever role a person
picks. The defaults are the POC's six; a workspace can change them.

**Tasks you can click.** A library of ready-made tasks — answer an
enquiry, summarise the document, challenge my plan — that fills the
writing field and picks the role that fits.

**Files as text.** PDF, Word, text and Markdown are read once at upload
and go into the conversation as text. The file stays with the
conversation and travels with the export.

**Two steps to a document.** The model delivers a memo or a deck as
structured content; a template layer shapes it into Word or PowerPoint.
The look is always Haij's, and the model never touches a layout.

**The filter runs in the browser.** Before anything is sent, the page
looks for national ID numbers, account numbers, addresses and words
that point at health, finances or criminal cases. It warns, and it
blocks what must not be sent. Nothing leaves the machine to be checked.

**Runs where you say.** Mistral at the EU endpoint, or Ollama on your
own machine, behind one adapter; the installation sets the default and
a workspace may choose its own. Those two, and no other.

## Haij-dogmerne

Makker lever efter familiens syv dogmer. De står her i Haijs egne ord.

1. **Ægte open source.** Al kode ligger offentligt under AGPL-3.0. Alt vi driver, kan hentes 1:1 og køres et andet sted eller lokalt, og der findes ingen funktioner der kun kan fås på haij.dk. En betalt udgave er i orden, men den bygger på den samme kode. Kloner man repoet, får man præcis det der kører på haij.dk.

2. **Egen drift.** Hvert værktøj kan køre i eget driftsmiljø på én server med Docker Compose, en Postgres og en lokal sprogmodel gennem Ollama, uden en eneste nøgle til en sky. Funktioner der forudsætter en ekstern tjeneste, som CVR-opslag eller e-faktura, siger det direkte og lader resten virke i stedet for at gå i stykker. Testen er enkel: afbryd forbindelsen til internettet, og alt væsentligt skal stadig virke.

3. **Dine data, altid.** Alt en organisation ejer kan hentes ud med ét klik i åbne formater (regneark, JSON, PDF) uden at spørge nogen, og slettes helt igen. At forlade Haij skal kunne gøres med få klik uden unødvendig friktion, og vi hjælper gerne med flytningen frem for at gøre den besværlig.

4. **EU eller egen drift.** Når vi hoster, ligger alt hos EU-ejede leverandører på EU-jord, sprogmodeller inklusive, og hvert værktøj har en offentlig liste over hvem der kan se hvad. Ingen amerikansk sky i driften. Koden ligger på GitHub, som er kodehosting og ikke kundedata; et spejl hos en europæisk forge kommer den dag det giver mening.

5. **AI'en hjælper, mennesket bestemmer.** AI må foreslå, skrive udkast og rette i planer, men aldrig sende noget ud af ”huset”, slette noget eller forpligte nogen uden at et menneske har sagt ja. Alt AI gør, kan fortrydes. Indhold hentet udefra behandles som data, aldrig som instruktioner.

6. **Sikkerhed fra første dag.** Organisationers data er adskilt i databasen, ikke kun i koden, og der skal være en test der beviser det. Alle ændringer registreres i en log der ikke kan redigeres. Passkeys og totrinslogin er der fra start, der er en offentlig vej til at melde sikkerhedshuller, og der ligger aldrig hemmeligheder i koden.

7. **Brugt i virkeligheden.** Intet af det vi selv har bygget kommer i vinduet før det har kørt rigtigt arbejde, hos os selv eller hos en kunde vi sidder tæt på. Værktøjer fra andre skal have et rigtigt brugssted vi kan pege på. Vi skal ikke have værktøjer liggende som ikke har skabt reel værdi i virkeligheden.

## Quickstart

Requirements: Node 22+, pnpm 10+ (`brew install pnpm`; newer Node builds no longer bundle corepack), Docker.

```bash
git clone https://github.com/MartinNymannVinther/makker.git && cd makker
pnpm install
cp .env.example .env                            # defaults work for local dev
docker compose -f docker-compose.dev.yml up -d --wait  # Postgres 16 + runtime roles, ready
pnpm db:migrate                                 # tables, RLS, audit triggers
pnpm dev                                        # http://localhost:3000
```

Register at `/register` — signup creates your user and your workspace —
then add a passkey under Indstillinger → Sikkerhed. Registration is closed
by default (`SIGNUP=closed`): an empty installation always lets the first
person in, the door shuts by itself once that account exists, and everyone
after that applies at `/register` and is admitted by the installation's
owner with a single-use link (Indstillinger → Adgang). Colleagues do not
apply: a member of a workspace invites them with a link from Indstillinger
→ Arbejdsrum.

```bash
pnpm test        # RLS isolation, the export, the gates
pnpm lint && pnpm typecheck
```

The tests run against the database from the compose file and never call
an AI model, so they pass offline and without keys.

Two things the first run can trip over, both of which `pnpm db:migrate`
names when they happen. The Postgres image has to be pulled and the
cluster initialised the first time, so `--wait` matters; a migrate fired
before that is done fails and leaves an empty database behind. And if
another Postgres already holds port 5432 on your machine (Haij's, Ajour's,
Tavle's or Domino's dev database, a local install), Makker's container
comes up without its port and the migration talks to the wrong server: set
`POSTGRES_PORT=5435` in `.env` and change the three URLs to match.

## Running it for real

[docs/launch.md](docs/launch.md) is the ordered checklist for taking an
installation live the first time, including the two steps that are painful
to get wrong: the public URL passkeys bind to, and creating the first
account before anybody else finds the address.
[docs/deploy.md](docs/deploy.md) is the deployment guide behind it: Docker
Compose on an EU VPS, with Coolify doing the plumbing. Which third parties can
see data, and what, is listed in
[docs/subprocessors.md](docs/subprocessors.md) — today that is the
hosting provider and the AI provider you choose. With `LLM_PROVIDER=ollama`
nothing leaves the server at all.

## Contributing and security

[CONTRIBUTING.md](CONTRIBUTING.md) explains how changes are made here:
plan first, vertical slices, tests where they matter, an ADR for every
decision worth arguing about later.
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) covers how we talk to each
other. Found a security problem? Please report it privately as described
in [SECURITY.md](SECURITY.md) rather than in a public issue.

What we know is not right yet is written down rather than hoped away:
[TECH-DEBT.md](TECH-DEBT.md) lists it, with the reason it is still there
and what fixing it would take.

License: [AGPL-3.0](LICENSE). The two typefaces the interface is set in ship in `public/fonts`, both under the SIL Open Font License 1.1: Archivo by the Archivo Project Authors ([OFL.txt](public/fonts/OFL.txt)) and Geist Mono by the Geist Project Authors ([OFL-Geist.txt](public/fonts/OFL-Geist.txt)). The `.woff2` files are Google Fonts' own subsets, copied in so that a build needs no network.
