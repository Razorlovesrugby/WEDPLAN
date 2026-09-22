import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAVE_THE_DATE,
  allDayRange,
  calendarEventTitle,
  googleCalendarUrl,
  orderByIds,
  pickSaveTheDatePhotos,
  resolveSaveTheDate,
  saveTheDateDisplay,
  saveTheDatePath,
  saveTheDatePayload,
  writeOutDate,
} from "./save-the-date";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("saveTheDatePath", () => {
  it("hangs off the household's own address, suffix and all", () => {
    expect(saveTheDatePath("ray-and-olivia", { slug: "okonkwo", suffix: "4f7ak" })).toBe(
      "/w/ray-and-olivia/okonkwo-4f7ak/save-the-date",
    );
  });
});

describe("resolveSaveTheDate", () => {
  it("gives the defaults for nothing saved", () => {
    expect(resolveSaveTheDate(null)).toEqual(DEFAULT_SAVE_THE_DATE);
    expect(resolveSaveTheDate("junk")).toEqual(DEFAULT_SAVE_THE_DATE);
  });

  it("round-trips through the stored payload", () => {
    const content = {
      ...DEFAULT_SAVE_THE_DATE,
      headline: "Ray & Olivia",
      location: "Wanaka",
      photoIds: [B, A],
      layout: "postcard" as const,
      palette: "sage" as const,
      showCountdown: true,
    };
    expect(resolveSaveTheDate(saveTheDatePayload(content))).toEqual(content);
  });

  it("keeps a chosen empty photo list apart from never having chosen", () => {
    expect(resolveSaveTheDate({ photo_ids: [] }).photoIds).toEqual([]);
    expect(resolveSaveTheDate({}).photoIds).toBeNull();
  });

  it("falls back field by field rather than failing the page", () => {
    const resolved = resolveSaveTheDate({
      layout: "carousel",
      palette: "neon",
      eyebrow: "   ",
      show_greeting: "yes",
      photo_ids: [A, "not-an-id", A, 7],
    });
    expect(resolved.layout).toBe("cover");
    expect(resolved.palette).toBe("site");
    expect(resolved.eyebrow).toBe("Save the date");
    expect(resolved.showGreeting).toBe(true);
    expect(resolved.photoIds).toEqual([A]);
  });
});

describe("saveTheDateDisplay", () => {
  const wedding = { name: "Ray & Olivia", wedding_date: "2027-03-14" };

  it("fills blanks from the wedding", () => {
    const display = saveTheDateDisplay(DEFAULT_SAVE_THE_DATE, wedding);
    expect(display.headline).toBe("Ray & Olivia");
    expect(display.dateLabel).toBe("14 March 2027");
  });

  it("uses what the couple wrote when they wrote something", () => {
    const display = saveTheDateDisplay(
      {
        ...DEFAULT_SAVE_THE_DATE,
        headline: "Olivia + Ray",
        dateLabel: "Autumn, 2027",
      },
      wedding,
    );
    expect(display.headline).toBe("Olivia + Ray");
    expect(display.dateLabel).toBe("Autumn, 2027");
  });
});

describe("writeOutDate", () => {
  it("prints the calendar day, whatever timezone the server is in", () => {
    expect(writeOutDate("2027-03-14")).toBe("14 March 2027");
    expect(writeOutDate(null)).toBeNull();
    expect(writeOutDate("soon")).toBeNull();
  });
});

describe("calendar links", () => {
  it("is an all-day range ending the next day, across a month end", () => {
    expect(allDayRange("2027-02-28")).toEqual({
      start: "20270228",
      end: "20270301",
    });
    expect(allDayRange(null)).toBeNull();
  });

  it("builds a Google link only when there is a date", () => {
    const url = googleCalendarUrl({
      title: "Ray & Olivia",
      weddingDate: "2027-03-14",
      location: "Wanaka",
      details: null,
    });
    expect(url).toContain("dates=20270314%2F20270315");
    expect(url).toContain("text=Ray+%26+Olivia");
    expect(
      googleCalendarUrl({
        title: "x",
        weddingDate: null,
        location: null,
        details: null,
      }),
    ).toBeNull();
  });
});

describe("photos", () => {
  const row = (
    id: string,
    kind: "hero" | "story" | "gallery" | "stay" | "party",
    sort_order = 0,
    uploaded_by_household: string | null = null,
  ) => ({ id, kind, sort_order, uploaded_by_household });

  it("leads with the hero, then story, then the couple's gallery", () => {
    const picked = pickSaveTheDatePhotos([
      row("g1", "gallery"),
      row("s2", "story", 2),
      row("h", "hero"),
      row("s1", "story", 1),
    ]);
    expect(picked.map((photo) => photo.id)).toEqual(["h", "s1", "s2", "g1"]);
  });

  it("never picks a guest's upload or a hotel photo on its own", () => {
    const picked = pickSaveTheDatePhotos([
      row("guest", "gallery", 0, "household-1"),
      row("hotel", "stay"),
      row("party", "party"),
      row("ours", "gallery"),
    ]);
    expect(picked.map((photo) => photo.id)).toEqual(["ours"]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 9 }, (_, index) => row(`s${index}`, "story", index));
    expect(pickSaveTheDatePhotos(rows)).toHaveLength(6);
    expect(pickSaveTheDatePhotos(rows, 2).map((photo) => photo.id)).toEqual(["s0", "s1"]);
  });

  it("puts chosen photos back in the chosen order and drops deleted ones", () => {
    expect(orderByIds([{ id: "a" }, { id: "b" }], ["b", "gone", "a"])).toEqual([
      { id: "b" },
      { id: "a" },
    ]);
  });
});

describe("calendarEventTitle", () => {
  it("says it is a wedding, unless the couple already did", () => {
    expect(calendarEventTitle("Ray & Olivia")).toBe("Ray & Olivia's wedding");
    expect(calendarEventTitle("The Okafor Wedding")).toBe("The Okafor Wedding");
  });
});
