import type { LlmMessage } from "@/core/llm";
import { DATA_RULE, fenceUntrusted } from "@/modules/ai/prompting";

/**
 * The prompt a conversation becomes. The workspace's system prompt
 * first, the role laid over it, then every line so far, and the text of
 * the files each line carried — fenced as data, because a document can
 * say "ignore your instructions" and inside the fence it is a document
 * that says that.
 *
 * The person's own lines are not fenced: they are the instructions.
 * That is the difference between what a person typed and what a file
 * contained, and it is the whole point of the fence.
 */

/** A file's text in a prompt; longer is cut, and the cut is said. */
export const MAX_CHARS_PER_FILE = 60_000;

/** Everything the model reads, at most; the oldest lines go first. */
export const MAX_PROMPT_CHARS = 240_000;

export type PromptLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type PromptAttachment = {
  messageId: string;
  name: string;
  text: string | null;
  error: string | null;
};

export type PromptInput = {
  systemPrompt: string;
  roleInstruction: string;
  lines: PromptLine[];
  attachments: PromptAttachment[];
  /** Ask the model to go on from where its last line stopped. */
  continueLast?: boolean;
  locale: string;
};

const CONTINUE = {
  da: "Fortsæt præcis hvor du slap. Dit forrige svar blev afbrudt midt i en sætning. Genoptag fra det allersidste tegn — gentag ikke noget, spring intet over, og skriv ingen indledning eller forklaring.",
  en: "Continue exactly where you stopped. Your previous answer was cut off mid-sentence. Resume from the very last character — repeat nothing, skip nothing, and write no introduction or explanation.",
};

/**
 * Cut off inside a ``` block, the model does not know it, and opens a
 * new one. That splits the code in two and can lose a piece in the
 * seam, so it is said outright.
 */
const CONTINUE_IN_CODE = {
  da: "\n\nVIGTIGT: dit forrige svar stoppede INDE i en kodeblok, som stadig er åben. Skriv IKKE ``` igen, og skriv ikke sprognavnet. Fortsæt kun den rå kode fra det tegn hvor den slap, og luk blokken med ``` når koden er færdig.",
  en: "\n\nIMPORTANT: your previous answer stopped INSIDE a code block that is still open. Do NOT write ``` again, and do not write the language name. Continue only the raw code from the character where it stopped, and close the block with ``` when the code is done.",
};

/** Was the last answer cut off inside a ``` block? */
export function endsInOpenCodeBlock(lines: PromptLine[]): boolean {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.role === "assistant") return (line.content.match(/```/g) ?? []).length % 2 === 1;
  }
  return false;
}

function attachmentBlock(attachment: PromptAttachment, locale: string): string {
  const label = locale === "en" ? "Attached file" : "Vedhæftet fil";
  if (attachment.text === null) {
    const why =
      locale === "en" ? "no text could be read out of it" : "der kunne ikke læses tekst ud af den";
    return `${label}: ${attachment.name} (${why}: ${attachment.error ?? "unknown"})`;
  }
  const cut = attachment.text.length > MAX_CHARS_PER_FILE;
  const text = cut ? attachment.text.slice(0, MAX_CHARS_PER_FILE) : attachment.text;
  const note = cut
    ? locale === "en"
      ? " (cut after 60,000 characters)"
      : " (klippet efter 60.000 tegn)"
    : "";
  return `${label}: ${attachment.name}${note}\n${fenceUntrusted(text, MAX_CHARS_PER_FILE + 10)}`;
}

export function buildPrompt(input: PromptInput): LlmMessage[] {
  const locale = input.locale === "en" ? "en" : "da";
  const byMessage = new Map<string, PromptAttachment[]>();
  for (const attachment of input.attachments) {
    const list = byMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    byMessage.set(attachment.messageId, list);
  }

  const system = [input.systemPrompt.trim(), input.roleInstruction.trim()]
    .filter(Boolean)
    .join("\n\n");
  const rule = input.attachments.length > 0 ? `\n\n${DATA_RULE}` : "";

  const turns: LlmMessage[] = input.lines.map((line) => {
    const attached = byMessage.get(line.id) ?? [];
    const blocks = attached.map((attachment) => attachmentBlock(attachment, locale));
    return {
      role: line.role,
      content: [line.content, ...blocks].filter(Boolean).join("\n\n"),
    };
  });

  if (input.continueLast) {
    const inCode = endsInOpenCodeBlock(input.lines) ? CONTINUE_IN_CODE[locale] : "";
    turns.push({ role: "user", content: CONTINUE[locale] + inCode });
  }

  // The newest lines are the ones the model must see; when the whole
  // conversation no longer fits, the oldest go first, whole lines at a
  // time, so the model is never handed half a message.
  let total = system.length + rule.length + turns.reduce((n, t) => n + t.content.length, 0);
  let from = 0;
  while (total > MAX_PROMPT_CHARS && from < turns.length - 1) {
    total -= turns[from]!.content.length;
    from += 1;
  }

  return [{ role: "system", content: system + rule }, ...turns.slice(from)];
}
