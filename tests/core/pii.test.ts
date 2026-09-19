import { describe, expect, it } from "vitest";
import { allKeys, iban97, luhn, scan } from "@/lib/pii";

/**
 * The filter that runs in the browser, proven here without one. The
 * POC's patterns, carried over with the cases that shaped them: a
 * national ID number is found with or without its hyphen, a card number
 * only when Luhn agrees, a phone number never out of the middle of a
 * card, and a name only when somebody introduces themselves.
 */
describe("the personal-data filter", () => {
  it("finds a CPR number, hyphenated or with a valid date", () => {
    expect(scan("Mit cpr er 010190-1234.").findings).toMatchObject([
      { key: "cpr", text: "010190-1234", start: 11, end: 22 },
    ]);
    expect(scan("0101901234").findings.map((f) => f.key)).toEqual(["cpr"]);
    // Day 99 is no date, and ten digits alone are just a number.
    expect(scan("9901901234").findings).toEqual([]);
  });

  it("recognises a card by Luhn and an IBAN by mod-97", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("4111111111111112")).toBe(false);
    expect(scan("kort 4111 1111 1111 1111").findings.map((f) => f.key)).toEqual(["card"]);
    expect(scan("kort 4111 1111 1111 1112").findings.map((f) => f.key)).toEqual([]);
    expect(iban97("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(scan("IBAN GB82 WEST 1234 5698 7654 32").findings.map((f) => f.key)).toEqual(["iban"]);
    expect(scan("IBAN GB82 WEST 1234 5698 7654 33").findings.map((f) => f.key)).toEqual([]);
  });

  it("finds an account, an e-mail and a Danish phone number, and not a phone inside a card", () => {
    expect(scan("reg 1234 5678901").findings.map((f) => f.key)).toEqual(["account"]);
    expect(scan("skriv til anna@example.dk").findings.map((f) => f.text)).toEqual([
      "anna@example.dk",
    ]);
    expect(scan("ring +45 20 12 34 56").findings.map((f) => f.key)).toEqual(["phone"]);
    expect(scan("ring 20123456").findings.map((f) => f.key)).toEqual(["phone"]);
    // The card wins the overlap; no phone is fished out of its middle.
    expect(scan("4111 1111 1111 1111").findings.map((f) => f.key)).toEqual(["card"]);
  });

  it("finds a diagnosis code and an introduced name, and nothing in ordinary prose", () => {
    expect(scan("diagnosen er DF432").findings.map((f) => f.key)).toEqual(["icd"]);
    expect(scan("F43.2 i journalen").findings.map((f) => f.key)).toEqual(["icd"]);
    expect(scan("B12-vitamin").findings).toEqual([]);
    expect(scan("Jeg hedder Anna Møller Jensen og").findings).toMatchObject([
      { key: "name", text: "Anna Møller Jensen" },
    ]);
    expect(scan("Mødet i Aarhus var godt. Vi ses.").findings).toEqual([]);
  });

  it("hints at health and union words without blocking, with the administrator's extra words", () => {
    const result = scan("Hun er sygemeldt og har talt med tillidsmanden.");
    expect(result.findings).toEqual([]);
    // "tillidsmanden" is not the word "tillidsmand": the boundary holds.
    expect(result.hints).toEqual([{ key: "health", words: ["sygemeldt"] }]);
    expect(scan("tillidsmand og fagforening").hints).toEqual([
      { key: "union", words: ["fagforening", "tillidsmand"] },
    ]);
    const tuned = scan("migræne igen", { disabled: [], extraWords: { health: ["migræne"] } });
    expect(tuned.hints).toEqual([{ key: "health", words: ["migræne"] }]);
  });

  it("respects what the administrator switched off", () => {
    const off = { disabled: ["email", "health"], extraWords: {} };
    expect(scan("anna@example.dk er sygemeldt", off)).toEqual({ findings: [], hints: [] });
    expect(allKeys()).toEqual([
      "cpr",
      "card",
      "iban",
      "account",
      "email",
      "phone",
      "icd",
      "name",
      "health",
      "union",
    ]);
  });

  it("finds nothing in nothing", () => {
    expect(scan("")).toEqual({ findings: [], hints: [] });
  });
});
