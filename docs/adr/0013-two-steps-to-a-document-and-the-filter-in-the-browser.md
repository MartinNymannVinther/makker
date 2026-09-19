# ADR 0013: Two steps to a document, and the filter stays in the browser

Status: accepted · Date: 2026-09-19

## Context

Two things the POC got right and Makker keeps, written down so they
survive the port.

**Documents.** A model asked for a Word file produces a Word file badly,
if at all. The POC never asked. It asked for content in a small JSON
shape — a title, sections, paragraphs, bullets; for a deck, slides of
three kinds with speaker notes — and a template layer poured that into
a `.docx` or `.pptx` with Haij's look. Every document looked the same
whatever the model came up with, and a new design was a new template,
not a new prompt.

**The filter.** The POC scanned every line for personal data before it
was sent — national ID numbers, card and account numbers, e-mail,
phone, diagnosis codes, an introduced name — and for words that point
at GDPR article 9 categories. It ran in the browser and nowhere else:
what it found never left the machine, and the server never saw a line
that was stopped.

## Decision

**Two steps, enforced in code.** `src/modules/documents` asks the model
through `askForJson()` with an instruction that names the shape and its
limits; `sanitizeMemo()` and `sanitizeDeck()` cut the answer to that
shape and enforce the slide's ceilings — six bullets, 110 characters
each, twenty slides — whether or not the model listened, and what did
not fit on a slide goes to its notes rather than being lost. Only then
do `buildDocx()` (the `docx` package) and `buildPptx()` (`pptxgenjs`)
lay it out. The model never sees an Office file and the builders never
see the model.

The look is Haij's tokens as hex (`haij.ts`), because neither format
can read a CSS variable, and the typeface is Arial, because Archivo is
not on the recipient's machine and Arial is what the web app falls back
to anyway. The PowerPoint template the POC kept as a `.pptx` is drawn
in code here: `pptxgenjs` writes files and does not open them, and four
slide layouts are less to carry than a binary nobody can diff.

**The filter in the browser, its tuning on the server.** `src/lib/pii.ts`
is the POC's filter as a framework-free module with its own tests. It
runs in the chat page on every keystroke and blocks at send; the three
ways on — edit, send anyway, switch off for this conversation — are the
person's, on the page, and nothing of them reaches the server. What the
filter looks for is the workspace's: the administrator switches
patterns and hint groups off, adds words to a hint group, and decides
whether a hint alone may block, under Settings → Library. Those settings
travel to the page with the conversation; the text never travels the
other way to be checked.

Names are keys, not labels: `cpr`, `health`, and so on. The interface
translates them, and the settings store them, so a renamed label does
not silently re-enable a pattern somebody switched off.

## Alternatives rejected

- **The filter on the server.** One place, no browser code, and every
  finding is a line the server has already received. The point of the
  filter is that it is not.
- **A model-written document.** Ask for markdown and convert it. The
  layout would be whatever the model felt like, different every time,
  and the ceilings on a slide would be a hope.
- **The POC's `.pptx` template, opened and filled.** Faithful, and not
  possible with a library that only writes. A library that opens
  `.pptx` files is a heavier dependency than four layouts in code.

## Trade-offs accepted

- **Two new dependencies**, `docx` and `pptxgenjs`, both pure
  JavaScript, both already in the family's lockfiles (Tavle ships
  `pptxgenjs`). Asked for and granted with wave 4's mandate.
- **The filter is a reminder, not a guarantee**, and its notice says so
  in as many words: it does not see names or health written freely, it
  does not look inside attached files, and it knows nothing of the
  workspace's legal basis.
- **"Off for this conversation" is off for this page.** It lasts as
  long as the tab. A person who wants it off for good asks their
  administrator; that is the right person to ask.
- **The Word cover is a page of its own.** A one-paragraph memo gets a
  cover and a page break, as the POC's did. A shorter form is a later
  choice, and it is a template's choice.
