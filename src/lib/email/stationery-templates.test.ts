import { describe, expect, it } from "vitest";
import { broadcastEmail, invitationEmail, saveTheDateEmail } from "./templates";

describe("saveTheDateEmail", () => {
  const base = {
    weddingName: "Alex & Sam",
    householdName: "The Okonkwos",
    dateLabel: "Saturday 12 June 2027",
    location: "Bath",
    url: "https://example.test/i/token",
  };

  it("puts the date in the subject, because the date is the whole message", () => {
    expect(saveTheDateEmail(base).subject).toBe("Save the date — Alex & Sam, Saturday 12 June 2027");
  });

  it("addresses the household and names the place", () => {
    const { text } = saveTheDateEmail(base);
    expect(text).toContain("The Okonkwos,");
    expect(text).toContain("in Bath");
  });

  it("reads correctly with no location", () => {
    // "getting married in , and" is the failure this guards.
    const { text } = saveTheDateEmail({ ...base, location: null });
    expect(text).toContain("We're getting married, and");
    expect(text).not.toContain(" in ,");
  });

  it("asks for nothing — no RSVP, no deadline", () => {
    const { text, html } = saveTheDateEmail(base);
    for (const body of [text, html]) {
      expect(body.toLowerCase()).not.toContain("rsvp");
      expect(body.toLowerCase()).not.toContain("reply by");
    }
  });

  it("links to the card rather than the RSVP form", () => {
    // Replies are not open yet; sending people to a form that refuses them is
    // worse than not linking at all.
    const { text, html } = saveTheDateEmail(base);
    expect(text).toContain("/i/token");
    expect(html).toContain("/i/token");
    expect(text).not.toContain("/rsvp/");
  });

  it("is written as 'we'", () => {
    expect(saveTheDateEmail(base).text).toContain("We're getting married");
  });

  it("escapes HTML in names rather than injecting it", () => {
    const { html } = saveTheDateEmail({ ...base, householdName: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a location containing markup", () => {
    const { html } = saveTheDateEmail({ ...base, location: "Bath<img src=x onerror=1>" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("broadcastEmail", () => {
  const base = {
    weddingName: "Alex & Sam",
    householdName: "The Okonkwos",
    subject: "The coach now leaves at two",
    body: "Small change to Saturday.\n\nThe coach leaves The Crown at 14:00, not 14:20.",
    url: "https://example.test/rsvp/token",
  };

  it("uses the planner's own subject verbatim", () => {
    expect(broadcastEmail(base).subject).toBe("The coach now leaves at two");
  });

  it("keeps paragraph breaks as paragraphs", () => {
    const { html } = broadcastEmail(base);
    expect(html).toContain("<p>Small change to Saturday.</p>");
    expect(html).toContain("14:00, not 14:20");
  });

  it("links to the RSVP page, not the card", () => {
    // A broadcast goes out after the invitation, so the useful destination is
    // the household's own details and answers.
    expect(broadcastEmail(base).text).toContain("/rsvp/token");
  });

  it("escapes markup in the planner's body", () => {
    // The planner is trusted, but the body is pasted text and a stray < in
    // "<2 hours" should render, not disappear into a broken tag.
    const { html } = broadcastEmail({ ...base, body: "Under <2 hours from London" });
    expect(html).toContain("&lt;2 hours");
    expect(html).not.toContain("<2 hours");
  });

  it("turns a single newline into a line break inside a paragraph", () => {
    const { html } = broadcastEmail({ ...base, body: "Line one\nLine two" });
    expect(html).toContain("Line one<br>Line two");
  });
});

describe("invitationEmail — one-tap replies (spec 22 §8)", () => {
  const base = {
    weddingName: "Alex & Sam",
    householdName: "The Okonkwos",
    dateLabel: "Saturday 12 June 2027",
    url: "https://example.test/w/alex-sam/okonkwo-4f7ak",
  };

  it("carries a Yes and a No that land on the household's own page", () => {
    const { html } = invitationEmail(base);
    expect(html).toContain("https://example.test/w/alex-sam/okonkwo-4f7ak?reply=yes");
    expect(html).toContain("https://example.test/w/alex-sam/okonkwo-4f7ak?reply=no");
  });

  it("offers both in the plain-text part too", () => {
    // A mail client that refuses HTML still has to be able to reply.
    const { text } = invitationEmail(base);
    expect(text).toContain("?reply=yes");
    expect(text).toContain("?reply=no");
  });

  it("still links the page itself, for somebody who wants to look first", () => {
    const { html } = invitationEmail(base);
    expect(html).toContain('href="https://example.test/w/alex-sam/okonkwo-4f7ak"');
  });

  it("never sends a token link — the address is the only link now (spec 21 Q6)", () => {
    const { html, text } = invitationEmail(base);
    expect(html).not.toContain("/rsvp/");
    expect(text).not.toContain("/rsvp/");
  });
});
