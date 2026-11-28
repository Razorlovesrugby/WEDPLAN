import { describe, expect, it } from "vitest";
import { emptyDrawing, parseDrawing, LIMITS } from "./drawing";
import { addressee, newNoteAt, notePlace, notesFor, numberNotes, pointInPolygon, tableAt } from "./notes";
import type { SeatingTable } from "./model";

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const table = (over: Partial<SeatingTable> = {}) => ({ id: T1, space_id: "sp", shape: "round", capacity: 8, ends_seated: false, pos_x_cm: 500, pos_y_cm: 400, rotation_deg: 0, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null, ...over }) as unknown as SeatingTable;
const vendors = [{ id: V1, name: "Bloom & Co" }, { id: V2, name: "Rentals Ltd" }];

describe("notes in the drawing (spec 59 Part E)", () => {
  it("an old drawing with no notes has none", () => {
    const r = parseDrawing({ walls: [] });
    expect(r.ok && r.drawing.notes).toEqual([]);
    expect(emptyDrawing().notes).toEqual([]);
  });
  it("reads a note: text, place, vendors and table", () => {
    const r = parseDrawing({ notes: [{ id: "n1", text: "  Flowers hang from this beam ", x: 100.4, y: 200, vendor_ids: [V1, V1, "nope", 5], table_id: T1 }] });
    expect(r.ok && r.drawing.notes[0]).toEqual({ id: "n1", text: "Flowers hang from this beam", x: 100, y: 200, vendor_ids: [V1], table_id: T1 });
  });
  it("refuses a note with no text, or too much, or a clashing id", () => {
    expect(parseDrawing({ notes: [{ id: "n1", text: "", x: 0, y: 0 }] }).ok).toBe(false);
    expect(parseDrawing({ notes: [{ id: "n1", text: "x".repeat(LIMITS.noteText + 1), x: 0, y: 0 }] }).ok).toBe(false);
    expect(parseDrawing({ labels: [{ id: "n1", text: "A", x: 0, y: 0 }], notes: [{ id: "n1", text: "B", x: 0, y: 0 }] }).ok).toBe(false);
    expect(parseDrawing({ notes: Array.from({ length: 101 }, (_, i) => ({ id: `n${i}`, text: "x", x: 0, y: 0 })) }).ok).toBe(false);
  });
  it("a note with no vendors is for everyone", () => {
    const r = parseDrawing({ notes: [{ id: "n1", text: "x", x: 0, y: 0 }] });
    expect(r.ok && r.drawing.notes[0]).toMatchObject({ vendor_ids: [], table_id: null });
  });
});

describe("where a note is", () => {
  it("a free note is where it was put", () => {
    expect(notePlace({ x: 10, y: 20, table_id: null }, [])).toEqual({ x: 10, y: 20 });
  });
  it("a note on a table moves with it", () => {
    const note = { x: 30, y: -20, table_id: T1 };
    expect(notePlace(note, [table()])).toEqual({ x: 530, y: 380 });
    expect(notePlace(note, [table({ pos_x_cm: 900, pos_y_cm: 100 })])).toEqual({ x: 930, y: 80 });
  });
  it("a note whose table is gone, or not in the room, has no place", () => {
    expect(notePlace({ x: 0, y: 0, table_id: T1 }, [])).toBeNull();
    expect(notePlace({ x: 0, y: 0, table_id: T1 }, [table({ pos_x_cm: null, pos_y_cm: null })])).toBeNull();
  });
  it("finds the point in a polygon", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
  it("a note put on a table is pinned to it, with an offset", () => {
    const n = newNoteAt({ x: 520, y: 410 }, "n1", [table()]);
    expect(n).toMatchObject({ table_id: T1, x: 20, y: 10 });
    expect(newNoteAt({ x: 5000, y: 5000 }, "n2", [table()])).toMatchObject({ table_id: null, x: 5000, y: 5000 });
    expect(tableAt({ x: 520, y: 410 }, [table()])?.id).toBe(T1);
    expect(tableAt({ x: 520, y: 410 }, [table({ space_id: "other" })], "sp")).toBeNull();
  });
});

describe("who a note is for", () => {
  it("everyone, or the vendors by name", () => {
    expect(addressee({ vendor_ids: [] }, vendors)).toBe("Everyone");
    expect(addressee({ vendor_ids: [V1, V2] }, vendors)).toBe("Bloom & Co, Rentals Ltd");
    expect(addressee({ vendor_ids: ["gone"] }, vendors)).toBe("Everyone");
  });
  it("a supplier sees the notes for everyone and those that name them", () => {
    const notes = [
      { id: "a", text: "A", x: 0, y: 0, vendor_ids: [], table_id: null },
      { id: "b", text: "B", x: 0, y: 0, vendor_ids: [V1], table_id: null },
      { id: "c", text: "C", x: 0, y: 0, vendor_ids: [V2], table_id: null },
    ];
    expect(notesFor(notes, V1).map((n) => n.id)).toEqual(["a", "b"]);
    expect(notesFor(notes, V2).map((n) => n.id)).toEqual(["a", "c"]);
    expect(notesFor(notes, null).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  it("numbers what is on the plan, leaving out a note whose table is gone", () => {
    const notes = [
      { id: "a", text: "A", x: 1, y: 2, vendor_ids: [], table_id: null },
      { id: "x", text: "X", x: 0, y: 0, vendor_ids: [], table_id: "44444444-4444-4444-8444-444444444444" },
      { id: "b", text: "B", x: 10, y: 0, vendor_ids: [V1], table_id: T1 },
    ];
    const numbered = numberNotes(notes, [table()], vendors);
    expect(numbered.map((n) => [n.n, n.id, n.for])).toEqual([[1, "a", "Everyone"], [2, "b", "Bloom & Co"]]);
    expect(numbered[1]!.at).toEqual({ x: 510, y: 400 });
  });
});
