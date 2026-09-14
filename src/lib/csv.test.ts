import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, csvRow } from "./csv";

describe("csvCell", () => {
  it("leaves ordinary text alone", () => {
    expect(csvCell("Chidi Okonkwo")).toBe("Chidi Okonkwo");
  });

  it("quotes anything containing a comma", () => {
    expect(csvCell("Priya, Dev and the twins")).toBe('"Priya, Dev and the twins"');
  });

  it("doubles inner quotes", () => {
    expect(csvCell('She goes by "Bee"')).toBe('"She goes by ""Bee"""');
  });

  it("quotes newlines rather than breaking the row", () => {
    expect(csvCell("No nuts\nSevere")).toBe('"No nuts\nSevere"');
  });

  it("neutralises formula injection", () => {
    // These arrive from a public form that anyone holding a link can submit,
    // and the file is opened on the caterer's laptop.
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell('=HYPERLINK("http://evil.test","click")')).toBe(
      '"\'=HYPERLINK(""http://evil.test"",""click"")"',
    );
    expect(csvCell("+44 7700 900000")).toBe("'+44 7700 900000");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
  });

  it("renders empty for missing values rather than the word null", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("csvDocument", () => {
  it("starts with a byte order mark so Excel reads it as UTF-8", () => {
    // Without this, accented names are mangled on Windows.
    expect(csvDocument(["name"], [["Zoë"]]).startsWith("﻿")).toBe(true);
  });

  it("uses CRLF line endings, as RFC 4180 specifies", () => {
    expect(csvDocument(["a", "b"], [[1, 2]])).toBe("﻿a,b\r\n1,2\r\n");
  });

  it("round-trips a row with every awkward character at once", () => {
    const row = csvRow(['a,b', 'say "hi"', "line\nbreak", "=cmd"]);
    expect(row).toBe('"a,b","say ""hi""","line\nbreak",\'=cmd');
  });
});
