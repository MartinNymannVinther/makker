import { describe, expect, it } from "vitest";
import { buildDocx } from "@/modules/documents/docx";
import { documentDate } from "@/modules/documents/haij";
import { buildPptx } from "@/modules/documents/pptx";
import {
  documentFileName,
  MAX_BULLETS,
  sanitizeDeck,
  sanitizeMemo,
  shorten,
} from "@/modules/documents/schema";

/**
 * The two steps to a document (docs/adr/0013): what the model wrote is
 * cut to the schema's shape with the slide's ceilings enforced, and the
 * template layer turns that shape into a file that opens.
 */
describe("the memo the model wrote", () => {
  it("is cut to shape, and empty where the model forgot", () => {
    const memo = sanitizeMemo(
      {
        title: " Budget 2027 ",
        sections: [
          { heading: "Baggrund", paragraphs: ["Et afsnit.", 42, ""], bullets: ["Punkt"] },
          { heading: "", paragraphs: [], bullets: [] },
          "not a section",
        ],
        extra: "dropped",
      },
      "Dokument",
    );
    expect(memo).toEqual({
      title: "Budget 2027",
      subtitle: "",
      summary: "",
      sections: [{ heading: "Baggrund", paragraphs: ["Et afsnit."], bullets: ["Punkt"] }],
    });
    expect(sanitizeMemo(null, "Samtale").title).toBe("Samtale");
  });
});

describe("the deck the model wrote", () => {
  it("enforces the slide's ceilings and keeps what did not fit in the notes", () => {
    const deck = sanitizeDeck(
      {
        title: "Oplæg",
        slides: [
          { type: "section", heading: "Del et" },
          {
            type: "bullets",
            heading: "x".repeat(100),
            bullets: Array.from({ length: 9 }, (_, i) => `Punkt ${i + 1} ${"lang ".repeat(30)}`),
            notes: "Sig noget.",
          },
          { type: "quote", quote: "Én sætning.", source: "Nogen" },
          { type: "weird", heading: "", bullets: [] },
          { type: "section", heading: "" },
        ],
      },
      "Oplæg",
    );
    expect(deck.slides.map((s) => s.type)).toEqual(["section", "bullets", "quote"]);
    const bullets = deck.slides[1]!;
    if (bullets.type !== "bullets") throw new Error("expected bullets");
    expect(bullets.heading.length).toBeLessThanOrEqual(72);
    expect(bullets.bullets).toHaveLength(MAX_BULLETS);
    for (const b of bullets.bullets) expect(b.length).toBeLessThanOrEqual(112);
    expect(bullets.notes).toContain("Sig noget.");
    expect(bullets.notes).toContain("Udeladt fra slidet:");
    expect(bullets.notes).toContain("Punkt 7");
  });

  it("shortens at a space and says so", () => {
    expect(shorten("kort")).toBe("kort");
    const long = shorten("ord ".repeat(60));
    expect(long.endsWith(" …")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(112);
  });
});

describe("the files", () => {
  it("names them safely and dates them in the reader's language", () => {
    expect(documentFileName("Årsrapport 2026: Ø & Æ", "docx")).toBe("aarsrapport-2026-oe-ae.docx");
    expect(documentFileName("", "pptx")).toBe("dokument.pptx");
    const day = new Date("2026-09-19T10:00:00Z");
    expect(documentDate("da", day)).toBe("19. september 2026");
    expect(documentDate("en", day)).toBe("19 September 2026");
  });

  it("builds a Word document and a PowerPoint that open as zip archives", async () => {
    const docx = await buildDocx(
      {
        title: "Notat",
        subtitle: "Om noget",
        summary: "Kort sagt.",
        sections: [{ heading: "Et", paragraphs: ["Afsnit."], bullets: ["Punkt", "Punkt to"] }],
      },
      "da",
    );
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(docx.length).toBeGreaterThan(2000);

    const pptx = await buildPptx(
      {
        title: "Oplæg",
        subtitle: "Salg",
        slides: [
          { type: "section", heading: "Del et" },
          { type: "bullets", heading: "Punkter", bullets: ["a", "b"], notes: "Noter" },
          { type: "quote", quote: "Én sætning.", source: "Nogen", notes: "" },
        ],
      },
      "en",
    );
    expect(pptx.subarray(0, 2).toString()).toBe("PK");
    expect(pptx.length).toBeGreaterThan(5000);
  });
});
