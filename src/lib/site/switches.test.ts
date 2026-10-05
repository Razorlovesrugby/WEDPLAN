import { describe, expect, it } from "vitest";
import { MOTION_EFFECTS } from "./motion";
import { SWITCHES, switchById } from "./switches";

describe("the switch registry", () => {
  it("has unique ids", () => {
    const ids = SWITCHES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every motion effect a switch — an effect with none cannot be turned off", () => {
    for (const effect of MOTION_EFFECTS) expect(switchById(`motion.${effect}`), effect).toBeDefined();
  });

  it("says, for every switch, where it lives and what the page does without it", () => {
    for (const entry of SWITCHES) {
      expect(entry.label.trim(), entry.id).not.toBe("");
      expect(entry.where.trim(), entry.id).not.toBe("");
      expect(entry.whenOff.trim(), `${entry.id} must say it leaves no hole`).not.toBe("");
    }
  });

  it("registers no switch for a motion effect that does not exist", () => {
    const known = new Set<string>(MOTION_EFFECTS);
    for (const entry of SWITCHES.filter((candidate) => candidate.group === "motion")) {
      expect(known.has(entry.id.replace("motion.", "")), entry.id).toBe(true);
    }
  });
});
