import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, parseCsvTable } from "./csv-parse";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,household\nDev,"Priya, Dev and the twins"')).toEqual([
      ["name", "household"],
      ["Dev", "Priya, Dev and the twins"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    // An address pasted out of a letter carries real line breaks.
    expect(parseCsv('name,address\nAma,"12 Bridge St\nSalford\nM3 6AB"')).toEqual([
      ["name", "address"],
      ["Ama", "12 Bridge St\nSalford\nM3 6AB"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('note\n"She goes by ""Bee"""')).toEqual([["note"], ['She goes by "Bee"']]);
  });

  it("handles CRLF, which is what Excel writes", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a lone CR, which is what old Mac exports write", () => {
    expect(parseCsv("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips the byte order mark off the first header", () => {
    // Left in, "First name" arrives as "﻿First name" and matches nothing.
    const [headers] = parseCsv("﻿First name,Email\nAma,ama@example.test");
    expect(headers).toEqual(["First name", "Email"]);
  });

  it("drops blank lines but keeps rows that only look blank", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a trailing empty field", () => {
    expect(parseCsv("a,b,c\n1,2,")).toEqual([
      ["a", "b", "c"],
      ["1", "2", ""],
    ]);
  });

  it("preserves deliberate spacing inside quotes but trims outside them", () => {
    expect(parseCsv('a,b\n  x  ,"  y  "')).toEqual([
      ["a", "b"],
      ["x", "  y  "],
    ]);
  });

  it("does not pad short rows", () => {
    // A short row is a signal the file is malformed, and the preview says so
    // per row. Padding here would hide it.
    expect(parseCsv("a,b,c\n1,2")).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });
});

describe("detectDelimiter", () => {
  it("defaults to a comma", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("finds semicolons, which European Excel writes", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("finds tabs", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("ignores delimiters inside quoted headers", () => {
    // Two semicolons inside one quoted header must not outvote two real commas.
    expect(detectDelimiter('name,"Smith; Jones; co",email')).toBe(",");
  });

  it("looks past a quoted newline to find the whole header line", () => {
    expect(detectDelimiter('a,"multi\nline",c\n1,2,3')).toBe(",");
  });
});

describe("parseCsvTable", () => {
  it("splits headers from rows", () => {
    const table = parseCsvTable("First,Last\nAma,Boateng\nKofi,Mensah");
    expect(table.headers).toEqual(["First", "Last"]);
    expect(table.rows).toEqual([
      ["Ama", "Boateng"],
      ["Kofi", "Mensah"],
    ]);
  });

  it("treats a single line as headers with no data", () => {
    // Guessing the other way imports a guest called "First name".
    const table = parseCsvTable("First,Last");
    expect(table.headers).toEqual(["First", "Last"]);
    expect(table.rows).toEqual([]);
  });

  it("reports the delimiter it used", () => {
    expect(parseCsvTable("a;b\n1;2").delimiter).toBe(";");
  });
});
