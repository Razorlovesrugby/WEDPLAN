import { describe, expect, it } from "vitest";
import { groupPeople, mergePeople, recentPeople } from "./people";
import type { ShotPerson } from "./model";

const g = (id: string): ShotPerson => ({ key: `guest:${id}`, kind: "guest", id, name: id });

describe("mergePeople", () => {
  it("adds only people not already there and keeps the order", () => {
    const out = mergePeople([{ kind: "guest", id: "a" }], [{ kind: "guest", id: "b" }, { kind: "guest", id: "a" }, { kind: "role", role: "Best man" }]);
    expect(out).toEqual([{ kind: "guest", id: "a" }, { kind: "guest", id: "b" }, { kind: "role", role: "Best man" }]);
  });
  it("treats a role the same whatever its padding", () => {
    expect(mergePeople([{ kind: "role", role: "Best man" }], [{ kind: "role", role: " Best man " }])).toHaveLength(1);
  });
  it("never removes anyone", () => {
    expect(mergePeople([{ kind: "guest", id: "a" }], [])).toEqual([{ kind: "guest", id: "a" }]);
  });
});

describe("recentPeople", () => {
  const shots = [{ people: [g("a"), g("b")] }, { people: [g("b"), g("c")] }, { people: [g("d")] }, { people: [g("e")] }];
  it("takes the nearest shots before the index, most recent first, without repeats", () => {
    expect(recentPeople(shots, 3).map((p) => p.name)).toEqual(["d", "b", "c", "a"]);
  });
  it("looks at the last three shots for a new shot", () => {
    expect(recentPeople(shots, shots.length).map((p) => p.name)).toEqual(["e", "d", "b", "c"]);
  });
  it("is empty for the first shot", () => {
    expect(recentPeople(shots, 0)).toEqual([]);
  });
  it("caps the list", () => {
    const many = [{ people: Array.from({ length: 12 }, (_, i) => g(`x${i}`)) }];
    expect(recentPeople(many, 1)).toHaveLength(8);
  });
});

describe("groupPeople", () => {
  const guests = [
    { id: "a", householdId: "h1", side: "partner_a" },
    { id: "b", householdId: "h1", side: "partner_b" },
    { id: "c", householdId: null, side: "partner_a" },
  ];
  it("picks a household", () => expect(groupPeople(guests, { household: "h1" }).map((p) => (p as { id: string }).id)).toEqual(["a", "b"]));
  it("picks a side", () => expect(groupPeople(guests, { side: "partner_a" }).map((p) => (p as { id: string }).id)).toEqual(["a", "c"]));
});
