import { describe, expect, it } from "vitest";
import { formatAnswerValue } from "./answer-format";

describe("formatAnswerValue", () => {
  it("renders an unanswered question as a dash", () => {
    expect(formatAnswerValue(null, "short_text")).toBe("—");
  });

  it("renders boolean answers as Yes or No, not the stored yes/no", () => {
    expect(formatAnswerValue("yes", "boolean")).toBe("Yes");
    expect(formatAnswerValue("no", "boolean")).toBe("No");
  });

  it("joins a multi-select array with commas", () => {
    expect(formatAnswerValue(["Coach", "Parking"], "multi_select")).toBe("Coach, Parking");
  });

  it("renders an empty array as a dash, not an empty string", () => {
    expect(formatAnswerValue([], "multi_select")).toBe("—");
  });

  it("passes text and number answers through as stored", () => {
    expect(formatAnswerValue("Beef", "single_select")).toBe("Beef");
    expect(formatAnswerValue("2", "number")).toBe("2");
  });
});
