import type { AiFailure } from "@/modules/ai/wire";

/**
 * What the conversation route sends and the page reads, in one place
 * because both sides must agree and neither may import the other's
 * world. This file imports nothing but types, and that is its job.
 */

export type ChatStreamEvent =
  /** First, once: which conversation the line landed in, and as which row. */
  | { type: "meta"; conversationId: string; userMessageId: string | null }
  | { type: "delta"; text: string }
  /** Last on success: the row the answer was saved as, and why the model stopped. */
  | {
      type: "done";
      assistantMessageId: string;
      finish: "stop" | "length" | "unknown";
      engine: string;
    }
  /** Last on failure, after whatever text got through. */
  | { type: "error"; error: ChatFailure };

export type ChatFailure = AiFailure | "invalid" | "notFound" | "unauthorized" | "empty";

/** Files a single line may carry. */
export const MAX_FILES_PER_MESSAGE = 10;

/** One event as a server-sent event. */
export function encodeEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * The events in a piece of the stream, and what is left over. A chunk
 * from the network ends wherever it likes, so the tail that is not yet a
 * whole line is handed back to be prepended to the next piece.
 */
export function decodeEvents(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const events: ChatStreamEvent[] = [];
  let rest = buffer;
  for (;;) {
    const at = rest.indexOf("\n\n");
    if (at === -1) break;
    const frame = rest.slice(0, at);
    rest = rest.slice(at + 2);
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
        if (parsed && typeof parsed === "object" && typeof parsed.type === "string")
          events.push(parsed);
      } catch {
        // A frame that is not ours; the next one may be.
      }
    }
  }
  return { events, rest };
}
