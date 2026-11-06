import { describe, expect, it } from "vitest";
import {
  assigneeColumns,
  assigneeLabel,
  assigneeOptions,
  cleanPersonName,
  collaboratorLabel,
  encodeAssignee,
  itemAssigneeValue,
  parseAssignee,
  personIdForUser,
} from "./people";

const U1 = "aaaaaaaa-0000-4000-8000-000000000001";
const U2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P1 = "a9000000-0000-4000-8000-000000000001";

const owner = { user_id: U1, role: "owner" as const, display_name: null };
const partner = { user_id: U2, role: "partner" as const, display_name: "Sam" };
const pat = { id: P1, name: "Pat (planner)", deleted_at: null };

describe("parseAssignee / encodeAssignee", () => {
  it("round-trips a collaborator, a person and nobody", () => {
    for (const a of [
      { kind: "user", id: U1 },
      { kind: "person", id: P1 },
      { kind: "none" },
    ] as const) {
      expect(parseAssignee(encodeAssignee(a))).toEqual(a);
    }
  });

  it("reads anything unrecognised as nobody, never throws", () => {
    expect(parseAssignee("")).toEqual({ kind: "none" });
    expect(parseAssignee(null)).toEqual({ kind: "none" });
    expect(parseAssignee("x:123")).toEqual({ kind: "none" });
    expect(parseAssignee("p:not-a-uuid")).toEqual({ kind: "none" });
    expect(parseAssignee(`u:${U1}; drop table`)).toEqual({ kind: "none" });
  });
});

describe("assigneeColumns: at most one of the two", () => {
  it("sets exactly the column that matches and clears the other", () => {
    expect(assigneeColumns({ kind: "user", id: U1 })).toEqual({ assigned_to: U1, assigned_person_id: null });
    expect(assigneeColumns({ kind: "person", id: P1 })).toEqual({ assigned_to: null, assigned_person_id: P1 });
    expect(assigneeColumns({ kind: "none" })).toEqual({ assigned_to: null, assigned_person_id: null });
  });

  it("never returns both set", () => {
    for (const a of [
      { kind: "user", id: U1 },
      { kind: "person", id: P1 },
      { kind: "none" },
    ] as const) {
      const c = assigneeColumns(a);
      expect(c.assigned_to !== null && c.assigned_person_id !== null).toBe(false);
    }
  });
});

describe("itemAssigneeValue", () => {
  it("prefers the collaborator column if both are somehow set", () => {
    expect(itemAssigneeValue({ assigned_to: U1, assigned_person_id: P1 })).toBe(`u:${U1}`);
    expect(itemAssigneeValue({ assigned_to: null, assigned_person_id: P1 })).toBe(`p:${P1}`);
    expect(itemAssigneeValue({ assigned_to: null, assigned_person_id: null })).toBe("");
  });
});

describe("labels", () => {
  it("keeps the old collaborator fallbacks", () => {
    expect(collaboratorLabel(owner, U1)).toBe("You");
    expect(collaboratorLabel(owner, U2)).toBe("Owner");
    expect(collaboratorLabel({ ...partner, display_name: null }, U1)).toBe("Partner");
    expect(collaboratorLabel(partner, U1)).toBe("Sam");
    expect(collaboratorLabel({ ...partner, display_name: "   " }, U1)).toBe("Partner");
  });

  it("labels a row by whichever column is set", () => {
    const cs = [owner, partner];
    const ps = [pat];
    expect(assigneeLabel({ assigned_to: U2, assigned_person_id: null }, cs, ps, U1)).toBe("Sam");
    expect(assigneeLabel({ assigned_to: null, assigned_person_id: P1 }, cs, ps, U1)).toBe("Pat (planner)");
    expect(assigneeLabel({ assigned_to: null, assigned_person_id: null }, cs, ps, U1)).toBeNull();
    expect(assigneeLabel({ assigned_to: null, assigned_person_id: "zzz" }, cs, ps, U1)).toBeNull();
  });
});

describe("assigneeOptions", () => {
  it("lists collaborators first, then people", () => {
    const options = assigneeOptions([owner, partner], [pat], U1);
    expect(options.map((o) => o.label)).toEqual(["You", "Sam", "Pat (planner)"]);
    expect(options.map((o) => o.value)).toEqual([`u:${U1}`, `u:${U2}`, `p:${P1}`]);
  });

  it("hides a removed person unless a task still holds them", () => {
    const gone = { id: P1, name: "Pat", deleted_at: "2026-11-01T00:00:00Z" };
    expect(assigneeOptions([owner], [gone], U1)).toHaveLength(1);
    const kept = assigneeOptions([owner], [gone], U1, `p:${P1}`);
    expect(kept).toHaveLength(2);
    expect(kept[1]?.label).toBe("Pat (removed)");
  });
});

describe("cleanPersonName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanPersonName("  Pat   Planner ")).toBe("Pat Planner");
  });
  it("refuses blank and over 80", () => {
    expect(cleanPersonName("   ")).toBeNull();
    expect(cleanPersonName("x".repeat(81))).toBeNull();
    expect(cleanPersonName("x".repeat(80))).toHaveLength(80);
  });
});

describe("personIdForUser", () => {
  it("finds the planner's own people row, ignoring removed ones", () => {
    const people = [
      { id: P1, user_id: U2, deleted_at: null },
      { id: "other", user_id: null, deleted_at: null },
    ];
    expect(personIdForUser(people, U2)).toBe(P1);
    expect(personIdForUser(people, U1)).toBeNull();
    expect(personIdForUser(people, undefined)).toBeNull();
    expect(personIdForUser([{ id: P1, user_id: U2, deleted_at: "x" }], U2)).toBeNull();
  });
});
