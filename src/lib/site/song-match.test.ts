import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFUSAL,
  doNotPlayFrom,
  findDuplicate,
  isBanned,
  normaliseArtist,
  normaliseTitle,
  parseDoNotPlay,
  refusalLine,
  sameSong,
} from "./song-match";

describe("normaliseTitle", () => {
  it("ignores case, punctuation and a leading The", () => {
    expect(normaliseTitle("Mr. Brightside")).toBe(normaliseTitle("mr brightside"));
    expect(normaliseTitle("The Way You Make Me Feel")).toBe("way you make me feel");
  });

  it("drops version tails, bracketed or dashed", () => {
    expect(normaliseTitle("September (Remastered 2011)")).toBe("september");
    expect(normaliseTitle("Valerie - Live at BBC")).toBe("valerie");
    expect(normaliseTitle("Uptown Funk (feat. Bruno Mars)")).toBe("uptown funk");
    expect(normaliseTitle("Song (feat. X) [Radio Edit]")).toBe("song");
  });

  it("keeps a bracket that is part of the name", () => {
    expect(normaliseTitle("(I've Had) The Time of My Life")).toBe("ive had the time of my life");
  });

  it("treats & and and the same, and strips accents", () => {
    expect(normaliseTitle("Rock & Roll")).toBe(normaliseTitle("Rock and Roll"));
    expect(normaliseTitle("Café")).toBe("cafe");
  });
});

describe("normaliseArtist", () => {
  it("keeps the lead artist only", () => {
    expect(normaliseArtist("Mark Ronson feat. Bruno Mars")).toBe("mark ronson");
    expect(normaliseArtist("The Killers")).toBe("killers");
    expect(normaliseArtist(null)).toBe("");
  });
});

describe("sameSong / findDuplicate", () => {
  it("matches the same song typed differently", () => {
    expect(sameSong({ title: "mr brightside", artist: "killers" }, { title: "Mr. Brightside", artist: "The Killers" })).toBe(true);
  });

  it("matches when one side gave no artist", () => {
    expect(sameSong({ title: "Valerie" }, { title: "Valerie", artist: "Amy Winehouse" })).toBe(true);
  });

  it("does not match the same title by a different artist", () => {
    expect(sameSong({ title: "Hello", artist: "Adele" }, { title: "Hello", artist: "Lionel Richie" })).toBe(false);
  });

  it("never matches an empty title", () => {
    expect(sameSong({ title: "!!!" }, { title: "???" })).toBe(false);
  });

  it("finds the first duplicate", () => {
    const list = [
      { id: "a", title: "September", artist: "Earth, Wind & Fire" },
      { id: "b", title: "Valerie", artist: "Amy Winehouse" },
    ];
    expect(findDuplicate({ title: "valerie" }, list)?.id).toBe("b");
    expect(findDuplicate({ title: "Shout" }, list)).toBeNull();
  });
});

describe("the do-not-play list", () => {
  const bans = parseDoNotPlay(
    ["Wonderwall", "Chicken Dance - Werner Thomas", "", "anything by Nickelback", "Stand by Me", "By the Way"].join("\n"),
  );

  it("parses titles, title-and-artist, and whole artists", () => {
    expect(bans.map((ban) => ban.kind)).toEqual(["song", "song", "artist", "song", "song"]);
  });

  it("keeps the couple's own words for display", () => {
    expect(bans[2]?.line).toBe("anything by Nickelback");
  });

  it("refuses a title-only ban whoever sings it", () => {
    expect(isBanned({ title: "wonderwall", artist: "Ryan Adams" }, bans)?.line).toBe("Wonderwall");
    expect(isBanned({ title: "Wonderwall (Remastered)" }, bans)).not.toBeNull();
  });

  it("refuses an artist ban only when the artist is given", () => {
    expect(isBanned({ title: "How You Remind Me", artist: "Nickelback" }, bans)).not.toBeNull();
    expect(isBanned({ title: "How You Remind Me" }, bans)).toBeNull();
  });

  it("refuses a title-and-artist ban only for that artist", () => {
    expect(isBanned({ title: "Chicken Dance", artist: "Werner Thomas" }, bans)).not.toBeNull();
    expect(isBanned({ title: "Chicken Dance", artist: "Somebody Else" }, bans)).toBeNull();
    expect(isBanned({ title: "Chicken Dance" }, bans)).toBeNull();
  });

  it("does not read 'Stand by Me' or 'By the Way' as an artist ban", () => {
    expect(isBanned({ title: "Stand by Me", artist: "Ben E. King" }, bans)?.line).toBe("Stand by Me");
    expect(isBanned({ title: "By the Way", artist: "Red Hot Chili Peppers" }, bans)?.line).toBe("By the Way");
    expect(isBanned({ title: "Californication", artist: "Red Hot Chili Peppers" }, bans)).toBeNull();
  });

  it("lets everything else through", () => {
    expect(isBanned({ title: "Mr Brightside", artist: "The Killers" }, bans)).toBeNull();
  });

  it("reads the list and the refusal line off a block payload", () => {
    expect(doNotPlayFrom({ do_not_play: "Wonderwall" })).toHaveLength(1);
    expect(doNotPlayFrom(null)).toEqual([]);
    expect(refusalLine({})).toBe(DEFAULT_REFUSAL);
    expect(refusalLine({ do_not_play_line: "  Absolutely not.  " })).toBe("Absolutely not.");
  });
});
