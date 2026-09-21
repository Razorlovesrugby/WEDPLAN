/**
 * Vendors, as pure logic (spec 8 §7).
 *
 * Stage ordering, the "have we committed to these people" test, and the
 * filter `/vendors` applies to its URL params — all here rather than in the
 * screen, so they can be tested without a database and so the answer to
 * "is this vendor booked" has exactly one definition.
 */

export const VENDOR_STAGES = [
  "researching",
  "enquiry_sent",
  "quote_received",
  "shortlisted",
  "booked",
  "deposit_paid",
  "complete",
  "declined",
] as const;

export type VendorStage = (typeof VENDOR_STAGES)[number];

export const STAGE_LABEL: Record<VendorStage, string> = {
  researching: "Researching",
  enquiry_sent: "Enquiry sent",
  quote_received: "Quote received",
  shortlisted: "Shortlisted",
  booked: "Booked",
  deposit_paid: "Deposit paid",
  complete: "Complete",
  declined: "Declined",
};

/**
 * The order a vendor moves through, for sorting and for the select.
 *
 * `declined` sorts last rather than at the position it would occupy in a
 * pipeline: it is not a stage you pass through on the way to booking
 * somebody, it is where a record goes to stop being a live option.
 */
const STAGE_ORDER: Record<VendorStage, number> = {
  researching: 0,
  enquiry_sent: 1,
  quote_received: 2,
  shortlisted: 3,
  booked: 4,
  deposit_paid: 5,
  complete: 6,
  declined: 99,
};

export function stageOrder(stage: VendorStage): number {
  return STAGE_ORDER[stage] ?? 0;
}

export function isVendorStage(value: string): value is VendorStage {
  return (VENDOR_STAGES as readonly string[]).includes(value);
}

/**
 * Have we actually committed to these people?
 *
 * Booked, deposit paid, or complete. Used for the "committed but with no
 * budget line" warning — the florist you have booked and not budgeted for is
 * the single most expensive thing this screen can tell you.
 */
export function stageIsCommitted(stage: VendorStage): boolean {
  return stage === "booked" || stage === "deposit_paid" || stage === "complete";
}

export type VendorLike = {
  id: string;
  name: string;
  stage: VendorStage;
  category_id: string | null;
  category_name?: string | null;
  primary_contact_name?: string | null;
  archived_at?: string | null;
  budget_line_count?: number;
};

export type VendorFilter = {
  stage?: string | null;
  category?: string | null;
  q?: string | null;
  archived?: boolean;
};

/**
 * Read a filter off URL params.
 *
 * A filtered vendor list is a link — the same rule `/guests` follows. An
 * unknown stage in the URL is dropped rather than returning nothing, because
 * a stale bookmark should show the list, not an empty screen with no
 * explanation.
 */
export function readVendorFilter(params: Record<string, string | undefined>): VendorFilter {
  const stage = params["stage"];
  return {
    stage: stage && isVendorStage(stage) ? stage : null,
    category: params["category"] || null,
    q: params["q"]?.trim() || null,
    archived: params["archived"] === "1",
  };
}

/** Does this vendor survive the filter? */
export function matchesVendorFilter(vendor: VendorLike, filter: VendorFilter): boolean {
  // Archived is a mode, not a facet: the archived list shows ONLY archived
  // vendors, and the default list shows only live ones. Mixing them is how a
  // vendor you archived last month turns up in a count you trusted.
  const isArchived = Boolean(vendor.archived_at);
  if (isArchived !== Boolean(filter.archived)) return false;

  if (filter.stage && vendor.stage !== filter.stage) return false;
  if (filter.category && vendor.category_id !== filter.category) return false;

  if (filter.q) {
    const haystack = [vendor.name, vendor.category_name, vendor.primary_contact_name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(filter.q.toLowerCase())) return false;
  }
  return true;
}

/** By category, then stage, then name — the order `/vendors` groups in. */
export function sortVendors<T extends VendorLike>(vendors: T[]): T[] {
  return [...vendors].sort((a, b) => {
    // Uncategorised last, so the named groups read as the list and the
    // leftovers read as leftovers.
    const aCat = a.category_name ?? "￿";
    const bCat = b.category_name ?? "￿";
    if (aCat !== bCat) return aCat.localeCompare(bCat);
    if (a.stage !== b.stage) return stageOrder(a.stage) - stageOrder(b.stage);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Vendors we have committed to that have no budget line against them.
 *
 * The one genuinely useful derived fact on this screen: you have booked
 * somebody and there is no money set aside for them.
 */
export function committedWithoutBudget<T extends VendorLike>(vendors: T[]): T[] {
  return vendors.filter(
    (vendor) =>
      !vendor.archived_at &&
      stageIsCommitted(vendor.stage) &&
      (vendor.budget_line_count ?? 0) === 0,
  );
}
