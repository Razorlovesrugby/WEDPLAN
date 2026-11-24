import { describe, expect, it } from "vitest";
import { filterByAssignee } from "./by-person";

const U = "aaaaaaaa-0000-4000-8000-000000000001";
const P = "a9000000-0000-4000-8000-000000000001";
const items = [
  { id: "1", assigned_to: U, assigned_person_id: null },
  { id: "2", assigned_to: null, assigned_person_id: P },
  { id: "3", assigned_to: null, assigned_person_id: null },
  { id: "4", assigned_to: null, assigned_person_id: P },
];

describe("filterByAssignee", () => {
  it("keeps a collaborator's items", () => {
    expect(filterByAssignee(items, `u:${U}`).map((i) => i.id)).toEqual(["1"]);
  });

  it("keeps a person's items", () => {
    expect(filterByAssignee(items, `p:${P}`).map((i) => i.id)).toEqual(["2", "4"]);
  });

  it("is no filter for nothing or for a value it doesn't recognise", () => {
    for (const who of ["", null, undefined, "p:nope", "robot:1"]) {
      expect(filterByAssignee(items, who)).toHaveLength(4);
    }
  });

  it("finds nobody for someone with no items", () => {
    expect(filterByAssignee(items, "p:a9000000-0000-4000-8000-0000000000ff")).toEqual([]);
  });
});
