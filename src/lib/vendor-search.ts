import type { VendorLike } from "./vendors";

/**
 * Type-to-filter over a wedding's vendors (spec 8 §5).
 *
 * A near-copy of `household-search.ts`, with one deliberate difference: it
 * matches the category and the primary contact as well as the name, because
 * "who was the florist" is a question people ask by category at least as often
 * as by name.
 *
 * In memory, over what the page already loaded — a wedding has tens of
 * vendors, not the hundreds of households that pattern was built for.
 */
export function searchVendors<T extends VendorLike>(vendors: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return vendors;

  return vendors.filter((vendor) => {
    const haystack = [vendor.name, vendor.category_name, vendor.primary_contact_name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Whether a typed name is close enough to an existing vendor to be worth
 * warning about before creating a second record.
 *
 * Exact, case- and whitespace-insensitive ONLY. Spec 8 §4 is explicit that
 * this feature does no fuzzy matching: the app owns a trigram matcher and
 * deliberately does not use it here, because a budget line's vendor name was
 * typed by the planner in this app, and "The Old Barn" vs "Old Barn" is as
 * likely to be two genuinely different suppliers as one.
 */
export function findExactVendor<T extends VendorLike>(vendors: T[], name: string): T | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return vendors.find((vendor) => vendor.name.trim().toLowerCase() === needle) ?? null;
}
