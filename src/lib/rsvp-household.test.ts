import { describe, expect, it } from "vitest";
import {
  GUEST_REPLY_STATUSES,
  guestFacingStatus,
  householdReply,
  isChipQuestion,
  isNotComing,
  replyToAll,
  unansweredChips,
} from "./rsvp-household";

describe("householdReply", () => {
  it("lights a card only when every invited pair agrees", () => {
    expect(householdReply([{ a: "yes", b: "yes" }, { a: "yes" }])).toBe("yes");
    expect(householdReply([{ a: "no" }, { a: "no", b: "no" }])).toBe("no");
  });

  it("lights neither when the rows disagree", () => {
    expect(householdReply([{ a: "yes" }, { a: "no" }])).toBeNull();
    expect(householdReply([{ a: "yes", b: "maybe" }])).toBeNull();
  });

  it("lights neither before anybody has answered", () => {
    expect(householdReply([{ a: "pending" }, { a: "pending" }])).toBeNull();
    // A household invited to nothing has no collective answer to give.
    expect(householdReply([])).toBeNull();
    expect(householdReply([{}, {}])).toBeNull();
  });
});

describe("replyToAll", () => {
  it("sets every invited pair and invents none", () => {
    expect(replyToAll({ a: "pending", b: "no" }, "yes")).toEqual({ a: "yes", b: "yes" });
    // A guest invited to nothing stays invited to nothing.
    expect(replyToAll({}, "yes")).toEqual({});
  });
});

describe("what a guest may answer (spec 28 §7a.1)", () => {
  it("has no Maybe", () => {
    expect([...GUEST_REPLY_STATUSES]).toEqual(["yes", "no", "pending"]);
  });

  it("opens a hand-recorded maybe as unanswered", () => {
    expect(guestFacingStatus("yes")).toBe("yes");
    expect(guestFacingStatus("no")).toBe("no");
    expect(guestFacingStatus("pending")).toBe("pending");
    expect(guestFacingStatus("maybe")).toBe("pending");
  });
});

describe("isNotComing (spec 35 Q2)", () => {
  it("is true only once every invited event is a no", () => {
    expect(isNotComing({ a: "no", b: "no" })).toBe(true);
    expect(isNotComing({ a: "no", b: "yes" })).toBe(false);
    expect(isNotComing({ a: "no", b: "pending" })).toBe(false);
  });

  it("is false for somebody invited to nothing", () => {
    expect(isNotComing({})).toBe(false);
  });
});

describe("unansweredChips (spec 35 §6 item 7)", () => {
  const q = (id: string, type: string, required: boolean, options: unknown = []) => ({
    id,
    type,
    required,
    options,
  });

  it("treats a select with options, and every yes/no, as chips", () => {
    expect(isChipQuestion(q("a", "single_select", true, ["Lamb"]))).toBe(true);
    expect(isChipQuestion(q("b", "multi_select", true, ["Fri"]))).toBe(true);
    expect(isChipQuestion(q("c", "boolean", true))).toBe(true);
  });

  it("leaves text boxes, and selects with no options, to the browser", () => {
    expect(isChipQuestion(q("a", "single_select", true, []))).toBe(false);
    expect(isChipQuestion(q("b", "single_select", true, [""]))).toBe(false);
    expect(isChipQuestion(q("c", "short_text", true))).toBe(false);
  });

  it("lists required chip questions with no answer, an empty string or an empty list", () => {
    const questions = [
      q("meal", "single_select", true, ["Lamb", "Snapper"]),
      q("days", "multi_select", true, ["Fri", "Sat"]),
      q("coach", "boolean", true),
      q("optional", "single_select", false, ["X"]),
      q("song", "short_text", true),
    ];
    expect(unansweredChips(questions, { days: [], coach: "" })).toEqual(["meal", "days", "coach"]);
    expect(unansweredChips(questions, { meal: "Lamb", days: ["Sat"], coach: "no" })).toEqual([]);
  });
});
