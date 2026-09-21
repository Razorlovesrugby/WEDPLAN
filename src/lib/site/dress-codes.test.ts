import { describe, expect, it } from "vitest";
import {
  coverageLabel,
  eventDressCode,
  resolveDressCodes,
  visibleDressCodes,
  type DressCode,
  type DressCodeNote,
} from "./dress-codes";

const code = (over: Partial<DressCode> = {}): DressCode => ({
  id: "c1",
  name: "Formal summer",
  board_id: null,
  sort_order: 10,
  ...over,
});

const note = (over: Partial<DressCodeNote> = {}): DressCodeNote => ({
  id: "n1",
  dress_code_id: "c1",
  label: "For her",
  body: "Block heels, the ground is uneven.",
  board_id: null,
  sort_order: 10,
  ...over,
});

describe("resolveDressCodes", () => {
  it("hangs each note and each event off its own code", () => {
    const codes = [code(), code({ id: "c2", name: "Black tie", sort_order: 20 })];
    const notes = [note(), note({ id: "n2", dress_code_id: "c2", label: "Everyone" })];
    const events = [
      { id: "e1", name: "Ceremony", dress_code_id: "c1" },
      { id: "e2", name: "Reception", dress_code_id: "c1" },
      { id: "e3", name: "Evening party", dress_code_id: "c2" },
    ];

    const [first, second] = resolveDressCodes(codes, notes, events) as [
      ReturnType<typeof resolveDressCodes>[number],
      ReturnType<typeof resolveDressCodes>[number],
    ];

    expect(first.name).toBe("Formal summer");
    expect(first.events.map((e) => e.name)).toEqual(["Ceremony", "Reception"]);
    expect(first.notes).toHaveLength(1);
    expect(second.events.map((e) => e.name)).toEqual(["Evening party"]);
  });

  it("keeps a code nothing points at", () => {
    // A planner who adds "Black tie" before assigning it should see it, not
    // watch it vanish.
    const resolved = resolveDressCodes([code()], [], []);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.events).toEqual([]);
  });

  it("sorts codes and their notes by sort_order, not by insertion", () => {
    const codes = [code({ id: "c2", name: "Second", sort_order: 20 }), code({ sort_order: 10 })];
    const notes = [
      note({ id: "n2", label: "For him", sort_order: 20 }),
      note({ id: "n1", label: "For her", sort_order: 10 }),
    ];
    const resolved = resolveDressCodes(codes, notes, []);
    expect(resolved.map((c) => c.name)).toEqual(["Formal summer", "Second"]);
    expect(resolved[0]!.notes.map((n) => n.label)).toEqual(["For her", "For him"]);
  });

  it("ignores an event pointing at a code that is not there", () => {
    const resolved = resolveDressCodes([code()], [], [
      { id: "e1", name: "Ceremony", dress_code_id: "gone" },
    ]);
    expect(resolved[0]!.events).toEqual([]);
  });

  it("does not mutate what it is given", () => {
    const codes = [code({ id: "c2", sort_order: 20 }), code({ sort_order: 10 })];
    const before = codes.map((c) => c.id);
    resolveDressCodes(codes, [], []);
    expect(codes.map((c) => c.id)).toEqual(before);
  });
});

describe("eventDressCode — the tag on the schedule", () => {
  it("finds the code an event wears", () => {
    expect(eventDressCode({ dress_code_id: "c1" }, [code()])?.name)
      .toBe("Formal summer");
  });

  it("is null for an event with none, and for one pointing nowhere", () => {
    expect(eventDressCode({}, [code()])).toBeNull();
    expect(eventDressCode({ dress_code_id: null }, [code()])).toBeNull();
    expect(eventDressCode({ dress_code_id: "gone" }, [code()])).toBeNull();
  });
});

describe("coverageLabel", () => {
  it("lists the events a code covers", () => {
    const [resolved] = resolveDressCodes([code()], [], [
      { id: "e1", name: "Welcome dinner", dress_code_id: "c1" },
      { id: "e2", name: "Farewell brunch", dress_code_id: "c1" },
    ]);
    expect(coverageLabel(resolved!)).toBe("Welcome dinner, Farewell brunch");
  });

  it("is null when it covers nothing, so the renderer omits the line", () => {
    const [resolved] = resolveDressCodes([code()], [], []);
    expect(coverageLabel(resolved!)).toBeNull();
  });
});

describe("visibleDressCodes — a household sees only their own weekend", () => {
  const resolved = () =>
    resolveDressCodes(
      [code(), code({ id: "c2", name: "Black tie", sort_order: 20 })],
      [],
      [
        { id: "e1", name: "Ceremony", dress_code_id: "c1" },
        { id: "e2", name: "Brunch", dress_code_id: "c2" },
      ],
    );

  it("passes everything through on the shared site", () => {
    expect(visibleDressCodes(resolved(), null)).toHaveLength(2);
  });

  it("drops a code covering only events this household cannot see", () => {
    // Naming the brunch they were not invited to is a disclosure, not a
    // dress code.
    const shown = visibleDressCodes(resolved(), new Set(["e1"]));
    expect(shown.map((c) => c.name)).toEqual(["Formal summer"]);
  });

  it("narrows the coverage line to the events they can see", () => {
    const codes = resolveDressCodes([code()], [], [
      { id: "e1", name: "Ceremony", dress_code_id: "c1" },
      { id: "e2", name: "Brunch", dress_code_id: "c1" },
    ]);
    const [shown] = visibleDressCodes(codes, new Set(["e1"]));
    expect(coverageLabel(shown!)).toBe("Ceremony");
  });

  it("keeps a code covering nothing at all — that is general guidance", () => {
    const codes = resolveDressCodes([code()], [], []);
    expect(visibleDressCodes(codes, new Set(["e1"]))).toHaveLength(1);
  });
});
