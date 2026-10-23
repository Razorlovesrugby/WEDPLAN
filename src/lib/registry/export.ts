import type { ClaimStatus } from "./status";
import { STATUS_LABELS } from "./status";

export const REGISTRY_CSV_HEADER = [
  "Name", "Item", "How many", "Message", "Stage", "Claimed", "Arrived", "Thanked", "Released",
] as const;

type ClaimForExport = {
  name: string;
  item_title: string;
  quantity: number;
  message: string | null;
  status: ClaimStatus;
  created_at: string;
  arrived_at: string | null;
  thanked_at: string | null;
  released_at: string | null;
};

/**
 * The thank-you list (spec 36 §7): one row per claim, in the order the couple
 * will write the cards — people who still need a thank-you first, then the rest
 * newest first, released claims last. `format` is passed in so the dates are in
 * the wedding's own timezone without this file knowing about it.
 */
export function registryCsvRows(claims: readonly ClaimForExport[], format: (iso: string | null) => string): string[][] {
  const rank = (c: ClaimForExport) => (c.released_at ? 3 : c.status === "arrived" ? 0 : c.status === "thanked" ? 2 : 1);
  return [...claims]
    .sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
    .map((c) => [
      c.name,
      c.item_title,
      String(c.quantity),
      c.message ?? "",
      c.released_at ? "Released" : STATUS_LABELS[c.status],
      format(c.created_at),
      format(c.arrived_at),
      format(c.thanked_at),
      format(c.released_at),
    ]);
}
