/**
 * Haij's look, as hex, because neither a .docx nor a .pptx can read a
 * CSS variable. The values are the family's tokens from globals.css and
 * the POC's template script; a new design is a new file like this, not
 * a new prompt.
 *
 * The typeface is Arial: Archivo is not on the recipient's machine, and
 * Arial is the metric stand-in the web app falls back to anyway.
 */
export const HAIJ = {
  sender: "Haij",
  font: "Arial",
  paper: "F7F5F1",
  card: "FFFDFA",
  ink: "24221E",
  meta: "8A8479",
  moss: "4A6B53",
  mossLight: "7A9A80",
  mossPale: "C8D8CB",
  sand: "C9C2B6",
  hairline: "EAE5DC",
} as const;

const MONTHS_DA = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

/** "19. september 2026" in Danish, "19 September 2026" in English, in Copenhagen's day. */
export function documentDate(locale: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  if (locale === "en") return `${get("day")} ${get("month")} ${get("year")}`;
  const month = new Date(now).toLocaleString("en-GB", {
    timeZone: "Europe/Copenhagen",
    month: "numeric",
  });
  return `${get("day")}. ${MONTHS_DA[Number(month) - 1]} ${get("year")}`;
}
