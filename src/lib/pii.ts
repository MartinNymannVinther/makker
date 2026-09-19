/**
 * The personal-data filter. Runs only in the browser: the text is
 * scanned on the person's own machine before it is sent, nothing the
 * filter finds leaves the device, and this file never talks to the
 * server. Framework-free on purpose, so it is tested on its own and
 * could move as it is.
 *
 * Two kinds of result, and the difference matters:
 *
 *   FINDING  a recognised format — a national ID number, an e-mail, an
 *            account number. Precise enough to block sending.
 *   HINT     words that tend to come with the special categories of GDPR
 *            article 9, health above all. A guess, not a match, so it
 *            does not block on its own: a filter that shouts every time
 *            somebody writes "sygemeldt" is a filter people stop reading.
 *
 * It cannot list every GDPR problem. It knows nothing of the workspace's
 * legal basis and cannot see names or health written freely in prose.
 * A reminder, not a guarantee — and the notice says so.
 *
 * Names are keys, not labels: the interface translates them, and the
 * administrator's settings store them (docs/adr/0013).
 */

export type Pattern = {
  key: string;
  regex: RegExp;
  /** Which capture is the finding itself, when not the whole match. */
  group?: number;
  /** An extra check on the match, to keep false alarms down. */
  check?: (match: RegExpExecArray) => boolean;
};

export type HintGroup = {
  key: string;
  words: string[];
};

export type Finding = { key: string; text: string; start: number; end: number };
export type Hint = { key: string; words: string[] };
export type ScanResult = { findings: Finding[]; hints: Hint[] };

export type PiiSettings = {
  /** Keys of patterns and hint groups switched off by the administrator. */
  disabled: string[];
  /** Extra words per hint group, e.g. { health: ["migræne"] }. */
  extraWords: Record<string, string[]>;
};

const digitsOnly = (s: string) => s.replace(/\D/g, "");

function validDate(day: string, month: string): boolean {
  const d = Number(day);
  const m = Number(month);
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
}

/** Luhn: the check-digit algorithm every payment card uses. */
export function luhn(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * IBAN mod-97: move the first four characters to the end, turn letters
 * into numbers, divide. A remainder of 1 means the check digits are right.
 */
export function iban97(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const char of moved) {
    const value = /[A-Z]/.test(char) ? char.charCodeAt(0) - 55 : Number(char);
    if (Number.isNaN(value)) return false;
    rest = (rest * (value > 9 ? 100 : 10) + value) % 97;
  }
  return rest === 1;
}

/**
 * The recognised formats, in order of priority: the first pattern that
 * hits a piece of text wins, so a national ID number is not also
 * reported as something else.
 */
export const PATTERNS: Pattern[] = [
  {
    key: "cpr",
    // With the hyphen in the CPR position the signal is strong enough on
    // its own; test numbers rarely carry a valid birth date, and a missed
    // number is worse than a false alarm.
    regex: /\b\d{6}-\d{4}\b/g,
  },
  {
    key: "cpr",
    // Without the hyphen a valid day and month are required, or every
    // ten-digit number would be reported.
    regex: /\b(\d{2})(\d{2})(\d{2})(\d{4})\b/g,
    check: (m) => validDate(m[1]!, m[2]!),
  },
  {
    key: "card",
    regex: /\b(?:\d[ -]?){12,18}\d\b/g,
    check: (m) => luhn(digitsOnly(m[0])),
  },
  {
    key: "iban",
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    check: (m) => iban97(m[0]),
  },
  {
    key: "account",
    // Danish registration number plus account number, e.g. "1234 5678901".
    regex: /\b\d{4}[ -]\d{6,10}\b/g,
  },
  {
    key: "email",
    regex: /\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/g,
  },
  {
    key: "phone",
    // A Danish number: eight digits starting 2–9. Either +45 in front, or
    // no digit up against it — without that guard the pattern fishes eight
    // digits out of the middle of a card number.
    regex: /(?:\+45[ ]?|(?<!\d)(?<!\d[ ]))[2-9](?:[ ]?\d){7}(?!\d)(?![ ]\d)/g,
  },
  {
    key: "icd",
    // ICD-10, either the Danish form with a D in front (DF432) or with a
    // decimal (F43.2). A letter and two digits alone is too loose: "B12"
    // is as often a vitamin as a diagnosis.
    regex: /\b(?:D[A-Z]\d{2}\d?|[A-Z]\d{2}\.\d{1,2})\b/g,
  },
  {
    key: "name",
    // Only when somebody introduces themselves. Guessing names freely in
    // Danish prose gives far too many false alarms: every word that opens
    // a sentence has a capital.
    regex:
      /(?:[Jj]eg hedder|[Mm]it navn er|[Uu]ndertegnede er)\s+([A-ZÆØÅ][a-zæøå]+(?:[ -][A-ZÆØÅ][a-zæøå]+){0,2})/g,
    group: 1,
  },
];

/**
 * Words that point at the special categories of GDPR article 9. The
 * lists are short and specific on purpose: "behandling" and "stress" are
 * not here, because they appear in ordinary case text all the time.
 */
export const HINTS: HintGroup[] = [
  {
    key: "health",
    words: [
      "sygemeldt",
      "sygemelding",
      "sygemeldingen",
      "sygdom",
      "diagnose",
      "diagnosen",
      "diagnosticeret",
      "lægeerklæring",
      "læge",
      "lægen",
      "psykiater",
      "psykolog",
      "indlagt",
      "depression",
      "angst",
      "kronisk",
      "recept",
      "helbred",
      "helbredet",
      "journal",
    ],
  },
  {
    key: "union",
    words: [
      "fagforening",
      "fagforeningen",
      "tillidsrepræsentant",
      "tillidsmand",
      "overenskomstforhandling",
    ],
  },
];

/** Every key the settings page can switch off: the patterns first, then the hints. */
export function allKeys(): string[] {
  return [...new Set(PATTERNS.map((p) => p.key)), ...HINTS.map((h) => h.key)];
}

export const NO_SETTINGS: PiiSettings = { disabled: [], extraWords: {} };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findFindings(text: string, settings: PiiSettings): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of PATTERNS) {
    if (settings.disabled.includes(pattern.key)) continue;
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      // An empty match would spin the loop.
      if (match[0] === "") {
        pattern.regex.lastIndex += 1;
        continue;
      }
      if (pattern.check && !pattern.check(match)) continue;
      const part = pattern.group ? match[pattern.group] : match[0];
      if (!part) continue;
      const start = match.index + (pattern.group ? match[0].indexOf(part) : 0);
      const end = start + part.length;
      // Overlapping something already taken, the first pattern in the
      // list wins — it is the more specific one.
      if (findings.some((f) => start < f.end && end > f.start)) continue;
      findings.push({ key: pattern.key, text: part, start, end });
    }
  }
  return findings.sort((a, b) => a.start - b.start);
}

function findHints(text: string, settings: PiiSettings): Hint[] {
  const hints: Hint[] = [];
  for (const group of HINTS) {
    if (settings.disabled.includes(group.key)) continue;
    const words = [...group.words, ...(settings.extraWords[group.key] ?? [])];
    const hit = words.filter((word) => new RegExp(`\\b${escape(word)}\\b`, "i").test(text));
    if (hit.length > 0) hints.push({ key: group.key, words: hit });
  }
  return hints;
}

/** Scan a text. Findings block; hints inform. */
export function scan(text: string, settings: PiiSettings = NO_SETTINGS): ScanResult {
  if (!text) return { findings: [], hints: [] };
  return { findings: findFindings(text, settings), hints: findHints(text, settings) };
}
