import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { HAIJ, documentDate } from "./haij";
import type { Memo } from "./schema";

/**
 * A memo as a Word document in Haij's template. The model wrote the
 * content; nothing here reads it as anything but text. A cover with the
 * sender, the title and the date, then the summary and the sections,
 * with the page number in the foot.
 */
export async function buildDocx(memo: Memo, locale: string): Promise<Buffer> {
  const summaryHeading = locale === "en" ? "Summary" : "Resumé";
  const pageWord = locale === "en" ? "page" : "side";

  const cover: Paragraph[] = [
    new Paragraph({ spacing: { before: 2400 } }),
    new Paragraph({
      children: [
        new TextRun({ text: HAIJ.sender.toUpperCase(), bold: true, size: 20, color: HAIJ.moss }),
      ],
    }),
    new Paragraph({
      spacing: { before: 120 },
      children: [new TextRun({ text: memo.title, bold: true, size: 56 })],
    }),
    ...(memo.subtitle
      ? [
          new Paragraph({
            children: [new TextRun({ text: memo.subtitle, size: 26, color: "606060" })],
          }),
        ]
      : []),
    new Paragraph({
      spacing: { before: 360 },
      children: [new TextRun({ text: documentDate(locale), size: 20, color: "606060" })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const body: Paragraph[] = [];
  if (memo.summary) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: summaryHeading }));
    body.push(new Paragraph({ text: memo.summary }));
  }
  for (const section of memo.sections) {
    if (section.heading)
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: section.heading }));
    for (const paragraph of section.paragraphs) body.push(new Paragraph({ text: paragraph }));
    for (const bullet of section.bullets)
      body.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
  }

  const document = new Document({
    creator: HAIJ.sender,
    title: memo.title,
    styles: {
      default: {
        document: { run: { font: HAIJ.font, size: 22 } },
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: HAIJ.font, size: 22 },
          paragraph: { spacing: { after: 160, line: 276 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HAIJ.font, size: 30, bold: true, color: HAIJ.moss },
          paragraph: { spacing: { before: 320, after: 80 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HAIJ.font, size: 24, bold: true, color: HAIJ.moss },
          paragraph: { spacing: { before: 240, after: 80 } },
        },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${HAIJ.sender}  ·  ${pageWord} `,
                    size: 16,
                    color: "808080",
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "808080" }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });

  return Packer.toBuffer(document);
}
