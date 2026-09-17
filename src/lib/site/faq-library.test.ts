import { describe, expect, it } from "vitest";
import { FAQ_LIBRARY, libraryTags } from "./faq-library";
import { FAQ_FEATURED_LIMIT, faqItems, splitFaq } from "./sections";

describe("FAQ_LIBRARY", () => {
  it("survives the reader it will be stored and read back through", () => {
    // The library is written as objects but lands in JSONB and comes back out
    // through faqItems(). If a shape mismatch crept in, this is where it shows.
    const roundTripped = faqItems({ items: FAQ_LIBRARY });
    expect(roundTripped).toHaveLength(FAQ_LIBRARY.length);
  });

  it("features exactly the number the FAQ shows open", () => {
    // More would be silently truncated by splitFaq; fewer would leave the
    // opening screen half empty.
    const featured = FAQ_LIBRARY.filter((item) => item.featured);
    expect(featured).toHaveLength(FAQ_FEATURED_LIMIT);
    expect(splitFaq(FAQ_LIBRARY).featured.map((f) => f.q)).toEqual(featured.map((f) => f.q));
  });

  it("has no duplicate questions", () => {
    const seen = new Set(FAQ_LIBRARY.map((item) => item.q));
    expect(seen.size).toBe(FAQ_LIBRARY.length);
  });

  it("gives every item a question, an answer and a tag", () => {
    for (const item of FAQ_LIBRARY) {
      expect(item.q.trim(), item.q).not.toBe("");
      expect(item.a.trim(), item.q).not.toBe("");
      expect(item.tags.length, item.q).toBeGreaterThan(0);
    }
  });

  it("marks every blank the couple must fill in", () => {
    // The whole point of the drafts: a plausible wrong answer is worse than an
    // obvious blank, because nobody proofreads a sentence that already reads
    // like one. Every answer carries at least one [bracketed] placeholder.
    for (const item of FAQ_LIBRARY) {
      expect(item.a, item.q).toMatch(/\[[^\]]+\]/);
    }
  });

  it("keeps answers to roughly two to four sentences", () => {
    // Aisle's own guidance, and the editor repeats it to the planner.
    for (const item of FAQ_LIBRARY) {
      const sentences = item.a.split(/[.!?](?:\s|$)/).filter((s) => s.trim() !== "");
      expect(sentences.length, `${item.q} -> ${sentences.length}`).toBeLessThanOrEqual(4);
    }
  });

  it("is written as 'we', never in the third person", () => {
    // Q11. "The couple ask that guests refrain from..." is how a venue writes.
    const all = FAQ_LIBRARY.map((item) => item.a).join(" ");
    expect(all).not.toMatch(/\bthe couple\b/i);
    expect(all).not.toMatch(/\bthe bride\b|\bthe groom\b/i);
  });

  it("reports its tags in first-seen order", () => {
    expect(libraryTags()[0]).toBe("The day");
    expect(new Set(libraryTags()).size).toBe(libraryTags().length);
  });
});
