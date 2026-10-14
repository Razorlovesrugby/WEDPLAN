import { describe, expect, it } from "vitest";
import { artworkAt, isAppleArtworkUrl, parseCatalogueResults, searchKey, songArtPath } from "./song-catalogue";

const ART = "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/aa/bb/cc/source/100x100bb.jpg";

// The shape the iTunes Search API returns, trimmed to what we read.
const fixture = {
  resultCount: 4,
  results: [
    { wrapperType: "track", kind: "song", trackId: 1440837096, trackName: "Mr. Brightside", artistName: "The Killers", artworkUrl100: ART },
    { wrapperType: "track", kind: "music-video", trackId: 2, trackName: "Mr. Brightside (Video)", artistName: "The Killers" },
    { wrapperType: "track", kind: "song", trackId: 1440837096, trackName: "dup", artistName: "dup" },
    { wrapperType: "track", kind: "song", trackId: 3, trackName: "No art", artistName: "Someone", artworkUrl100: "https://evil.example/a.jpg" },
    { wrapperType: "track", kind: "song", trackId: "nope", trackName: "Bad id", artistName: "X" },
    { wrapperType: "track", kind: "song", trackId: 4, trackName: "   ", artistName: "X" },
  ],
};

describe("parseCatalogueResults", () => {
  it("keeps songs, drops everything else, and de-duplicates by id", () => {
    const songs = parseCatalogueResults(fixture);
    expect(songs.map((song) => song.catalogueId)).toEqual(["1440837096", "3"]);
    expect(songs[0]).toEqual({ catalogueId: "1440837096", title: "Mr. Brightside", artist: "The Killers", artworkUrl: ART });
  });

  it("drops artwork that is not on Apple's image host", () => {
    expect(parseCatalogueResults(fixture)[1]?.artworkUrl).toBeNull();
  });

  it("survives a response that is not the documented shape", () => {
    expect(parseCatalogueResults(null)).toEqual([]);
    expect(parseCatalogueResults({ results: "no" })).toEqual([]);
    expect(parseCatalogueResults({ results: [null, 5, "x"] })).toEqual([]);
  });
});

describe("isAppleArtworkUrl", () => {
  it("accepts Apple's image host", () => {
    expect(isAppleArtworkUrl(ART)).toBe(true);
  });

  it("refuses everything else, including look-alikes", () => {
    for (const bad of [
      "http://is1-ssl.mzstatic.com/a.jpg",
      "https://mzstatic.com.evil.example/a.jpg",
      "https://evilmzstatic.com/a.jpg",
      "https://is1-ssl.mzstatic.com:8443/a.jpg",
      "https://user:pw@is1-ssl.mzstatic.com/a.jpg",
      "javascript:alert(1)",
      "",
      null,
      42,
    ]) {
      expect(isAppleArtworkUrl(bad)).toBe(false);
    }
  });
});

describe("artworkAt / songArtPath", () => {
  it("swaps the size in the path", () => {
    expect(artworkAt(ART, 160)).toBe(ART.replace("100x100bb.jpg", "160x160bb.jpg"));
  });

  it("leaves an address it does not recognise alone", () => {
    expect(artworkAt("https://a.mzstatic.com/x.jpg", 160)).toBe("https://a.mzstatic.com/x.jpg");
  });

  it("points the page at our proxy, never at Apple", () => {
    const path = songArtPath(ART, 100);
    expect(path?.startsWith("/api/public/song-art?")).toBe(true);
    expect(songArtPath("https://evil.example/a.jpg", 100)).toBeNull();
    expect(songArtPath(null, 100)).toBeNull();
  });
});

describe("searchKey", () => {
  it("folds case and spacing", () => {
    expect(searchKey("  Mr   BRIGHTSIDE ")).toBe("mr brightside");
  });
});
