import { describe, expect, it } from "vitest";
import {
  filterInbox,
  fromClaim,
  fromNote,
  fromQuestion,
  fromSong,
  fromUnable,
  needsYouCount,
  sortInbox,
  unableSince,
} from "./inbox";

const q = (id: string, status: string, at: string) =>
  fromQuestion({ id, body: "Is there parking?", status, created_at: at, householdName: "Smith family", author_name: null });
const song = (id: string, status: string, at: string) =>
  fromSong({ id, title: "Dancing Queen", artist: "ABBA", status, createdAt: at, askedBy: null });
const note = (id: string, status: string, at: string) =>
  fromNote({ id, body: "Congrats!", status, created_at: at, author_name: "Jo" });

describe("what needs you", () => {
  it("questions, songs and guestbook notes need you while they're new", () => {
    expect(q("1", "new", "2026-11-01").needsYou).toBe(true);
    expect(q("1", "answered", "2026-11-01").needsYou).toBe(false);
    expect(q("1", "dismissed", "2026-11-01").needsYou).toBe(false);
    expect(song("1", "new", "2026-11-01").needsYou).toBe(true);
    expect(song("1", "approved", "2026-11-01").needsYou).toBe(false);
    expect(note("1", "new", "2026-11-01").needsYou).toBe(true);
    expect(note("1", "ignored", "2026-11-01").needsYou).toBe(false);
  });

  it("a claim needs you until Claims has been looked at since, and never once released", () => {
    const claim = { id: "c", name: "Ana", item_title: "Teapot", quantity: 1, status: "claimed", created_at: "2026-11-05T10:00:00Z", released_at: null };
    expect(fromClaim(claim, null).needsYou).toBe(true);
    expect(fromClaim(claim, "2026-11-04T00:00:00Z").needsYou).toBe(true);
    expect(fromClaim(claim, "2026-11-06T00:00:00Z").needsYou).toBe(false);
    expect(fromClaim({ ...claim, released_at: "2026-11-05T11:00:00Z" }, null).needsYou).toBe(false);
  });

  it("a recent can't-come always needs you, and links to the household", () => {
    const item = fromUnable({ guestId: "g", guestName: "Mere", householdId: "h", householdName: "Aunt Mere", at: "2026-11-05" });
    expect(item.needsYou).toBe(true);
    expect(item.href).toBe("/households/h");
    expect(item.preview).toBe("Mere can't come");
  });

  it("names the household first, then a typed name, then 'A guest'", () => {
    expect(q("1", "new", "x").who).toBe("Smith family");
    expect(note("1", "new", "x").who).toBe("Jo");
    expect(fromNote({ id: "1", body: "", status: "new", created_at: "x" }).who).toBe("A guest");
  });
});

describe("the list", () => {
  const items = [q("1", "new", "2026-11-01"), song("2", "approved", "2026-11-03"), note("3", "new", "2026-11-02")];

  it("is newest first", () => {
    expect(sortInbox(items).map((item) => item.id)).toEqual(["2", "3", "1"]);
  });

  it("filters by what needs you, by kind, or not at all", () => {
    expect(filterInbox(items, "needs").map((item) => item.id)).toEqual(["1", "3"]);
    expect(filterInbox(items, "song").map((item) => item.id)).toEqual(["2"]);
    expect(filterInbox(items, "all")).toHaveLength(3);
  });

  it("counts the badge from the same rule as the list", () => {
    expect(needsYouCount(items)).toBe(filterInbox(items, "needs").length);
  });

  it("looks back 14 days for can't-comes", () => {
    expect(unableSince(new Date("2026-11-15T00:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });
});
