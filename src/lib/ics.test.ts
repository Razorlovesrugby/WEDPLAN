import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsStamp, icsText } from "./ics";

describe("icsStamp", () => {
  it("emits UTC with no punctuation", () => {
    expect(icsStamp("2027-06-12T14:30:00.000Z")).toBe("20270612T143000Z");
  });

  it("converts a non-UTC offset rather than trusting it", () => {
    expect(icsStamp("2027-06-12T15:30:00+01:00")).toBe("20270612T143000Z");
  });
});

describe("icsText", () => {
  it("escapes the comma that would truncate a venue", () => {
    // "The Swan, Wells" arrives as "The Swan" in most clients without this.
    expect(icsText("The Swan, Wells")).toBe("The Swan\\, Wells");
  });

  it("escapes semicolons and backslashes", () => {
    expect(icsText("a;b")).toBe("a\;b");
    expect(icsText("a\\b")).toBe("a\\\\b");
  });

  it("escapes the backslash before it escapes anything else", () => {
    // Order matters: escaping the comma first would then double-escape the
    // backslash this rule introduces.
    expect(icsText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("turns newlines into a literal \\n", () => {
    expect(icsText("one\ntwo")).toBe("one\\ntwo");
    expect(icsText("one\r\ntwo")).toBe("one\\ntwo");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Drinks")).toBe("SUMMARY:Drinks");
  });

  it("leaves a line of exactly 75 octets alone", () => {
    const line = "A".repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it("folds at 75 octets with a leading space on continuations", () => {
    const folded = foldLine("A".repeat(100));
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts[1]?.startsWith(" ")).toBe(true);
    // The continuation's own space counts toward its 75.
    expect(Buffer.from(parts[1]!, "utf8").length).toBeLessThanOrEqual(75);
  });

  it("round-trips: unfolding restores the original", () => {
    const original = "LOCATION:" + "The Swan Hotel Wells Somerset ".repeat(6);
    const unfolded = foldLine(original).split("\r\n ").join("");
    expect(unfolded).toBe(original);
  });

  it("never splits a multi-byte character", () => {
    // é is two octets. A naive slice at 75 lands inside one of them and
    // produces invalid UTF-8, which some clients render as a replacement char
    // and others reject outright.
    const original = "LOCATION:" + "é".repeat(60);
    const folded = foldLine(original);
    expect(folded).not.toContain("�");
    expect(folded.split("\r\n ").join("")).toBe(original);
    for (const part of folded.split("\r\n")) {
      expect(Buffer.from(part, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
});

describe("buildIcs", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("builds a complete VEVENT", () => {
    const ics = buildIcs(
      {
        id: "abc",
        name: "Drinks",
        startsAt: "2027-06-12T17:00:00.000Z",
        endsAt: "2027-06-12T19:00:00.000Z",
        location: "The Swan, Wells",
        description: "Alex & Sam",
      },
      now,
    );
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:abc@wedding");
    expect(ics).toContain("DTSTART:20270612T170000Z");
    expect(ics).toContain("DTEND:20270612T190000Z");
    expect(ics).toContain("LOCATION:The Swan\\, Wells");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("gives an event with no end time an hour", () => {
    const ics = buildIcs(
      { id: "a", name: "x", startsAt: "2027-06-12T17:00:00.000Z", endsAt: null, location: null, description: null },
      now,
    );
    expect(ics).toContain("DTEND:20270612T180000Z");
  });

  it("omits optional lines rather than emitting them empty", () => {
    const ics = buildIcs(
      { id: "a", name: "x", startsAt: "2027-06-12T17:00:00.000Z", endsAt: null, location: null, description: null },
      now,
    );
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("uses CRLF throughout and ends with one", () => {
    const ics = buildIcs(
      { id: "a", name: "x", startsAt: "2027-06-12T17:00:00.000Z", endsAt: null, location: null, description: null },
      now,
    );
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
