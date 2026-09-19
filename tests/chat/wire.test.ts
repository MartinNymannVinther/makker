import { describe, expect, it } from "vitest";
import { sanitizeTitle } from "@/modules/chat/title";
import { decodeEvents, encodeEvent, type ChatStreamEvent } from "@/modules/chat/wire";

/**
 * The stream between the route and the page: whatever the network does
 * to the framing, the events come out whole and in order, and a title
 * comes out as one clean line.
 */
describe("the chat stream", () => {
  const events: ChatStreamEvent[] = [
    { type: "meta", conversationId: "c1", userMessageId: "m1" },
    { type: "delta", text: "Hej\n\nMartin" },
    { type: "done", assistantMessageId: "m2", finish: "stop", engine: "ollama:x" },
  ];

  it("survives being cut anywhere", () => {
    const wire = events.map(encodeEvent).join("");
    for (const cut of [1, 10, wire.indexOf("\n\n") + 1, wire.length - 3]) {
      const first = decodeEvents(wire.slice(0, cut));
      const second = decodeEvents(first.rest + wire.slice(cut));
      expect([...first.events, ...second.events]).toEqual(events);
      expect(second.rest).toBe("");
    }
  });

  it("skips frames that are not ours", () => {
    const { events: seen } = decodeEvents(": ping\n\ndata: not json\n\n" + encodeEvent(events[1]!));
    expect(seen).toEqual([events[1]]);
  });
});

describe("sanitizeTitle", () => {
  it("takes one clean line and nothing else", () => {
    expect(sanitizeTitle({ title: ' "Budget for næste år." ' })).toBe("Budget for næste år");
    expect(sanitizeTitle({ title: "Linje et\nlinje to" })).toBe("Linje et linje to");
    expect(sanitizeTitle({ title: "x".repeat(300) })).toHaveLength(120);
    expect(sanitizeTitle({ nope: 1 })).toBe("");
    expect(sanitizeTitle("string")).toBe("");
  });
});
