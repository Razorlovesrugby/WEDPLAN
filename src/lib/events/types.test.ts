import { describe, expect, it } from "vitest";
import {
  BUILTIN_EVENT_TYPES,
  disabledReason,
  featureNote,
  normaliseFeatures,
  typeNameAvailable,
  typeNameKey,
} from "./types";

describe("built-in event types (spec 51 §4.2)", () => {
  it("has nine types, with unique keys and names", () => {
    expect(BUILTIN_EVENT_TYPES).toHaveLength(9);
    expect(new Set(BUILTIN_EVENT_TYPES.map((t) => t.key)).size).toBe(9);
    expect(new Set(BUILTIN_EVENT_TYPES.map((t) => typeNameKey(t.name))).size).toBe(9);
  });

  it("every built-in is already consistent", () => {
    for (const t of BUILTIN_EVENT_TYPES) expect(normaliseFeatures(t)).toEqual(t);
  });

  it("matches the table: ceremony has no seating, getting ready is just us", () => {
    const get = (k: string) => BUILTIN_EVENT_TYPES.find((t) => t.key === k)!;
    expect(get("ceremony").has_seating).toBe(false);
    expect(get("reception").has_seating).toBe(true);
    expect(get("after_party").asks_rsvp).toBe(false);
    expect(get("getting_ready").guest_facing).toBe(false);
    expect(get("other").asks_rsvp).toBe(true);
  });
});

describe("normaliseFeatures", () => {
  const base = { asks_rsvp: true, has_seating: true, guest_facing: true, is_main: false, is_public: true };

  it("leaves a consistent set alone", () => {
    expect(normaliseFeatures(base)).toEqual(base);
  });

  it("a main event must ask for replies", () => {
    expect(normaliseFeatures({ ...base, asks_rsvp: false, is_main: true }).asks_rsvp).toBe(true);
  });

  it("a just-us event cannot ask, be main, or be public; seating survives", () => {
    const out = normaliseFeatures({ ...base, guest_facing: false, is_main: true });
    expect(out).toMatchObject({ asks_rsvp: false, is_main: false, is_public: false, has_seating: true });
  });

  it("works on a type's defaults, which have no is_public", () => {
    const out = normaliseFeatures({ asks_rsvp: true, has_seating: false, guest_facing: false, is_main: false });
    expect(out).toEqual({ asks_rsvp: false, has_seating: false, guest_facing: false, is_main: false });
    expect("is_public" in out).toBe(false);
  });
});

describe("names", () => {
  const existing = [
    { id: "a", name: "Ceremony" },
    { id: "b", name: "Welcome drinks" },
  ];
  it("ignores case and spacing", () => {
    expect(typeNameAvailable("  ceremony ", existing)).toBe(false);
    expect(typeNameAvailable("Welcome   DRINKS", existing)).toBe(false);
    expect(typeNameAvailable("Mehndi", existing)).toBe(true);
  });
  it("lets a type keep its own name when renaming", () => {
    expect(typeNameAvailable("CEREMONY", existing, "a")).toBe(true);
  });
});

describe("form helpers", () => {
  it("explains a disabled switch", () => {
    const f = { asks_rsvp: true, has_seating: false, guest_facing: true, is_main: true };
    expect(disabledReason("asks_rsvp", f)).toBe("A main event asks for replies");
    expect(disabledReason("is_main", f)).toBeNull();
    expect(disabledReason("is_main", { ...f, guest_facing: false })).toMatch(/just-us/);
  });
  it("notes the odd ones out", () => {
    expect(featureNote({ asks_rsvp: true, guest_facing: true })).toBeNull();
    expect(featureNote({ asks_rsvp: false, guest_facing: true })).toBe("No RSVP");
    expect(featureNote({ asks_rsvp: false, guest_facing: false })).toBe("Just us");
  });
});
