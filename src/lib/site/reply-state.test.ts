import { describe, expect, it } from "vitest";
import {
  replyBarCopy,
  replyByLabel,
  replyConfirmation,
  replyMembersFromContext,
  summariseReply,
  type ReplyMember,
} from "./reply-state";

const person = (name: string, ...responses: ReplyMember["responses"]): ReplyMember => ({ name, responses });

describe("summariseReply", () => {
  it("is none when nobody has answered", () => {
    expect(summariseReply([person("Chidi", "pending", "pending"), person("Ada", "pending")]).state).toBe("none");
  });

  it("is none for nobody at all", () => {
    expect(summariseReply([]).state).toBe("none");
    // …and a person invited to nothing is not a person to wait for.
    expect(summariseReply([person("Zara")]).state).toBe("none");
  });

  it("is partial while any person has anything left to answer", () => {
    expect(summariseReply([person("Chidi", "yes", "yes"), person("Ada", "pending")]).state).toBe("partial");
    // One person, half answered.
    expect(summariseReply([person("Chidi", "yes", "pending")]).state).toBe("partial");
  });

  it("is yes only when everyone said yes to everything", () => {
    const summary = summariseReply([person("Chidi", "yes", "yes"), person("Ada", "yes")]);
    expect(summary.state).toBe("yes");
    expect(summary.coming).toEqual(["Chidi", "Ada"]);
  });

  it("is no only when everyone said no to everything", () => {
    expect(summariseReply([person("Chidi", "no"), person("Ada", "no", "no")]).state).toBe("no");
  });

  it("is mixed when everybody has answered and not alike", () => {
    const summary = summariseReply([person("Chidi", "yes", "yes"), person("Ada", "no")]);
    expect(summary.state).toBe("mixed");
    expect(summary.coming).toEqual(["Chidi"]);
    expect(summary.declining).toEqual(["Ada"]);
  });

  it("calls a maybe, or a yes-and-no, unsure", () => {
    expect(summariseReply([person("Chidi", "maybe")]).unsure).toEqual(["Chidi"]);
    expect(summariseReply([person("Chidi", "yes", "no")]).unsure).toEqual(["Chidi"]);
    expect(summariseReply([person("Chidi", "maybe")]).state).toBe("mixed");
  });

  it("judges a child on the events they are invited to, and no others", () => {
    // The child is invited to the day events only, so two yeses is a full yes.
    expect(summariseReply([person("Chidi", "yes", "yes", "yes"), person("Kemi", "yes", "yes")]).state).toBe("yes");
  });
});

describe("replyBarCopy", () => {
  const by = "1 May";

  it("asks for the reply, with the date when there is one", () => {
    expect(replyBarCopy(summariseReply([person("Chidi", "pending")]), by)).toEqual({
      text: "Your reply · by 1 May",
      action: "Reply",
    });
    expect(replyBarCopy(summariseReply([person("Chidi", "pending")]), null).text).toBe("Your reply");
  });

  it("asks to finish a half-done reply", () => {
    const summary = summariseReply([person("Chidi", "yes"), person("Ada", "pending")]);
    expect(replyBarCopy(summary, by)).toEqual({ text: "Finish your reply · by 1 May", action: "Continue" });
  });

  it("says what they said back to them", () => {
    expect(replyBarCopy(summariseReply([person("Chidi", "yes"), person("Ada", "yes")]), by)).toEqual({
      text: "You're coming — Chidi and Ada",
      action: "Change",
    });
    expect(replyBarCopy(summariseReply([person("Chidi", "no")]), by).text).toBe("You can't make it");
  });

  it("leads with who is coming in a split household, and drops the date once they have replied", () => {
    const text = replyBarCopy(summariseReply([person("Chidi", "yes"), person("Ada", "no")]), by).text;
    expect(text).toBe("Chidi coming");
    expect(text).not.toContain("by");
  });
});

describe("replyConfirmation", () => {
  it("names each group once", () => {
    const { heading, lines } = replyConfirmation(
      summariseReply([person("Chidi", "yes"), person("Ada", "no"), person("Zara", "maybe")]),
    );
    expect(heading).toBe("Thank you — that's all noted");
    expect(lines).toEqual(["Chidi — coming", "Zara — not sure yet", "Ada — can't make it"]);
  });

  it("is warm for a full yes and kind for a full no", () => {
    expect(replyConfirmation(summariseReply([person("Chidi", "yes")])).heading).toBe("We can't wait to see you");
    expect(replyConfirmation(summariseReply([person("Chidi", "no")])).heading).toBe("We'll miss you");
  });

  it("has nothing to confirm when nothing was answered", () => {
    expect(replyConfirmation(summariseReply([person("Chidi", "pending")]))).toEqual({
      heading: "Thank you",
      lines: [],
    });
  });
});

describe("replyMembersFromContext", () => {
  const guests = [
    { id: "g1", first_name: "Chidi", preferred_name: null },
    { id: "g2", first_name: "Adaeze", preferred_name: "Ada" },
  ];

  it("uses what they go by, and one status per invited event", () => {
    const members = replyMembersFromContext({
      guests,
      invites: [
        { guest_id: "g1", event_id: "e1" },
        { guest_id: "g1", event_id: "e2" },
        { guest_id: "g2", event_id: "e1" },
      ],
      rsvps: [
        { guest_id: "g1", event_id: "e1", status: "yes" },
        { guest_id: "g2", event_id: "e1", status: "no" },
      ],
    });
    expect(members).toEqual([
      { name: "Chidi", responses: ["yes", "pending"] },
      { name: "Ada", responses: ["no"] },
    ]);
  });

  it("ignores an answer for an event they are no longer invited to", () => {
    // An answer kept from before an un-invite must not count (spec 22 §4).
    const members = replyMembersFromContext({
      guests: [guests[0]!],
      invites: [{ guest_id: "g1", event_id: "e1" }],
      rsvps: [
        { guest_id: "g1", event_id: "e1", status: "yes" },
        { guest_id: "g1", event_id: "gone", status: "no" },
      ],
    });
    expect(members[0]?.responses).toEqual(["yes"]);
  });

  it("leaves a person invited to nothing with no responses, so they are not waited for", () => {
    const members = replyMembersFromContext({ guests, invites: [], rsvps: [] });
    expect(summariseReply(members).state).toBe("none");
    expect(members.every((member) => member.responses.length === 0)).toBe(true);
  });
});

describe("replyByLabel", () => {
  it("is the day and month in the wedding's timezone", () => {
    expect(replyByLabel("2027-04-30T20:00:00Z", "Pacific/Auckland")).toBe("1 May");
    expect(replyByLabel("2027-04-30T20:00:00Z", "UTC")).toBe("30 April");
  });

  it("is null for nothing, and for rubbish", () => {
    expect(replyByLabel(null, "UTC")).toBeNull();
    expect(replyByLabel("", "UTC")).toBeNull();
    expect(replyByLabel("soon", "UTC")).toBeNull();
  });
});
