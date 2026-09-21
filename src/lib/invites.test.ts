import { describe, expect, it } from "vitest";
import {
  actionsFor,
  eventsForHousehold,
  inviteState,
  invitedForLine,
  invitedGuestIds,
  isOutstanding,
  listNames,
  needsConfirm,
  type InviteRow,
} from "./invites";

const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  guest_id: "g1",
  event_id: "e1",
  invited: true,
  household_invited: true,
  override: null,
  sent_at: null,
  ...over,
});

describe("inviteState", () => {
  it("is empty for somebody who is not invited, whatever else is true", () => {
    expect(inviteState(invite({ invited: false }), undefined)).toBe("not_invited");
    expect(inviteState(invite({ invited: false, sent_at: "2027-03-01" }), "yes")).toBe(
      "not_invited",
    );
    expect(inviteState(undefined, "yes")).toBe("not_invited");
  });

  it("distinguishes invited from sent", () => {
    expect(inviteState(invite(), undefined)).toBe("invited");
    expect(inviteState(invite({ sent_at: "2027-03-01" }), "pending")).toBe("sent");
  });

  it("lets an answer outrank the invitation state", () => {
    // Once somebody replies, "sent" stops being the interesting fact.
    expect(inviteState(invite({ sent_at: "2027-03-01" }), "yes")).toBe("yes");
    expect(inviteState(invite({ sent_at: "2027-03-01" }), "no")).toBe("no");
    expect(inviteState(invite(), "maybe")).toBe("maybe");
  });
});

describe("actionsFor", () => {
  it("offers only inviting when they are not invited", () => {
    expect(actionsFor("not_invited")).toEqual(["invite"]);
  });

  it("offers marking as sent only before it has been sent", () => {
    expect(actionsFor("invited")).toContain("mark_sent");
    expect(actionsFor("sent")).not.toContain("mark_sent");
    expect(actionsFor("yes")).not.toContain("mark_sent");
  });

  it("offers clearing an answer only when there is one", () => {
    expect(actionsFor("sent")).not.toContain("clear_answer");
    expect(actionsFor("yes")).toContain("clear_answer");
  });

  it("always ends with remove, so it is nowhere near the answers", () => {
    for (const state of ["invited", "sent", "yes", "no", "maybe"] as const) {
      expect(actionsFor(state).at(-1)).toBe("remove");
    }
  });
});

describe("needsConfirm", () => {
  it("confirms marking as sent, because it writes a household-wide fact", () => {
    expect(needsConfirm("mark_sent", "invited")).toBe(true);
  });

  it("confirms removing somebody who has answered, and not somebody who hasn't", () => {
    expect(needsConfirm("remove", "yes")).toBe(true);
    expect(needsConfirm("remove", "no")).toBe(true);
    expect(needsConfirm("remove", "sent")).toBe(false);
    expect(needsConfirm("remove", "invited")).toBe(false);
  });

  it("does not confirm the ordinary answer changes", () => {
    expect(needsConfirm("set_yes", "sent")).toBe(false);
    expect(needsConfirm("clear_answer", "yes")).toBe(false);
  });
});

describe("listNames", () => {
  it("reads like a person wrote it", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["Ada"])).toBe("Ada");
    expect(listNames(["Chidi", "Ada"])).toBe("Chidi and Ada");
    expect(listNames(["Chidi", "Ada", "Zara"])).toBe("Chidi, Ada and Zara");
  });
});

describe("invitedForLine", () => {
  const members = [
    { id: "a", name: "Chidi" },
    { id: "b", name: "Ada" },
    { id: "c", name: "Zara" },
  ];

  it("says nothing when the whole household is invited", () => {
    expect(invitedForLine(members, new Set(["a", "b", "c"]))).toBeNull();
  });

  it("names who it is for when only some of them are", () => {
    expect(invitedForLine(members, new Set(["a", "b"]))).toBe("For Chidi and Ada");
  });

  it("never names who is not invited", () => {
    // The whole point of Q2: this line is as likely to be read by Zara as by
    // her parents.
    const line = invitedForLine(members, new Set(["a", "b"]))!;
    expect(line).not.toContain("Zara");
  });

  it("says nothing when nobody is invited — the event is simply not shown", () => {
    expect(invitedForLine(members, new Set())).toBeNull();
  });
});

describe("eventsForHousehold", () => {
  const events = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];

  it("keeps an event one member is invited to", () => {
    const invites = [
      invite({ guest_id: "a", event_id: "e1", invited: true }),
      invite({ guest_id: "b", event_id: "e1", invited: false }),
      invite({ guest_id: "a", event_id: "e2", invited: false }),
      invite({ guest_id: "b", event_id: "e2", invited: false }),
    ];
    expect(eventsForHousehold(events, invites).map((e) => e.id)).toEqual(["e1"]);
  });

  it("drops an event nobody is invited to rather than marking it", () => {
    const invites = [invite({ event_id: "e1", invited: false })];
    expect(eventsForHousehold(events, invites)).toEqual([]);
  });

  it("keeps the order it was given", () => {
    const invites = events.map((e) => invite({ event_id: e.id, invited: true }));
    expect(eventsForHousehold(events, invites).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("invitedGuestIds", () => {
  it("is the set the RSVP form is narrowed to", () => {
    const invites = [
      invite({ guest_id: "a", event_id: "e1", invited: true }),
      invite({ guest_id: "b", event_id: "e1", invited: false }),
      invite({ guest_id: "b", event_id: "e2", invited: true }),
    ];
    expect([...invitedGuestIds(invites, "e1")]).toEqual(["a"]);
    expect([...invitedGuestIds(invites, "e2")]).toEqual(["b"]);
  });
});

describe("isOutstanding", () => {
  const invites = [
    invite({ guest_id: "a", event_id: "e1" }),
    invite({ guest_id: "a", event_id: "e2" }),
    invite({ guest_id: "b", event_id: "e1", invited: false }),
  ];

  it("is true while an invited person has an unanswered event", () => {
    expect(isOutstanding(invites, new Map([["a:e1", "yes"]]))).toBe(true);
  });

  it("is false once every invited pair has an answer", () => {
    expect(
      isOutstanding(
        invites,
        new Map([
          ["a:e1", "yes"],
          ["a:e2", "no"],
        ]),
      ),
    ).toBe(false);
  });

  it("ignores pairs nobody is invited to", () => {
    // b is not invited to e1, so b's silence is not outstanding.
    expect(
      isOutstanding(
        invites,
        new Map([
          ["a:e1", "yes"],
          ["a:e2", "maybe"],
        ]),
      ),
    ).toBe(false);
  });

  it("treats an explicit pending like no answer at all", () => {
    expect(
      isOutstanding(
        invites,
        new Map([
          ["a:e1", "pending"],
          ["a:e2", "yes"],
        ]),
      ),
    ).toBe(true);
  });
});
