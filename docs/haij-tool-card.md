# The tool card for haij.dk

The copy for Makker's card on haij.dk, in both languages, with the entry
proposed for the site's `tools.ts`. It belongs in the haij.dk repository;
it is written here with the finish (CLAUDE.md, wave 5) so it travels with
the release it describes. Dogma seven decides when it goes up: not before
a real week of real thinking out loud.

## Dansk

**Makker** — En at tænke højt med.

En chat oven på sprogmodeller der bliver i EU eller på din egen server.
Skriv som du taler, vedhæft et referat eller et udkast, vælg en rolle —
sparringspartner, djævlens advokat, sprogvasker, underviser — og læs
svaret mens det skrives. Bed om et notat eller et oplæg og hent det som
Word eller PowerPoint i Haijs skabelon. Et filter i browseren stopper
personoplysninger, før de forlader maskinen. Hver samtale er din egen:
ingen andre i arbejdsrummet kan se den, heller ikke chefen. Kører hos
Mistral i EU eller på din egen maskine med Ollama.

## English

**Makker** — Someone to think out loud with.

A chat on top of language models that stay in the EU or on your own
server. Write the way you talk, attach minutes or a draft, pick a role —
sparring partner, devil's advocate, plain-language editor, teacher — and
read the answer as it is written. Ask for a memo or a deck and download
it as Word or PowerPoint in Haij's template. A filter in the browser
stops personal data before it leaves the machine. Every conversation is
your own: nobody else in the workspace can see it, not the boss either.
Runs at Mistral in the EU or on your own machine with Ollama.

## The entry

```ts
{
  slug: "makker",
  name: "Makker",
  tagline: { da: "En at tænke højt med.", en: "Someone to think out loud with." },
  url: "https://makker.haij.dk",
  repo: "https://github.com/MartinNymannVinther/makker",
  license: "AGPL-3.0",
  status: "beta",
  selfHost: true,
  ai: { providers: ["mistral-eu", "ollama"], decides: "human" },
}
```
