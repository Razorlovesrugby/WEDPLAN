import { describe, expect, it } from "vitest";
import { householdReply, replyToAll } from "./rsvp-household";

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
