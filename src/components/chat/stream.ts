import { decodeEvents, type ChatStreamEvent } from "@/modules/chat/wire";

/**
 * The route's answer, event by event, as it arrives. The framing is the
 * wire's (src/modules/chat/wire); this only turns a body into calls of
 * `handle`, and hands the last frame over even when the server closed
 * without a trailing blank line.
 */
export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  handle: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += decoder.decode(value, { stream: true });
    const decoded = decodeEvents(rest);
    rest = decoded.rest;
    decoded.events.forEach(handle);
  }
  decodeEvents(rest + "\n\n").events.forEach(handle);
}
