import { asString, list, rec } from "@/modules/ai/sanitize-helpers";

/**
 * The contract with the model, and the shape a document is laid out
 * from. Kept small so the model hits it every time; anything it adds is
 * dropped, anything it forgets is empty, and the ceilings on a slide
 * are enforced here — not only in the prompt. A model that does not
 * listen must not be able to break a slide.
 *
 * The keys are English because they are a contract with a model, not
 * copy for a person; the instruction that names them is translated.
 */

export type Memo = {
  title: string;
  subtitle: string;
  summary: string;
  sections: Array<{ heading: string; paragraphs: string[]; bullets: string[] }>;
};

export type Slide =
  | { type: "section"; heading: string }
  | { type: "bullets"; heading: string; bullets: string[]; notes: string }
  | { type: "quote"; quote: string; source: string; notes: string };

export type Deck = { title: string; subtitle: string; slides: Slide[] };

/** As many bullets, and as many characters per bullet, as a slide holds without spilling. */
export const MAX_BULLETS = 6;
export const MAX_BULLET_CHARS = 110;
export const MAX_HEADING_CHARS = 70;
export const MAX_SLIDES = 20;
export const MAX_SECTIONS = 12;

const MEMO_SHAPE = `{
  "title": "short, precise document title",
  "subtitle": "one line that expands the title, or \\"\\"",
  "summary": "2-4 sentences that sum the document up, or \\"\\"",
  "sections": [
    {
      "heading": "the section's heading",
      "paragraphs": ["body text as whole paragraphs", "..."],
      "bullets": ["any points as a bulleted list"]
    }
  ]
}`;

const DECK_SHAPE = `{
  "title": "short title for the cover",
  "subtitle": "sender or presenter, e.g. \\"Sales\\"",
  "slides": [
    { "type": "section", "heading": "a short sentence that opens a new part" },
    {
      "type": "bullets",
      "heading": "the slide's heading",
      "bullets": ["short point", "short point"],
      "notes": "what you would say out loud to this slide"
    },
    { "type": "quote", "quote": "one central sentence that deserves its own slide", "source": "who or what it comes from" }
  ]
}`;

export const MEMO_INSTRUCTION = {
  da: `Du skal omsætte samtalen ovenfor til et struktureret dokument.

Svar KUN med JSON i præcis denne form — ingen forklaring, ingen markdown-kodeblok:

${MEMO_SHAPE}

Regler:
- Brug samme sprog som samtalen.
- Skriv hele, færdige sætninger i "paragraphs". Ingen markdown-tegn som ** eller # inde i teksterne.
- "bullets" må være en tom liste hvis sektionen ikke har punkter.
- Del stoffet i 2-6 sektioner.`,
  en: `Turn the conversation above into a structured document.

Answer ONLY with JSON in exactly this shape — no explanation, no markdown code block:

${MEMO_SHAPE}

Rules:
- Use the language of the conversation.
- Write whole, finished sentences in "paragraphs". No markdown characters like ** or # inside the texts.
- "bullets" may be an empty list when the section has no points.
- Divide the material into 2-6 sections.`,
};

export const DECK_INSTRUCTION = {
  da: `Du skal omsætte samtalen ovenfor til et slidedeck.

Svar KUN med JSON i præcis denne form — ingen forklaring, ingen markdown-kodeblok:

${DECK_SHAPE}

Regler:
- Brug samme sprog som samtalen.
- Højst ${MAX_BULLETS} punkter pr. slide, og højst ${MAX_BULLET_CHARS} tegn i hvert punkt. Et slide er ikke et dokument — skriv stikord, ikke hele sætninger.
- Læg det uddybende i "notes". Det er der, det hører hjemme.
- Ingen markdown-tegn som ** eller # inde i teksterne.
- Brug "section" til at dele oplægget op, og "quote" hvor en enkelt pointe skal stå alene. Varier — ikke alle slides skal være punkter.
- Lav ${MAX_SLIDES} slides eller færre. Typisk 6-12.`,
  en: `Turn the conversation above into a slide deck.

Answer ONLY with JSON in exactly this shape — no explanation, no markdown code block:

${DECK_SHAPE}

Rules:
- Use the language of the conversation.
- At most ${MAX_BULLETS} bullets per slide, and at most ${MAX_BULLET_CHARS} characters per bullet. A slide is not a document — write cues, not whole sentences.
- Put the detail in "notes". That is where it belongs.
- No markdown characters like ** or # inside the texts.
- Use "section" to divide the deck, and "quote" where one point should stand alone. Vary — not every slide should be bullets.
- Make ${MAX_SLIDES} slides or fewer. Typically 6-12.`,
};

const strings = (v: unknown, max: number, each = 2000): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => asString(x, "", each))
    .filter(Boolean)
    .slice(0, max);

export function sanitizeMemo(data: unknown, fallbackTitle: string): Memo {
  const d = rec(data);
  return {
    title: asString(d.title, "", 200) || fallbackTitle,
    subtitle: asString(d.subtitle, "", 200),
    summary: asString(d.summary, "", 2000),
    sections: list(d.sections)
      .map((s) => ({
        heading: asString(s.heading, "", 200),
        paragraphs: strings(s.paragraphs, 30),
        bullets: strings(s.bullets, 30),
      }))
      .filter((s) => s.heading || s.paragraphs.length || s.bullets.length)
      .slice(0, MAX_SECTIONS),
  };
}

/** Cut a bullet that is too long at the nearest space, and say so with an ellipsis. */
export function shorten(text: string, limit = MAX_BULLET_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit).replace(/\s+\S*$/, "");
  return `${(cut || trimmed.slice(0, limit)).replace(/[ ,.;:]+$/, "")} …`;
}

export function sanitizeDeck(data: unknown, fallbackTitle: string): Deck {
  const d = rec(data);
  const slides: Slide[] = [];
  for (const raw of list(d.slides).slice(0, MAX_SLIDES)) {
    const type = asString(raw.type, "", 20).toLowerCase();
    const heading = shorten(asString(raw.heading, "", 400), MAX_HEADING_CHARS);
    const notes = asString(raw.notes, "", 4000);
    if (type === "section") {
      if (heading) slides.push({ type: "section", heading });
      continue;
    }
    if (type === "quote") {
      const quote = asString(raw.quote, "", 600) || heading;
      if (quote)
        slides.push({ type: "quote", quote, source: asString(raw.source, "", 200), notes });
      continue;
    }
    const all = strings(raw.bullets, 40, 600).map((b) => shorten(b));
    const bullets = all.slice(0, MAX_BULLETS);
    // What could not fit on the slide is not lost: it goes to the notes.
    const left = all.slice(MAX_BULLETS);
    const withLeft =
      left.length > 0
        ? `${notes}\n\nUdeladt fra slidet:\n${left.map((b) => `- ${b}`).join("\n")}`.trim()
        : notes;
    if (!heading && bullets.length === 0) continue;
    slides.push({ type: "bullets", heading, bullets, notes: withLeft });
  }
  return {
    title: asString(d.title, "", 200) || fallbackTitle,
    subtitle: asString(d.subtitle, "", 200),
    slides,
  };
}

/** "Årsrapport 2026" → "aarsrapport-2026.docx": safe in every browser. */
export function documentFileName(title: string, extension: "docx" | "pptx"): string {
  const slug =
    title
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "dokument";
  return `${slug}.${extension}`;
}
