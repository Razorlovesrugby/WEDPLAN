import { describe, expect, it } from "vitest";
import { saveTheDateWhatsappMessage, whatsappMessage } from "./templates-client";

describe("saveTheDateWhatsappMessage", () => {
  const url = "https://example.test/w/ray-and-olivia/okonkwo-4f7ak/save-the-date";

  it("reads as a save-the-date, not an invitation", () => {
    const text = saveTheDateWhatsappMessage({
      householdName: "The Okonkwos",
      dateLabel: "14 March 2027",
      location: "Wānaka",
      url,
    });
    expect(text.startsWith("The Okonkwos — save the date!")).toBe(true);
    expect(text).toContain("on 14 March 2027 in Wānaka");
    expect(text).toContain(url);
    expect(text).not.toMatch(/rsvp/i);
  });

  it("leaves out what it doesn't know rather than printing a gap", () => {
    const text = saveTheDateWhatsappMessage({
      householdName: "The Okonkwos",
      dateLabel: null,
      location: null,
      url,
    });
    expect(text).toContain("We're getting married, and we'd love you to be there.");
  });

  it("is never the same message as the invitation's", () => {
    const invite = whatsappMessage({
      weddingName: "Ray & Olivia",
      householdName: "The Okonkwos",
      dateLabel: "14 March 2027",
      url,
    });
    expect(invite.split("\n")[0]).not.toBe(
      saveTheDateWhatsappMessage({ householdName: "The Okonkwos", dateLabel: null, location: null, url }).split("\n")[0],
    );
  });
});
