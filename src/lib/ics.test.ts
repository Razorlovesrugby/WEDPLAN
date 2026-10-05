import { describe, expect, it } from "vitest";
import {
  buildAllDayIcs,
  buildIcs,
  buildIcsCalendar,
  foldLine,
  googleEventUrl,
  icsStamp,
  icsText,
} from "./ics";

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
    expect(icsText("a;b")).toBe("a\\;b");
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

describe("buildAllDayIcs", () => {
  it("is a date, not a time, with an exclusive end", () => {
    const ics = buildAllDayIcs(
      {
        id: "std-1",
        name: "Ray & Olivia",
        start: "20270314",
        end: "20270315",
        location: "Wanaka, Otago",
        description: null,
      },
      new Date("2026-09-22T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20270314\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270315\r\n");
    expect(ics).toContain("LOCATION:Wanaka\\, Otago\r\n");
    expect(ics).not.toContain("DESCRIPTION");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

const event = (over: Partial<Parameters<typeof buildIcs>[0]> = {}) => ({
  id: "e1",
  name: "Ceremony",
  startsAt: "2027-06-12T02:00:00Z",
  endsAt: "2027-06-12T03:00:00Z",
  location: "St Mary's, Church Lane",
  description: null,
  ...over,
});

describe("icsText, the semicolon", () => {
  it("really is a backslash and a semicolon (RFC 5545 §3.3.11)", () => {
    // The first version wrote "\;" in a JS string, which is just ";", and its
    // own test asserted the same mistake — so it passed while escaping nothing.
    expect(icsText("a;b")).toHaveLength(4);
    expect(icsText("a;b")[1]).toBe("\\");
  });
});

describe("buildIcsCalendar", () => {
  const now = new Date("2027-01-01T00:00:00Z");

  it("puts every event in one calendar, in start order", () => {
    const ics = buildIcsCalendar(
      [
        event({ id: "late", name: "Brunch", startsAt: "2027-06-13T22:00:00Z", endsAt: null }),
        event({ id: "early", name: "Ceremony" }),
      ],
      now,
    );
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.indexOf("SUMMARY:Ceremony")).toBeLessThan(ics.indexOf("SUMMARY:Brunch"));
  });

  it("uses CRLF throughout and ends with one", () => {
    const ics = buildIcsCalendar([event()], now);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("uses the same UID as the single-event file, so adding both is one entry", () => {
    const single = buildIcs(event(), now);
    const weekend = buildIcsCalendar([event()], now);
    expect(single).toContain("UID:e1@wedding");
    expect(weekend).toContain("UID:e1@wedding");
  });

  it("leaves out an event with no usable start", () => {
    const ics = buildIcsCalendar(
      [event({ startsAt: "" }), event({ id: "bad", startsAt: "not a date" }), event({ id: "ok" })],
      now,
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:ok@wedding");
  });

  it("is a valid, empty calendar for no events", () => {
    const ics = buildIcsCalendar([], now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("escapes a venue's comma and a note's semicolon", () => {
    const ics = buildIcsCalendar([event({ description: "Park round the back; use the side gate" })], now);
    expect(ics).toContain("LOCATION:St Mary's\\, Church Lane");
    expect(ics).toContain("DESCRIPTION:Park round the back\\; use the side gate");
  });
});

describe("googleEventUrl", () => {
  it("builds a template link with UTC start and end", () => {
    const url = new URL(googleEventUrl(event()));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Ceremony");
    expect(url.searchParams.get("dates")).toBe("20270612T020000Z/20270612T030000Z");
    expect(url.searchParams.get("location")).toBe("St Mary's, Church Lane");
  });

  it("assumes an hour when there is no end", () => {
    const url = new URL(googleEventUrl(event({ endsAt: null })));
    expect(url.searchParams.get("dates")).toBe("20270612T020000Z/20270612T030000Z");
  });

  it("encodes what needs it and leaves out what is empty", () => {
    const raw = googleEventUrl(event({ name: "Dinner & dancing", location: null }));
    expect(raw).toContain("Dinner+%26+dancing");
    expect(raw).not.toContain("location=");
  });
});
