import { describe, expect, it } from "vitest";
import { previewHouseholds } from "./preview-households";

const house = (id: string, name: string) => ({ id, display_name: name });
const invite = (household_id: string, events: string[]) => ({
  household_id,
  invitation_events: events.map((event_id) => ({ event_id })),
});

describe("previewHouseholds", () => {
  it("puts the household invited to the most events first", () => {
    const list = previewHouseholds(
      [house("a", "Abara"), house("o", "Okonkwo"), house("z", "Zhou")],
      [invite("a", ["e1"]), invite("o", ["e1", "e2", "e3"]), invite("z", ["e1", "e2"])],
    );
    expect(list.map((h) => h.id)).toEqual(["o", "z", "a"]);
    expect(list[0]?.eventCount).toBe(3);
  });

  it("breaks ties by name, so the default is stable", () => {
    const list = previewHouseholds(
      [house("b", "Bello"), house("a", "Abara")],
      [invite("b", ["e1"]), invite("a", ["e1"])],
    );
    expect(list.map((h) => h.name)).toEqual(["Abara", "Bello"]);
  });

  it("counts a household with no invitation as invited to nothing", () => {
    const list = previewHouseholds([house("a", "Abara")], []);
    expect(list).toEqual([{ id: "a", name: "Abara", eventCount: 0 }]);
  });

  it("tolerates an invitation whose events came back null", () => {
    const list = previewHouseholds(
      [house("a", "Abara")],
      [{ household_id: "a", invitation_events: null }],
    );
    expect(list[0]?.eventCount).toBe(0);
  });

  it("counts an event once however it is listed", () => {
    const list = previewHouseholds([house("a", "Abara")], [invite("a", ["e1", "e1"])]);
    expect(list[0]?.eventCount).toBe(1);
  });
});
