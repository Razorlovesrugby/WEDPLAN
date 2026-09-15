export type HouseholdOption = {
  id: string;
  display_name: string;
  address: string | null;
};

/**
 * Case-insensitive substring match against name and address, for the "move
 * to household" picker. A plain <select> does not scale past a few dozen
 * households and cannot be typed into — this is what makes finding "the
 * Okonkwo family" among three hundred rows fast.
 */
export function searchHouseholds<T extends HouseholdOption>(households: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return households;
  return households.filter((h) =>
    [h.display_name, h.address].filter(Boolean).join(" ").toLowerCase().includes(needle),
  );
}
