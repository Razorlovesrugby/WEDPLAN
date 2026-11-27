import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SeatingGuest } from "@/lib/seating/model";
import type { SeatingPlanData } from "@/server/queries/seating";
import { CatererExport, FloristExport, HireExport, PaperStyle, VenueExport, isExportView, parsePaper, type ExportInput } from "./exports";
import { SharedPlan } from "./shared-plan";

const table = (o: Record<string, unknown>) => ({
  wedding_id: "w", event_id: "e", layout_id: "l1", space_id: "s1", reserved_seats: 0, reserved_note: null, ends_seated: false, accessible: false,
  sort_order: 0, notes: null, rotation_deg: 0, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null,
  style_id: null, style_changes: null, platter_counts: null, created_at: "", updated_at: "", ...o,
});
const fixture = (o: Record<string, unknown>) => ({
  wedding_id: "w", event_id: "e", layout_id: "l1", space_id: "s1", label: null, rotation_deg: 0, quantity: 1, vendor_id: null,
  custom_item_id: null, marquee_id: null, created_at: "", updated_at: "", ...o,
});
const guest = (id: string, first: string, over: Partial<SeatingGuest> = {}): SeatingGuest => ({
  id, householdId: "h", householdName: "H", firstName: first, lastName: "Ngata", preferredName: null, ageBand: "adult", side: null,
  dietary: null, dietaryNeeds: [], accessibility: "Needs a ramp", plusOneFor: null, tagIds: [], invited: true, excluded: false, rsvp: "yes",
  needsHighchair: false, usesWheelchair: false, arrivedAt: null, replyChangedAt: null, ...over,
});

const data = {
  plan: { service_style: "plated", colour_by: null, settings: {}, room_width_cm: 2000, room_depth_cm: 1500, menu: [{ id: "main", name: "Mains", style: "shared", dishes: [{ id: "lamb", name: "Lamb", tags: [], vessel: "platter", serves: 4 }] }] },
  backgroundUrl: null,
  tables: [table({ id: "t1", label: "Table 1", shape: "round", capacity: 8, pos_x_cm: 600, pos_y_cm: 600 }), table({ id: "t2", label: "Table 2", shape: "long", capacity: 8, pos_x_cm: 1200, pos_y_cm: 800, space_id: "s2" })],
  fixtures: [fixture({ id: "f1", kind: "bar", pos_x_cm: 300, pos_y_cm: 200, width_cm: 300, depth_cm: 80 }), fixture({ id: "f2", kind: "aisle_flowers", pos_x_cm: 500, pos_y_cm: 900, width_cm: 40, depth_cm: 40, quantity: 12 })],
  assignments: [
    { guestId: "g1", tableId: "t1", seatIndex: 0 },
    { guestId: "g2", tableId: "t1", seatIndex: 1 },
    { guestId: "g3", tableId: "t2", seatIndex: 2 },
  ],
  rules: [],
  guests: [
    guest("g1", "Aroha", { dietaryNeeds: [{ tag: "shellfish", isAllergy: true, otherText: null }] }),
    guest("g2", "Bill", { dietary: "no onions" }),
    guest("g3", "Chidi"),
  ],
  blocked: [],
  colour: { collaborators: [], tags: [], questions: [], answers: {} },
  styles: [],
  layoutId: "l1",
  layouts: [],
  spaces: [
    { id: "s1", wedding_id: "w", layout_id: "l1", name: "Hall", sort_order: 0, room_width_cm: 2000, room_depth_cm: 1500, background_path: null, background_w_px: null, background_h_px: null, calibrated: false, background_opacity: 45, drawing: { walls: [{ id: "w1", a: [0, 0], b: [2000, 0], thick: 20, bulge: 0 }] }, created_at: "", updated_at: "" },
    { id: "s2", wedding_id: "w", layout_id: "l1", name: "Terrace", sort_order: 1, room_width_cm: 1500, room_depth_cm: 1000, background_path: null, background_w_px: null, background_h_px: null, calibrated: false, background_opacity: 45, drawing: {}, created_at: "", updated_at: "" },
  ],
  spaceId: "s1",
  customItems: [],
  marquees: [],
  vendors: [],
  budgetLines: [],
  counts: [],
} as unknown as SeatingPlanData;

const input = (over: Partial<ExportInput> = {}): ExportInput => ({ data, eventName: "Reception", paper: parsePaper("a3", "landscape"), spaceIds: [], backgrounds: {}, colourBy: { kind: "none" } as never, ...over });
const html = (c: (i: ExportInput) => unknown, over: Partial<ExportInput> = {}) => renderToStaticMarkup(createElement(c as never, input(over) as never));

describe("the exports (spec 57 Part E)", () => {
  it("knows the four supplier exports and reads the paper", () => {
    expect(["caterer", "venue", "florist", "hire"].every(isExportView)).toBe(true);
    expect(isExportView("tables")).toBe(false);
    expect(parsePaper("a3", "landscape")).toEqual({ size: "a3", orient: "landscape" });
    expect(parsePaper("letter", "sideways")).toEqual({ size: "a4", orient: "portrait" });
    expect(renderToStaticMarkup(createElement(PaperStyle, { paper: { size: "a3", orient: "landscape" } }))).toContain("size: A3 landscape");
  });

  describe("caterer", () => {
    const out = html(CatererExport);
    it("has a floor plan per space, with the allergy key", () => {
      expect(out).toContain("floor plan: Hall");
      expect(out).toContain("floor plan: Terrace");
      expect(out).toContain("Allergy");
    });
    it("lists dietary needs by seat, allergies first-class", () => {
      expect(out).toContain("Table 1.1 Allergy: Shellfish, Aroha Ngata");
      expect(out).toContain("Table 1.2 no onions, Bill Ngata");
    });
    it("has the kitchen summary, the guests A to Z and a page per table", () => {
      expect(out).toContain("kitchen summary");
      expect(out).toContain("Lamb");
      expect(out).toContain("guests A to Z");
      expect(out.indexOf("Aroha Ngata")).toBeGreaterThan(-1);
      expect(out).toContain(">Table 1<");
      expect(out).toContain(">Table 2<");
    });
    it("leaves out a space the person didn't pick", () => {
      const only = html(CatererExport, { spaceIds: ["s2"] });
      expect(only).toContain("floor plan: Terrace");
      expect(only).not.toContain("floor plan: Hall");
    });
  });

  describe("venue", () => {
    const out = html(VenueExport);
    it("shows the rooms, furniture and décor with chair counts and no names", () => {
      expect(out).toContain("for the venue: Hall");
      expect(out).toContain("8 chairs");
      expect(out).not.toContain("Aroha");
      expect(out).not.toContain("shellfish");
      expect(out).not.toContain("no onions");
      expect(out).not.toContain("Needs a ramp");
    });
  });

  describe("florist", () => {
    const out = html(FloristExport);
    it("numbers the décor and lists it with the final numbers, falling back to Not set", () => {
      expect(out).toContain("1. aisle flowers ×12");
      expect(out).toContain("florist&#x27;s list");
      expect(out).toContain("Not set");
    });
  });

  describe("hire", () => {
    const out = html(HireExport);
    it("marks the furniture and counts it by type and size", () => {
      expect(out).toContain("A. bar");
      expect(out).toMatch(/1 × Round · \d+ cm · 8 seats/);
      expect(out).toMatch(/1 × Long · \d+ × 75 cm · 8 seats/);
      expect(out).toContain("16 chairs in all");
    });
  });
});

describe("the shared page", () => {
  const out = renderToStaticMarkup(createElement(SharedPlan, { data, eventName: "Reception", token: "tok", backgrounds: {} }));
  it("says plainly what a link shows", () => {
    expect(out).toContain("Anyone with this link sees guests&#x27; names and dietary needs.");
    expect(out).toContain("view-only");
  });
  it("shows every space, the names and the dietary needs, and links to the exports", () => {
    expect(out).toContain(">Hall<");
    expect(out).toContain(">Terrace<");
    expect(out).toContain("Aroha Ngata");
    expect(out).toContain("Allergy: Shellfish");
    expect(out).toContain('href="/p/tok/print?view=caterer"');
  });
  it("writes nothing: no form, no button that saves", () => {
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<button");
  });
  it("doesn't carry what a supplier shouldn't have", () => {
    expect(out).not.toContain("Needs a ramp");
  });
});
