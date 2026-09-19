import PptxGenJS from "pptxgenjs";
import { HAIJ, documentDate } from "./haij";
import type { Deck } from "./schema";

/**
 * A deck as a PowerPoint in Haij's template: the four slides the POC's
 * template had — cover, section, bullets, quote — drawn here rather than
 * read from a .pptx, because pptxgenjs writes files and does not open
 * them. The geometry is the template script's (poc/templates), in
 * inches on a 16:9 page.
 */

const PAGE = { w: 13.333, h: 7.5 };
const MARGIN = 0.8;

type Slide = ReturnType<PptxGenJS["addSlide"]>;

/** The Haij mark: three left-aligned bars, long-short-medium. */
function mark(slide: Slide, x: number, y: number, width: number, colors: [string, string, string]) {
  const unit = width / 38;
  const bars: Array<[number, number]> = [
    [0, 38],
    [13, 25],
    [26, 31],
  ];
  bars.forEach(([top, w], i) => {
    slide.addShape("roundRect", {
      x,
      y: y + top * unit,
      w: w * unit,
      h: 8 * unit,
      fill: { color: colors[i]! },
      line: { color: colors[i]!, width: 0 },
      rectRadius: 2.5 * unit,
    });
  });
}

export async function buildPptx(deck: Deck, locale: string): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "haij", width: PAGE.w, height: PAGE.h });
  pptx.layout = "haij";
  pptx.author = HAIJ.sender;
  pptx.title = deck.title;
  const font = HAIJ.font;
  const width = PAGE.w - 2 * MARGIN;

  // Cover.
  const cover = pptx.addSlide();
  cover.background = { color: HAIJ.paper };
  mark(cover, MARGIN, MARGIN, 0.9, [HAIJ.moss, HAIJ.mossLight, HAIJ.sand]);
  cover.addText(deck.title, {
    x: MARGIN,
    y: 2.6,
    w: width,
    h: 2.2,
    fontFace: font,
    fontSize: 48,
    bold: true,
    color: HAIJ.ink,
    valign: "bottom",
    fit: "shrink",
  });
  const under = deck.subtitle || HAIJ.sender;
  cover.addText(`${under} · ${documentDate(locale)}`, {
    x: MARGIN,
    y: 4.95,
    w: width,
    h: 0.9,
    fontFace: font,
    fontSize: 18,
    color: HAIJ.meta,
    valign: "top",
  });

  for (const item of deck.slides) {
    const slide = pptx.addSlide();
    if (item.type === "section") {
      slide.background = { color: HAIJ.moss };
      mark(slide, MARGIN, MARGIN, 0.55, [HAIJ.paper, HAIJ.mossPale, HAIJ.mossLight]);
      slide.addText(item.heading, {
        x: MARGIN,
        y: 2.4,
        w: width,
        h: 2.6,
        fontFace: font,
        fontSize: 40,
        bold: true,
        color: HAIJ.paper,
        valign: "middle",
        fit: "shrink",
      });
      continue;
    }
    if (item.type === "quote") {
      slide.background = { color: HAIJ.card };
      mark(slide, MARGIN, MARGIN, 0.55, [HAIJ.moss, HAIJ.mossLight, HAIJ.sand]);
      slide.addText(item.quote, {
        x: 1.6,
        y: 2.0,
        w: PAGE.w - 3.2,
        h: 3.0,
        fontFace: font,
        fontSize: 32,
        color: HAIJ.moss,
        valign: "middle",
        lineSpacingMultiple: 1.2,
        fit: "shrink",
      });
      if (item.source)
        slide.addText(item.source, {
          x: 1.6,
          y: 5.2,
          w: PAGE.w - 3.2,
          h: 0.7,
          fontFace: font,
          fontSize: 16,
          color: HAIJ.meta,
          valign: "top",
        });
      if (item.notes) slide.addNotes(item.notes);
      continue;
    }
    slide.background = { color: HAIJ.paper };
    mark(slide, PAGE.w - MARGIN - 0.4, PAGE.h - MARGIN - 0.36, 0.4, [
      HAIJ.moss,
      HAIJ.mossLight,
      HAIJ.sand,
    ]);
    if (item.heading)
      slide.addText(item.heading, {
        x: MARGIN,
        y: 0.6,
        w: width,
        h: 1.1,
        fontFace: font,
        fontSize: 32,
        bold: true,
        color: HAIJ.ink,
        valign: "bottom",
        fit: "shrink",
      });
    slide.addShape("rect", {
      x: MARGIN,
      y: 1.8,
      w: width,
      h: 0.02,
      fill: { color: HAIJ.moss },
      line: { color: HAIJ.moss, width: 0 },
    });
    if (item.bullets.length > 0)
      slide.addText(
        item.bullets.map((bullet) => ({
          text: bullet,
          options: { bullet: { indent: 18 }, breakLine: true },
        })),
        {
          x: MARGIN,
          y: 2.0,
          w: width,
          h: 4.5,
          fontFace: font,
          fontSize: 20,
          color: HAIJ.ink,
          valign: "top",
          lineSpacingMultiple: 1.15,
          paraSpaceAfter: 8,
          fit: "shrink",
        },
      );
    if (item.notes) slide.addNotes(item.notes);
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
