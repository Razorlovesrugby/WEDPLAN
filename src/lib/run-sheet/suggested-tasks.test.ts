import { describe, expect, it } from "vitest";
import { MAX_STEPS } from "@/lib/run-sheet";
import { SUGGESTED_TASKS, suggestedTask } from "./suggested-tasks";

describe("suggested tasks", () => {
  it("has the ten the spec names, with unique keys", () => {
    expect(SUGGESTED_TASKS).toHaveLength(10);
    expect(new Set(SUGGESTED_TASKS.map((t) => t.key)).size).toBe(10);
  });
  it("fits what a task can hold", () => {
    for (const t of SUGGESTED_TASKS) {
      expect(t.title.length).toBeLessThanOrEqual(200);
      expect(t.instructions.length).toBeLessThanOrEqual(2000);
      expect(t.steps.length).toBeLessThanOrEqual(MAX_STEPS);
      expect(t.bring.length).toBeLessThanOrEqual(MAX_STEPS);
      expect(t.minutes).toBeGreaterThan(0);
    }
  });
  it("links the family wrangler to the shot list", () => {
    expect(suggestedTask("family_photos")?.opensModule).toBe("shot_list");
    expect(suggestedTask("nope")).toBeNull();
  });
});
