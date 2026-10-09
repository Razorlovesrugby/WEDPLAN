import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards for spec 29 that are about SOURCE, not behaviour — the rules whose
 * whole point is that a well-meaning later change must not break them
 * quietly. A comment saying "never a GET" is a suggestion; these are the
 * enforcement (the same approach `looks.test.ts` takes for the glyphs).
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** The code without its comments and import lines, so prose can't trip a scan. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[\s\S]*?;\s*$/gm, "");
}

const page = code(read("../../app/w/[slug]/[household]/save-the-date/page.tsx"));
const component = code(read("./unable-to-attend.tsx"));
const reply = code(read("../../server/actions/save-the-date-reply.ts"));

describe("the can't-come write is never made by loading a page", () => {
  it("the guest's page renders the block but calls no write", () => {
    // Scanners and link previewers fetch every URL in a message and do not run
    // JavaScript. A write anywhere in the page body would decline households
    // nobody heard from.
    expect(page).not.toMatch(/declineSaveTheDate|undoSaveTheDateDecline/);
    expect(page).not.toMatch(/\.(update|insert|upsert|delete)\(/);
    expect(page).toMatch(/UnableToAttend/);
  });

  it("the block only writes from a button press, never on mount", () => {
    expect(component).not.toMatch(/useEffect|useLayoutEffect/);
    // Both writes are reached only through a handler that startTransition wraps.
    const calls = component.match(/declineSaveTheDate\(|undoSaveTheDateDecline\(/g) ?? [];
    expect(calls.length).toBe(2);
    expect(component.match(/startTransition\(async/g)?.length).toBe(2);
  });
});

describe("it is not an RSVP", () => {
  it("never writes the rsvps table", () => {
    expect(reply).not.toMatch(/["'`]rsvps["'`]/);
    expect(reply).not.toMatch(/from\(\s*["'`](rsvps|invitations|invitation_events|message_log)["'`]/);
    // The one table it writes, and only the two flag columns.
    expect(reply.match(/\.from\(\s*["'`](\w+)["'`]/g)).toEqual([
      '.from("guests"',
      '.from("guests"',
      '.from("guests"',
    ]);
    expect(reply).toMatch(/unable_to_attend_at/);
  });

  it("never uses RSVP language on the guest's screen", () => {
    // Word-bounded, so `declinedConfirmation` (the helper's name) is fine and
    // a visible "Confirm" or "RSVP" is not.
    expect(component).not.toMatch(/\b(rsvp|reply|replies|required|confirm|respond)\b/i);
  });
});

describe("the public write does not trust the browser", () => {
  it("resolves the household from the address, then intersects the guest ids", () => {
    expect(reply).toMatch(/resolveHouseholdAddress/);
    expect(reply).toMatch(/householdGuestIds/);
    // Every statement is scoped by wedding AND household.
    const scoped = reply.match(/\.eq\("household_id", household\.householdId\)/g) ?? [];
    expect(scoped.length).toBe(3);
  });

  it("keeps the first time when told twice", () => {
    expect(reply).toMatch(/\.is\("unable_to_attend_at", null\)/);
  });
});
