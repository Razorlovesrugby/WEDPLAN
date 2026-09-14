/**
 * CSV generation.
 *
 * Two things this handles that a naive join(",") does not:
 *
 * 1. Quoting. Household names contain commas ("Priya, Dev and the twins"),
 *    dietary notes contain quotes and newlines. Anything containing a comma,
 *    quote, carriage return or newline is quoted, and inner quotes doubled.
 *
 * 2. Formula injection. A cell beginning with =, +, -, @, tab or carriage
 *    return is executed as a formula when the file is opened in Excel or
 *    Sheets. These files are built from text guests typed into a public form,
 *    so that is a live path from a stranger's keyboard to a formula running on
 *    the caterer's laptop. Such cells are prefixed with an apostrophe, which
 *    Excel strips on display and treats as literal text.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * A complete CSV document.
 *
 * Prefixed with a UTF-8 byte order mark, because Excel on Windows otherwise
 * reads the file as the system codepage and mangles every accented name in
 * the guest list.
 *
 * Line endings are CRLF, which is what RFC 4180 specifies and what older
 * spreadsheet software expects.
 */
export function csvDocument(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return `﻿${[csvRow(headers), ...rows.map(csvRow)].join("\r\n")}\r\n`;
}
