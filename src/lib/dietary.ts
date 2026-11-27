/**
 * Structured dietary needs (spec 57 Part H). A guest has any number of tags
 * from a standard list, each marked an allergy or a preference, with a short
 * text for "Other". The free-text `guests.dietary` stays beside them as the
 * detail ("no mushrooms, loves lamb"): nothing here reads it into tags.
 * Pure — the guest page, the RSVP form, the seating screen and the server
 * share it.
 */

import type { DietaryTag } from "@/lib/types/database";

export const DIETARY_TAGS: readonly { tag: DietaryTag; label: string }[] = [
  { tag: "vegetarian", label: "Vegetarian" },
  { tag: "vegan", label: "Vegan" },
  { tag: "gluten_free", label: "Gluten free" },
  { tag: "dairy_free", label: "Dairy free" },
  { tag: "nut", label: "Tree nuts" },
  { tag: "peanut", label: "Peanuts" },
  { tag: "shellfish", label: "Shellfish" },
  { tag: "fish", label: "Fish" },
  { tag: "egg", label: "Egg" },
  { tag: "soy", label: "Soy" },
  { tag: "sesame", label: "Sesame" },
  { tag: "halal", label: "Halal" },
  { tag: "kosher", label: "Kosher" },
  { tag: "other", label: "Other" },
];

const LABEL = new Map(DIETARY_TAGS.map((t) => [t.tag, t.label]));
const VALID = new Set<string>(DIETARY_TAGS.map((t) => t.tag));
export const OTHER_TEXT_MAX = 60;

export type DietaryNeed = {
  tag: DietaryTag;
  /** True for an allergy (needs care), false for a preference (a wish). */
  isAllergy: boolean;
  /** Only for `other`. */
  otherText: string | null;
};

/** What a tag is called: "Gluten free", or the couple's own words for Other. */
export function needLabel(n: Pick<DietaryNeed, "tag" | "otherText">): string {
  return n.tag === "other" ? n.otherText || "Other" : (LABEL.get(n.tag) ?? n.tag);
}

/**
 * Whatever arrived (a form post, a server action argument) as a clean list:
 * known tags only, once each (the later one wins), `other` only with its text,
 * and text only on `other`. Never throws; what is wrong is dropped.
 */
export function parseDietaryNeeds(raw: unknown): DietaryNeed[] {
  if (!Array.isArray(raw)) return [];
  const byTag = new Map<DietaryTag, DietaryNeed>();
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const r = item as { tag?: unknown; isAllergy?: unknown; otherText?: unknown };
    if (typeof r.tag !== "string" || !VALID.has(r.tag)) continue;
    const tag = r.tag as DietaryTag;
    let otherText: string | null = null;
    if (tag === "other") {
      const text = typeof r.otherText === "string" ? r.otherText.trim().replace(/\s+/g, " ").slice(0, OTHER_TEXT_MAX) : "";
      if (!text) continue;
      otherText = text;
    }
    byTag.set(tag, { tag, isAllergy: r.isAllergy === true, otherText });
  }
  return [...byTag.values()].sort(compareNeeds);
}

/** Allergies first (they need care), then the list's own order. */
export function compareNeeds(a: DietaryNeed, b: DietaryNeed): number {
  if (a.isAllergy !== b.isAllergy) return a.isAllergy ? -1 : 1;
  const order = (n: DietaryNeed) => DIETARY_TAGS.findIndex((t) => t.tag === n.tag);
  return order(a) - order(b);
}

export function hasAllergy(needs: readonly DietaryNeed[]): boolean {
  return needs.some((n) => n.isAllergy);
}

/** "Allergy: Peanuts, Sesame. Vegetarian." — for the venue sheet, the caterer export and a tooltip. */
export function dietarySummary(needs: readonly DietaryNeed[]): string {
  const allergies = needs.filter((n) => n.isAllergy).map(needLabel);
  const prefs = needs.filter((n) => !n.isAllergy).map(needLabel);
  return [allergies.length ? `Allergy: ${allergies.join(", ")}` : "", prefs.length ? prefs.join(", ") : ""].filter(Boolean).join(". ");
}

/**
 * The dot on a chair: red for an allergy, amber for a preference, grey for
 * only a free-text note, none for nothing (spec 57 A.2). A tag always beats
 * the note, and an allergy beats a preference.
 */
export type DietaryDot = "allergy" | "preference" | "note" | null;

export function dietaryDot(needs: readonly DietaryNeed[], freeText: string | null | undefined): DietaryDot {
  if (hasAllergy(needs)) return "allergy";
  if (needs.length > 0) return "preference";
  return (freeText ?? "").trim() !== "" ? "note" : null;
}

/** Everything a guest asked for, tags and note: what "has a dietary need" means for counting and colouring. */
export function hasAnyDietary(needs: readonly DietaryNeed[], freeText: string | null | undefined): boolean {
  return needs.length > 0 || (freeText ?? "").trim() !== "";
}

/**
 * The writes that turn `current` into `next`: tags to upsert (new or changed)
 * and tags to remove. Nothing for what is unchanged, so saving an untouched
 * list writes nothing.
 */
export function diffNeeds(current: readonly DietaryNeed[], next: readonly DietaryNeed[]): { upsert: DietaryNeed[]; remove: DietaryTag[] } {
  const before = new Map(current.map((n) => [n.tag, n]));
  const after = new Map(next.map((n) => [n.tag, n]));
  const upsert = next.filter((n) => {
    const was = before.get(n.tag);
    return !was || was.isAllergy !== n.isAllergy || was.otherText !== n.otherText;
  });
  const remove = current.filter((n) => !after.has(n.tag)).map((n) => n.tag);
  return { upsert, remove };
}

/** Counts by tag, allergies and preferences apart, for the caterer's list. */
export function countNeeds(lists: readonly (readonly DietaryNeed[])[]): { label: string; allergy: number; preference: number }[] {
  const rows = new Map<string, { label: string; allergy: number; preference: number }>();
  for (const needs of lists) {
    for (const n of needs) {
      const key = n.tag === "other" ? `other:${(n.otherText ?? "").toLowerCase()}` : n.tag;
      const row = rows.get(key) ?? { label: needLabel(n), allergy: 0, preference: 0 };
      if (n.isAllergy) row.allergy += 1;
      else row.preference += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.allergy + b.preference - (a.allergy + a.preference) || a.label.localeCompare(b.label, "en-GB"));
}

/** The tags and the note together, for a tooltip, a sheet or a CSV cell: "Allergy: Peanuts. Vegetarian — no mushrooms". */
export function dietaryText(needs: readonly DietaryNeed[], freeText: string | null | undefined): string {
  const tags = dietarySummary(needs);
  const note = (freeText ?? "").trim();
  return [tags, note].filter(Boolean).join(" — ");
}
