import { describe, expect, it } from "vitest";
import { SHOTS_CSV_HEADER, shotsCsvRows } from "./export";
import type { ShotSectionItem } from "./model";

describe("shotsCsvRows", () => {
  const sections: ShotSectionItem[] = [
    {
      id: "s1", name: "Family formals", location: null, runSheetItemId: null, startsAt: null, endsAt: null, sortOrder: 1,
      shots: [
        { id: "a", sectionId: "s1", title: "Everyone", kind: "group", mustHave: true, minutes: 4, note: "Nan sits", shooter: null, referenceUrl: null, sortOrder: 1, status: "taken", statusAt: "2027-06-12T15:00:00Z", statusBy: "Lens", people: [{ key: "role:Best man", kind: "role", role: "Best man", name: "Best man" }] },
        { id: "b", sectionId: "s1", title: "Rings", kind: "detail", mustHave: false, minutes: 0, note: null, shooter: null, referenceUrl: null, sortOrder: 2, status: "todo", statusAt: null, statusBy: null, people: [] },
      ],
    },
  ];
  it("makes one row per shot in order, matching the header", () => {
    const rows = shotsCsvRows(sections);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(SHOTS_CSV_HEADER.length);
    expect(rows[0]!.slice(0, 6)).toEqual(["Family formals", "1", "Everyone", "group", "yes", "Best man"]);
    expect(rows[1]![1]).toBe("2");
  });
});
