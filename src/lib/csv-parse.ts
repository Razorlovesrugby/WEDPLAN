/**
 * CSV parsing — the read half of `csv.ts`.
 *
 * Written by hand rather than pulled from a package because the input is not
 * arbitrary: it is whatever a spreadsheet exported, and the failure modes are
 * specific and worth handling deliberately.
 *
 *   Quoted fields containing commas and newlines. "Priya, Dev and the twins"
 *   is one field, and an address pasted from a letter contains real line
 *   breaks inside its quotes. A split on /[,\n]/ destroys both, and it fails
 *   quietly — you get a row with the wrong number of columns and no error.
 *
 *   Escaped quotes. RFC 4180 doubles them: "" inside a quoted field is one
 *   literal quote.
 *
 *   The byte order mark. Excel on Windows writes one, and it lands on the
 *   first header, so "First name" arrives as "﻿First name" and matches
 *   nothing. Stripped before anything else looks at the text.
 *
 *   Delimiters that aren't commas. Excel in a locale where the decimal
 *   separator is a comma exports semicolons instead, and it still calls the
 *   file .csv. Guessed from the header line.
 *
 * Nothing here talks to the database or to React, so it is all directly
 * testable — which matters, because this is the one place where a silent
 * mistake corrupts every row that follows it.
 */

/** Delimiters worth guessing between. Tab covers "export as TSV, rename it". */
const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

export type Delimiter = (typeof CANDIDATE_DELIMITERS)[number];

/**
 * The delimiter that yields the most fields on the first line.
 *
 * Counting only outside quotes matters: a single comma-delimited line like
 * `name,"Smith; Jones",email` has more semicolons inside quotes than the
 * real delimiter has occurrences elsewhere, and a naive count picks wrongly.
 */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = readFirstLogicalLine(text);

  let best: Delimiter = ",";
  let bestCount = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const count = countOutsideQuotes(firstLine, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** The header line, which may itself contain quoted newlines. */
function readFirstLogicalLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      return text.slice(0, i);
    }
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count++;
    }
  }
  return count;
}

/**
 * Every row, as raw strings. Blank lines are dropped; a row of empty cells is
 * not, because a spreadsheet's "empty" row often still carries a stray space
 * in one column and the user can see it in the preview either way.
 *
 * Rows are NOT padded to a uniform width here. Short rows are a real signal
 * that the file is malformed, and the caller reports them per row rather than
 * papering over them with empty strings.
 */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const source = stripBom(text);
  const sep = delimiter ?? detectDelimiter(source);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    // An unquoted field gets trimmed; a quoted one is taken literally, because
    // quoting is how a spreadsheet says "the spaces here are deliberate".
    row.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };

  const endRow = () => {
    endField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === sep) {
      endField();
    } else if (char === "\r") {
      // CRLF and a lone CR both end the row; the LF is consumed with it.
      if (source[i + 1] === "\n") i++;
      endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
    }
  }

  // Whatever is left after the last delimiter is a final field, unless the
  // file ended with a newline and there is genuinely nothing pending.
  if (field !== "" || fieldWasQuoted || row.length > 0) endRow();

  return rows;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Headers plus body, which is what every caller actually wants.
 *
 * A file with one line is treated as headers and no rows rather than as data
 * with no headers — guessing the other way silently imports the header row as
 * a guest called "First name".
 */
export function parseCsvTable(text: string, delimiter?: Delimiter): {
  headers: string[];
  rows: string[][];
  delimiter: Delimiter;
} {
  const sep = delimiter ?? detectDelimiter(stripBom(text));
  const all = parseCsv(text, sep);
  const [headers = [], ...rows] = all;
  return { headers, rows, delimiter: sep };
}
