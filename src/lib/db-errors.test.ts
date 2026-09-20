import { describe, expect, it } from "vitest";
import { isSchemaMissing, isUniqueViolation } from "./db-errors";

describe("isSchemaMissing", () => {
  /**
   * The real one, copied from a production log line. The first version of
   * this guard only checked 42P01 and so let this through, which 500'd
   * /moodboards on a database that simply had not been migrated yet.
   */
  it("recognises PostgREST's missing-table error", () => {
    expect(
      isSchemaMissing({
        code: "PGRST205",
        message: "Could not find the table 'public.v_moodboards' in the schema cache",
      }),
    ).toBe(true);
  });

  it("recognises a missing column, which is what a half-applied pair of migrations looks like", () => {
    expect(isSchemaMissing({ code: "PGRST204", message: "Could not find the 'layout' column" })).toBe(true);
    expect(isSchemaMissing({ code: "42703", message: 'column "layout" does not exist' })).toBe(true);
  });

  it("still recognises the raw PostgreSQL codes", () => {
    expect(isSchemaMissing({ code: "42P01", message: 'relation "v_moodboards" does not exist' })).toBe(true);
  });

  it("falls back to the message when the code is one it does not know", () => {
    expect(
      isSchemaMissing({
        code: "PGRST999",
        message: "Could not find the table 'public.whatever' in the schema cache",
      }),
    ).toBe(true);
  });

  /** Everything else is a real failure and must still throw. */
  it("is false for real errors", () => {
    expect(isSchemaMissing(null)).toBe(false);
    expect(isSchemaMissing(undefined)).toBe(false);
    expect(isSchemaMissing({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isSchemaMissing({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isSchemaMissing({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isSchemaMissing({ message: "fetch failed" })).toBe(false);
    // "Could not find" about a row, not the schema, must not match.
    expect(isSchemaMissing({ code: "PGRST116", message: "Could not find any rows" })).toBe(false);
  });
});

describe("isUniqueViolation", () => {
  it("catches the code PostgREST passes through", () => {
    expect(isUniqueViolation({ code: "23505", message: "duplicate key" })).toBe(true);
  });

  it("falls back to the message when a driver drops the code", () => {
    expect(
      isUniqueViolation({
        message: 'duplicate key value violates unique constraint "households_address_key"',
      }),
    ).toBe(true);
  });

  it("is not fooled by any other failure", () => {
    expect(isUniqueViolation({ code: "23503", message: "foreign key" })).toBe(false);
    expect(isUniqueViolation({ code: "PGRST205", message: "could not find the table" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
