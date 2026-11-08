import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spec 45: every drag screen uses `useDragSensors` (touch waits for a press,
 * the keyboard can move things), and none sets up its own sensors. A new
 * DndContext that forgets fails here.
 */
const ROOT = join(process.cwd(), "src");
const files = readdirSync(ROOT, { recursive: true, encoding: "utf8" })
  .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
  .map((name) => join(ROOT, name))
  .filter((file) => readFileSync(file, "utf8").includes("<DndContext"));

describe("drag screens use the shared sensors", () => {
  it("finds the drag screens", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files.map((file) => [file.slice(ROOT.length + 1), file]))("%s", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source, "use useDragSensors() for this DndContext").toMatch(/useDragSensors\(/);
    expect(source, "pass sensors={...} to every DndContext").not.toMatch(/<DndContext(?![^>]*sensors=)[^>]*>/);
    expect(source, "don't build sensors by hand; useDragSensors does it").not.toMatch(/useSensors\(|PointerSensor/);
  });
});
