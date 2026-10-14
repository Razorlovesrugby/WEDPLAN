import { describe, expect, it } from "vitest";
import {
  localSeatPositions,
  normaliseDegrees,
  polygonDistance,
  polygonsOverlap,
  rectCorners,
  seatPositions,
  snap,
  tablePolygon,
  tableSize,
  type TableGeometryInput,
} from "./geometry";
import { compareBySurname, guestName, nextTableLabel, type SeatingGuest, type SeatingTable } from "./model";
import { defaultTrayMode, isAttending, trayHouseholds } from "./tray";
import { computeWarnings, declinedSeatedGuestIds, occupancy, summarise, warningsByTable } from "./warnings";
import { applyMove } from "./moves";
import { chairsNeeded, nameIndex, placeCardOrder, seatingCsvRows, tableListings } from "./listings";
import { colourCounts, colourLegend, guestColour, parseColourBy, serialiseColourBy } from "./colour";

function guest(id: string, over: Partial<SeatingGuest> = {}): SeatingGuest {
  return {
    id,
    householdId: `h-${id}`,
    householdName: `House ${id}`,
    firstName: id,
    lastName: "Smith",
    preferredName: null,
    ageBand: "adult",
    side: null,
    dietary: null,
    accessibility: null,
    plusOneFor: null,
    tagIds: [],
    invited: true,
    excluded: false,
    rsvp: "yes",
    ...over,
  };
}

function table(id: string, over: Partial<SeatingTable> = {}): SeatingTable {
  return {
    id,
    wedding_id: "w",
    event_id: "e",
    label: id,
    shape: "round",
    capacity: 8,
    reserved_seats: 0,
    reserved_note: null,
    ends_seated: false,
    accessible: false,
    sort_order: 0,
    notes: null,
    pos_x_cm: null,
    pos_y_cm: null,
    rotation_deg: 0,
    width_cm: null,
    length_cm: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function geo(over: Partial<TableGeometryInput> = {}): TableGeometryInput {
  return {
    shape: "round",
    capacity: 8,
    ends_seated: false,
    width_cm: null,
    length_cm: null,
    pos_x_cm: 0,
    pos_y_cm: 0,
    rotation_deg: 0,
    ...over,
  };
}

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);

describe("geometry", () => {
  it("sizes a round table for eight at about five foot", () => {
    expect(tableSize(geo())).toEqual({ length: 153, width: 153 });
    expect(tableSize(geo({ capacity: 2 }))).toEqual({ length: 90, width: 90 });
  });

  it("sizes long tables by chairs per side, with and without ends", () => {
    expect(tableSize(geo({ shape: "long", capacity: 10 }))).toEqual({ length: 300, width: 75 });
    expect(tableSize(geo({ shape: "long", capacity: 10, ends_seated: true }))).toEqual({ length: 240, width: 75 });
    expect(tableSize(geo({ shape: "head", capacity: 6 }))).toEqual({ length: 360, width: 75 });
  });

  it("lets an explicit size win", () => {
    expect(tableSize(geo({ length_cm: 180 }))).toEqual({ length: 180, width: 180 });
    expect(tableSize(geo({ shape: "long", length_cm: 500, width_cm: 90 }))).toEqual({ length: 500, width: 90 });
  });

  it("numbers round-table chairs clockwise from the top", () => {
    const seats = localSeatPositions(geo({ capacity: 4 }));
    expect(seats).toHaveLength(4);
    close(seats[0]!.x, 0);
    expect(seats[0]!.y).toBeLessThan(0); // top
    expect(seats[1]!.x).toBeGreaterThan(0); // then right
    expect(seats[2]!.y).toBeGreaterThan(0); // bottom
    expect(seats[3]!.x).toBeLessThan(0); // left
  });

  it("seats a head table along one side, left to right", () => {
    const seats = localSeatPositions(geo({ shape: "head", capacity: 3 }));
    expect(seats.every((s) => s.y < 0)).toBe(true);
    expect(seats[0]!.x).toBeLessThan(seats[1]!.x);
    expect(seats[1]!.x).toBeLessThan(seats[2]!.x);
  });

  it("puts long-table end chairs in the clockwise sequence", () => {
    const seats = localSeatPositions(geo({ shape: "long", capacity: 6, ends_seated: true }));
    expect(seats).toHaveLength(6);
    expect(seats[2]!.y).toBe(0); // right end after the top two
    expect(seats[2]!.x).toBeGreaterThan(0);
    expect(seats[5]!.x).toBeLessThan(0); // left end last
  });

  it("gives every capacity exactly that many chairs", () => {
    for (const shape of ["round", "long", "square", "head"] as const) {
      for (const capacity of [1, 2, 3, 5, 8, 11, 20]) {
        expect(localSeatPositions(geo({ shape, capacity, ends_seated: true }))).toHaveLength(capacity);
      }
    }
  });

  it("rotates and places chairs in the room", () => {
    const seats = seatPositions(geo({ shape: "head", capacity: 1, pos_x_cm: 1000, pos_y_cm: 500, rotation_deg: 90 }))!;
    // The one chair sits above the table; turned 90° clockwise it sits to the right.
    expect(seats[0]!.x).toBeGreaterThan(1000);
    close(seats[0]!.y, 500);
    expect(seatPositions(geo({ pos_x_cm: null, pos_y_cm: null }))).toBeNull();
  });

  it("detects overlap but not tables pushed end to end", () => {
    const a = rectCorners(0, 0, 200, 100, 0);
    expect(polygonsOverlap(a, rectCorners(150, 0, 200, 100, 0))).toBe(true);
    expect(polygonsOverlap(a, rectCorners(200, 0, 200, 100, 0))).toBe(false);
    expect(polygonsOverlap(a, rectCorners(500, 0, 200, 100, 0))).toBe(false);
    // Rotation matters: a diagonal table reaches further.
    expect(polygonsOverlap(a, rectCorners(230, 0, 200, 40, 90))).toBe(false);
    expect(polygonsOverlap(a, rectCorners(180, 60, 200, 40, 45))).toBe(true);
  });

  it("measures edge-to-edge distance", () => {
    const a = rectCorners(0, 0, 200, 100, 0);
    close(polygonDistance(a, rectCorners(400, 0, 200, 100, 0)), 200);
    expect(polygonDistance(a, rectCorners(100, 0, 200, 100, 0))).toBe(0);
    const r1 = tablePolygon(geo({ pos_x_cm: 0, pos_y_cm: 0 }))!;
    const r2 = tablePolygon(geo({ pos_x_cm: 453, pos_y_cm: 0 }))!;
    expect(Math.abs(polygonDistance(r1, r2) - 300)).toBeLessThan(2);
  });

  it("snaps and normalises", () => {
    expect(snap(137, 25)).toBe(125);
    expect(snap(138, 25)).toBe(150);
    expect(normaliseDegrees(-15)).toBe(345);
    expect(normaliseDegrees(720)).toBe(0);
  });
});

describe("model", () => {
  it("names guests by preferred name", () => {
    expect(guestName(guest("a", { firstName: "Elizabeth", preferredName: "Liz", lastName: "Reid" }))).toBe("Liz Reid");
    expect(guestName(guest("a", { firstName: "Cher", lastName: null }))).toBe("Cher");
  });

  it("sorts by surname", () => {
    const list = [guest("a", { firstName: "Zoe", lastName: "Adams" }), guest("b", { firstName: "Al", lastName: "Brown" })];
    expect(list.sort(compareBySurname).map((g) => g.firstName)).toEqual(["Zoe", "Al"]);
  });

  it("issues the next table number, never a deleted one's", () => {
    expect(nextTableLabel([])).toBe("Table 1");
    expect(nextTableLabel(["Table 1", "Table 3"])).toBe("Table 4");
    expect(nextTableLabel(["Head table"])).toBe("Table 1");
  });
});

describe("tray", () => {
  it("drafts with unanswered guests until the first Yes", () => {
    expect(defaultTrayMode([guest("a", { rsvp: null }), guest("b", { rsvp: "pending" })])).toBe("yes_pending");
    expect(defaultTrayMode([guest("a", { rsvp: null }), guest("b", { rsvp: "yes" })])).toBe("yes");
    // A Yes from someone not invited to this event doesn't count.
    expect(defaultTrayMode([guest("a", { rsvp: "yes", invited: false })])).toBe("yes_pending");
  });

  it("never offers a decline, an uninvited guest, or someone who can't come", () => {
    expect(isAttending(guest("a", { rsvp: "no" }), "yes_pending")).toBe(false);
    expect(isAttending(guest("a", { invited: false }), "yes_pending")).toBe(false);
    expect(isAttending(guest("a", { excluded: true, rsvp: null }), "yes_pending")).toBe(false);
    expect(isAttending(guest("a", { rsvp: "maybe" }), "yes_pending")).toBe(true);
    expect(isAttending(guest("a", { rsvp: "maybe" }), "yes")).toBe(false);
  });

  it("groups the unseated by household, leaving out who's seated", () => {
    const g = [
      guest("ana", { householdId: "f", householdName: "Ferreira" }),
      guest("luis", { householdId: "f", householdName: "Ferreira" }),
      guest("tom", { householdId: "w", householdName: "Bell" }),
    ];
    const out = trayHouseholds(g, [{ guestId: "luis", tableId: "t", seatIndex: null }], "yes");
    expect(out.map((h) => h.householdName)).toEqual(["Bell", "Ferreira"]);
    expect(out[1]!.guests.map((x) => x.id)).toEqual(["ana"]);
  });

  it("filters by tag, side and name", () => {
    const g = [guest("ana", { tagIds: ["uni"], side: "partner_a" }), guest("ben", { side: "partner_b" })];
    expect(trayHouseholds(g, [], "yes", { tagId: "uni" }).flatMap((h) => h.guests.map((x) => x.id))).toEqual(["ana"]);
    expect(trayHouseholds(g, [], "yes", { side: "partner_b" }).flatMap((h) => h.guests.map((x) => x.id))).toEqual(["ben"]);
    expect(trayHouseholds(g, [], "yes", { query: "BEN" }).flatMap((h) => h.guests.map((x) => x.id))).toEqual(["ben"]);
  });
});

describe("warnings", () => {
  const kinds = (w: { kind: string }[]) => w.map((x) => x.kind).sort();

  it("counts chairs, not infants, and counts reserved seats", () => {
    const t = table("t", { capacity: 2, reserved_seats: 1 });
    const g = [guest("a"), guest("baby", { ageBand: "infant" })];
    const a = g.map((x) => ({ guestId: x.id, tableId: "t", seatIndex: null }));
    const occ = occupancy([t], g, a).get("t")!;
    expect(occ.chairsTaken).toBe(2);
    expect(occ.free).toBe(0);
    expect(kinds(computeWarnings({ tables: [t], guests: g, assignments: a, rules: [], trayMode: "yes" }))).toEqual([]);

    const b = [...a, { guestId: "c", tableId: "t", seatIndex: null }];
    const w = computeWarnings({ tables: [t], guests: [...g, guest("c")], assignments: b, rules: [], trayMode: "yes" });
    expect(kinds(w)).toEqual(["over_capacity"]);
    expect(w[0]!.message).toBe("t has 3 for 2 seats");
  });

  it("flags declined, no-longer-invited and can't-come guests still seated, never removing them", () => {
    const g = [guest("no", { rsvp: "no" }), guest("gone", { invited: false }), guest("cant", { excluded: true }), guest("ok")];
    const a = g.map((x) => ({ guestId: x.id, tableId: "t", seatIndex: null }));
    const w = computeWarnings({ tables: [table("t")], guests: g, assignments: a, rules: [], trayMode: "yes" });
    expect(declinedSeatedGuestIds(w).sort()).toEqual(["cant", "gone", "no"]);
    expect(w.find((x) => x.guestIds[0] === "no")!.message).toContain("has declined");
  });

  it("notes the unanswered only once the tray is on Yes only", () => {
    const g = [guest("p", { rsvp: "pending" })];
    const a = [{ guestId: "p", tableId: "t", seatIndex: null }];
    expect(computeWarnings({ tables: [table("t")], guests: g, assignments: a, rules: [], trayMode: "yes_pending" })).toEqual([]);
    const w = computeWarnings({ tables: [table("t")], guests: g, assignments: a, rules: [], trayMode: "yes" });
    expect(w.map((x) => [x.kind, x.severity])).toEqual([["unanswered_seated", "info"]]);
  });

  it("ignores assignments for deleted guests", () => {
    const w = computeWarnings({
      tables: [table("t", { capacity: 1 })],
      guests: [guest("a")],
      assignments: [
        { guestId: "a", tableId: "t", seatIndex: null },
        { guestId: "deleted", tableId: "t", seatIndex: null },
      ],
      rules: [],
      trayMode: "yes",
    });
    expect(w).toEqual([]);
  });

  it("flags a child away from every seated adult of their household", () => {
    const g = [
      guest("mum", { householdId: "h", householdName: "Okonkwo" }),
      guest("kid", { householdId: "h", householdName: "Okonkwo", ageBand: "child" }),
    ];
    const w = computeWarnings({
      tables: [table("t1"), table("t2")],
      guests: g,
      assignments: [
        { guestId: "mum", tableId: "t1", seatIndex: null },
        { guestId: "kid", tableId: "t2", seatIndex: null },
      ],
      rules: [],
      trayMode: "yes",
    });
    expect(kinds(w)).toEqual(["child_away"]);
    expect(warningsByTable(w).get("t1")).toHaveLength(1);
    // A child seated before any adult is placed isn't flagged yet.
    expect(
      computeWarnings({ tables: [table("t2")], guests: g, assignments: [{ guestId: "kid", tableId: "t2", seatIndex: null }], rules: [], trayMode: "yes" }),
    ).toEqual([]);
  });

  it("flags a split plus-one", () => {
    const g = [guest("a"), guest("b", { plusOneFor: "a" })];
    const w = computeWarnings({
      tables: [table("t1"), table("t2")],
      guests: g,
      assignments: [
        { guestId: "a", tableId: "t1", seatIndex: null },
        { guestId: "b", tableId: "t2", seatIndex: null },
      ],
      rules: [],
      trayMode: "yes",
    });
    expect(kinds(w)).toEqual(["plus_one_split"]);
  });

  it("checks every rule kind", () => {
    const g = [guest("a"), guest("b"), guest("c")];
    const tables = [
      table("t1", { pos_x_cm: 0, pos_y_cm: 0 }),
      table("t2", { pos_x_cm: 1000, pos_y_cm: 0, accessible: true }),
      table("t3"),
    ];
    const a = [
      { guestId: "a", tableId: "t1", seatIndex: null },
      { guestId: "b", tableId: "t2", seatIndex: null },
      { guestId: "c", tableId: "t1", seatIndex: null },
    ];
    const rule = (kind: SeatingTable["shape"] | string, over: Record<string, unknown>) =>
      ({ id: kind, wedding_id: "w", kind, guest_a: "a", guest_b: null, table_id: null, note: null, created_at: "", updated_at: "", ...over }) as never;
    const w = computeWarnings({
      tables,
      guests: g,
      assignments: a,
      rules: [
        rule("together", { guest_b: "b" }),
        rule("apart", { guest_b: "c" }),
        rule("near", { guest_b: "b" }),
        rule("avoid_table", { table_id: "t1" }),
        rule("accessible", {}),
      ],
      trayMode: "yes",
    });
    expect(kinds(w)).toEqual(["accessible", "apart", "avoid_table", "near", "together"]);

    // Near with an unplaced table is info, not a problem.
    const w2 = computeWarnings({
      tables,
      guests: g,
      assignments: [
        { guestId: "a", tableId: "t1", seatIndex: null },
        { guestId: "b", tableId: "t3", seatIndex: null },
      ],
      rules: [rule("near", { guest_b: "b" })],
      trayMode: "yes",
    });
    expect(w2.map((x) => [x.kind, x.severity])).toEqual([["near_unplaced", "info"]]);
  });

  it("flags overlapping tables and fixtures in the room", () => {
    const tables = [table("t1", { pos_x_cm: 0, pos_y_cm: 0 }), table("t2", { pos_x_cm: 100, pos_y_cm: 0 })];
    const fixtures = [
      { id: "f", wedding_id: "w", event_id: "e", kind: "dance_floor" as const, label: null, pos_x_cm: 0, pos_y_cm: 100, width_cm: 200, depth_cm: 200, rotation_deg: 0, created_at: "", updated_at: "" },
    ];
    const w = computeWarnings({ tables, fixtures, guests: [], assignments: [], rules: [], trayMode: "yes" });
    expect(w.map((x) => x.message)).toEqual([
      "t1 overlaps t2",
      "t1 overlaps the dance floor",
      "t2 overlaps the dance floor",
    ]);
  });

  it("flags a chair past the end of a shrunk table", () => {
    const w = computeWarnings({
      tables: [table("t", { capacity: 4 })],
      guests: [guest("a")],
      assignments: [{ guestId: "a", tableId: "t", seatIndex: 5 }],
      rules: [],
      trayMode: "yes",
    });
    expect(kinds(w)).toEqual(["chair_off_table"]);
  });

  it("summarises the plan", () => {
    const g = [guest("a"), guest("b"), guest("c", { rsvp: "no" }), guest("d", { rsvp: null })];
    const input = {
      tables: [table("t", { capacity: 3 })],
      guests: g,
      assignments: [{ guestId: "a", tableId: "t", seatIndex: null }],
      rules: [],
      trayMode: "yes_pending" as const,
    };
    expect(summarise(input, computeWarnings(input))).toEqual({
      attending: 3,
      seated: 1,
      unseated: 2,
      emptyChairs: 2,
      overCapacityTables: 0,
      problems: 0,
    });
  });
});

describe("colour by", () => {
  const ctx = {
    collaborators: [{ role: "owner" as const, display_name: "Alex" }],
    tags: [{ id: "uni", name: "uni", colour: "#123456" }],
    questions: [{ id: "meal", label: "Meal", options: ["Beef", "Fish"] }],
    answers: { meal: { a: "Fish", b: "Beef" } },
  };

  it("round-trips through the URL", () => {
    for (const raw of ["side", "tag:uni", "q:meal"]) expect(serialiseColourBy(parseColourBy(raw))).toBe(raw);
    expect(parseColourBy("tag:")).toEqual({ kind: "none" });
    expect(parseColourBy(null)).toEqual({ kind: "none" });
  });

  it("colours by a meal answer, with no answer last", () => {
    const by = parseColourBy("q:meal");
    expect(colourLegend(by, ctx).map((e) => e.label)).toEqual(["Beef", "Fish", "No answer"]);
    expect(guestColour(guest("a"), by, ctx)!.label).toBe("Fish");
    expect(guestColour(guest("z"), by, ctx)!.label).toBe("No answer");
    expect(colourCounts([guest("a"), guest("b"), guest("c")], by, ctx)).toEqual([
      { label: "Beef", colour: expect.any(String), count: 1 },
      { label: "Fish", colour: expect.any(String), count: 1 },
      { label: "No answer", colour: expect.any(String), count: 1 },
    ]);
  });

  it("colours by side with the partner's name, and by tag", () => {
    expect(guestColour(guest("a", { side: "partner_a" }), { kind: "side" }, ctx)!.label).toBe("Alex");
    expect(guestColour(guest("a", { tagIds: ["uni"] }), { kind: "tag", tagId: "uni" }, ctx)!.colour).toBe("#123456");
    expect(guestColour(guest("a"), { kind: "none" }, ctx)).toBeNull();
  });
});


describe("applyMove (the screen's optimistic copy of assignGuests)", () => {
  const a = (guestId: string, tableId: string, seatIndex: number | null = null) => ({ guestId, tableId, seatIndex });
  const sorted = (xs: { guestId: string }[]) => [...xs].sort((p, q) => p.guestId.localeCompare(q.guestId));

  it("unseats", () => {
    expect(applyMove([a("x", "t1"), a("y", "t1")], ["x"], null, undefined)).toEqual([a("y", "t1")]);
  });

  it("keeps a chair when moving within the same table, drops it moving away", () => {
    expect(applyMove([a("x", "t1", 2)], ["x"], "t1", undefined)).toEqual([a("x", "t1", 2)]);
    expect(applyMove([a("x", "t1", 2)], ["x"], "t2", undefined)).toEqual([a("x", "t2", null)]);
  });

  it("swaps into a taken chair; the other person takes the mover's old place", () => {
    const out = applyMove([a("x", "t1", 0), a("y", "t2", 3)], ["x"], "t2", 3);
    expect(sorted(out)).toEqual([a("x", "t2", 3), a("y", "t1", 0)]);
  });

  it("sends the displaced person to the tray when the mover came from the tray", () => {
    expect(applyMove([a("y", "t2", 3)], ["x"], "t2", 3)).toEqual([a("x", "t2", 3)]);
  });
});

describe("listings", () => {
  const plan = {
    tables: [table("t1", { label: "Table 1", reserved_seats: 1 }), table("t2", { label: "Table 2" })],
    guests: [
      guest("ana", { firstName: "Ana", lastName: "Zed" }),
      guest("bo", { firstName: "Bo", lastName: "Able", ageBand: "infant" }),
      guest("cy", { firstName: "Cy", lastName: "Mid", dietary: "Vegan" }),
    ],
    assignments: [
      { guestId: "ana", tableId: "t1", seatIndex: 1 },
      { guestId: "bo", tableId: "t1", seatIndex: null },
      { guestId: "cy", tableId: "t2", seatIndex: 0 },
      { guestId: "gone", tableId: "t2", seatIndex: 1 },
    ],
  };

  it("lists each table in chair order, chairless last, skipping deleted guests", () => {
    const l = tableListings(plan);
    expect(l[0]!.guests.map((s) => s.guest.id)).toEqual(["ana", "bo"]);
    expect(l[1]!.guests.map((s) => s.guest.id)).toEqual(["cy"]);
    expect([l[0]!.adults, l[0]!.infants]).toEqual([1, 1]);
    expect(chairsNeeded(l[0]!)).toBe(2); // Ana and the reserved seat; the infant needs none.
  });

  it("indexes by surname and orders place cards table by table", () => {
    expect(nameIndex(plan).map((e) => e.guest.id)).toEqual(["bo", "cy", "ana"]);
    expect(placeCardOrder(plan).map((e) => e.guest.id)).toEqual(["ana", "bo", "cy"]);
  });

  it("builds CSV rows with 1-based chairs", () => {
    expect(seatingCsvRows("Reception", plan)).toEqual([
      ["Reception", "Table 1", 2, "Ana Zed", "House ana", "adult", "", ""],
      ["Reception", "Table 1", "", "Bo Able", "House bo", "infant", "", ""],
      ["Reception", "Table 2", 1, "Cy Mid", "House cy", "adult", "Vegan", ""],
    ]);
  });
});
