/**
 * Turning a parsed spreadsheet into a reviewable import plan.
 *
 * Pure: rows in, plan out, no database and no React. Everything the preview
 * screen shows and everything the commit writes is decided here, so the thing
 * the user approves and the thing that runs are the same object.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: nothing is ever merged automatically.
 * A duplicate is reported with the record it matched and a default action the
 * user can flip. The alternative — quietly merging on a fuzzy name — would
 * fold two cousins with the same name into one guest, and the list would look
 * correct while being wrong.
 */

import {
  cellOrNull,
  parseAgeBand,
  parseSide,
  splitName,
  type ColumnMapping,
  type ImportField,
} from "./columns";
import { bestMatch, similarity, NAME_MATCH_THRESHOLD } from "./trigram";

export type ImportAction = "create" | "skip";

export type DuplicateKind = "email" | "name" | "duplicate_in_file";

export type Duplicate = {
  kind: DuplicateKind;
  /** The existing guest matched, absent when the clash is with an earlier row. */
  existingGuestId?: string;
  existingName: string;
  existingHousehold?: string;
  /** Only meaningful for a fuzzy name match. */
  score?: number;
};

export type PlannedGuest = {
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  age_band: "adult" | "child" | "infant";
  side: "partner_a" | "partner_b" | "both" | "other" | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
};

export type PlannedRow = {
  /** Line in the file as the user sees it in a spreadsheet: header is line 1. */
  line: number;
  guest: PlannedGuest;
  householdName: string;
  /** Key rows are grouped by. Rows sharing it become one household. */
  householdKey: string;
  /** An existing household this row should join rather than create. */
  existingHouseholdId: string | null;
  address: string | null;
  duplicate: Duplicate | null;
  /** Non-blocking: the row imports, but something was dropped or defaulted. */
  warnings: string[];
  /** Blocking: the row cannot be imported at all. */
  errors: string[];
  action: ImportAction;
};

export type ImportPlan = {
  rows: PlannedRow[];
  /** Households that do not exist yet, in first-seen order. */
  newHouseholds: { key: string; displayName: string; address: string | null }[];
  counts: {
    total: number;
    creating: number;
    skipping: number;
    invalid: number;
    duplicates: number;
  };
};

export type ExistingGuest = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  household_id: string;
  household_name: string;
};

export type ExistingHousehold = {
  id: string;
  display_name: string;
};

/** Deliberately permissive: the database holds text, and the goal is to catch
 *  "not an email at all", not to adjudicate RFC 5322. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fullName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ");
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Read one row into guest fields, following the mapping.
 *
 * A single mapped name column is split; an explicit last-name column always
 * wins over the split, so a file with both "Name" and "Surname" does not end
 * up with the surname in twice.
 */
function readGuest(
  row: readonly string[],
  mapping: ColumnMapping,
  warnings: string[],
): { guest: PlannedGuest; household: string | null; address: string | null } {
  const value = (field: ImportField): string => {
    const index = mapping.indexOf(field);
    return index === -1 ? "" : (row[index] ?? "").trim();
  };

  const rawFirst = value("first_name");
  const rawLast = value("last_name");
  const split = splitName(rawFirst);

  const first = split.first;
  const last = cellOrNull(rawLast) ?? split.last;

  let email = cellOrNull(value("email"));
  if (email !== null && !EMAIL_SHAPE.test(email)) {
    warnings.push(`"${email}" is not a valid email address, so it was left blank`);
    email = null;
  }

  const rawAge = value("age_band");
  const rawSide = value("side");
  const side = parseSide(rawSide);
  if (rawSide !== "" && side === null) {
    warnings.push(`Side "${rawSide}" was not recognised, so it was left blank`);
  }

  return {
    guest: {
      first_name: first,
      last_name: last,
      preferred_name: cellOrNull(value("preferred_name")),
      email: email?.toLowerCase() ?? null,
      phone: cellOrNull(value("phone")),
      age_band: rawAge === "" ? "adult" : parseAgeBand(rawAge),
      side,
      dietary: cellOrNull(value("dietary")),
      accessibility: cellOrNull(value("accessibility")),
      notes: cellOrNull(value("notes")),
    },
    household: cellOrNull(value("household")),
    address: cellOrNull(value("address")),
  };
}

/**
 * Build the plan.
 *
 * Defaults, and why each is the cheaper mistake:
 *
 *   An exact email match defaults to skip. Two records with one email address
 *   are one person; importing again would duplicate them.
 *
 *   A fuzzy name match also defaults to skip, which is the less obvious call.
 *   Both errors are bad — a wrongly skipped guest gets no invitation, a
 *   wrongly created one gets two place cards — but they are not equally
 *   visible. A skipped row is on screen, with its match and its score, in
 *   front of someone who is already reading the screen. A duplicate created
 *   is discovered at the stationers. So the recoverable mistake is the default
 *   and the row stays one click from importing.
 */
export function buildPlan(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  existingGuests: readonly ExistingGuest[],
  existingHouseholds: readonly ExistingHousehold[],
): ImportPlan {
  const hasFirstName = mapping.includes("first_name");
  const columnCount = mapping.length;

  // Exact email lookup over what is already in the database.
  const byEmail = new Map<string, ExistingGuest>();
  for (const guest of existingGuests) {
    if (guest.email) byEmail.set(guest.email.toLowerCase(), guest);
  }

  const householdsByName = new Map<string, ExistingHousehold>();
  for (const household of existingHouseholds) {
    householdsByName.set(normaliseKey(household.display_name), household);
  }

  // Seen within this file, so the file cannot duplicate itself either.
  const seenEmails = new Map<string, number>();
  const seenNames: { name: string; line: number }[] = [];

  const planned: PlannedRow[] = [];
  const newHouseholds = new Map<string, { key: string; displayName: string; address: string | null }>();

  rows.forEach((row, index) => {
    const line = index + 2; // +1 for the header, +1 because spreadsheets are 1-based
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!hasFirstName) {
      errors.push("No column is mapped to first name");
    }
    if (row.length < columnCount) {
      warnings.push(
        `Row has ${row.length} of ${columnCount} columns; the missing ones were read as blank`,
      );
    }

    const { guest, household, address } = readGuest(row, mapping, warnings);

    if (guest.first_name === "") {
      errors.push("No first name, so there is nothing to call this guest");
    }

    // --- household grouping ------------------------------------------------
    // Unmapped or blank household column means one household per row, named
    // after the guest. Keyed by line so two guests called Sam do not merge.
    const displayName = household ?? fullName(guest.first_name, guest.last_name) ?? "";
    const householdKey = household !== null ? `name:${normaliseKey(household)}` : `line:${line}`;
    const existingHousehold = householdsByName.get(normaliseKey(displayName)) ?? null;

    // Registered even when this row is unusable. A household is only actually
    // created if some importable row needs it (see householdsToCreate), and
    // skipping registration here would strand a valid second row behind an
    // invalid first one — "The Boatengs" with no first name on line 2 and a
    // good Kofi on line 3 would leave Kofi with no household to join.
    if (existingHousehold === null && !newHouseholds.has(householdKey)) {
      newHouseholds.set(householdKey, { key: householdKey, displayName, address });
    }

    // --- duplicate detection ----------------------------------------------
    let duplicate: Duplicate | null = null;
    const name = fullName(guest.first_name, guest.last_name);

    if (guest.email !== null) {
      const earlierLine = seenEmails.get(guest.email);
      const existing = byEmail.get(guest.email);

      if (earlierLine !== undefined) {
        duplicate = {
          kind: "duplicate_in_file",
          existingName: `line ${earlierLine}`,
          score: 1,
        };
      } else if (existing) {
        duplicate = {
          kind: "email",
          existingGuestId: existing.id,
          existingName: fullName(existing.first_name, existing.last_name),
          existingHousehold: existing.household_name,
        };
      }
    }

    if (duplicate === null && name !== "") {
      const match = bestMatch(name, existingGuests, (g) => fullName(g.first_name, g.last_name));
      if (match) {
        duplicate = {
          kind: "name",
          existingGuestId: match.candidate.id,
          existingName: fullName(match.candidate.first_name, match.candidate.last_name),
          existingHousehold: match.candidate.household_name,
          score: match.score,
        };
      } else {
        const withinFile = seenNames.find(
          (seen) => similarity(name, seen.name) >= NAME_MATCH_THRESHOLD,
        );
        if (withinFile) {
          duplicate = {
            kind: "duplicate_in_file",
            existingName: `${withinFile.name} on line ${withinFile.line}`,
            score: similarity(name, withinFile.name),
          };
        }
      }
    }

    // Only rows that can actually be imported count as "seen". An unusable row
    // is not going in, so letting it seed the within-file check would flag the
    // next good row as a duplicate of something that will never exist.
    if (errors.length === 0) {
      if (guest.email !== null) seenEmails.set(guest.email, line);
      if (name !== "") seenNames.push({ name, line });
    }

    planned.push({
      line,
      guest,
      householdName: displayName,
      householdKey,
      existingHouseholdId: existingHousehold?.id ?? null,
      address,
      duplicate,
      warnings,
      errors,
      action: errors.length > 0 || duplicate !== null ? "skip" : "create",
    });
  });

  return {
    rows: planned,
    newHouseholds: [...newHouseholds.values()],
    counts: countPlan(planned),
  };
}

export function countPlan(rows: readonly PlannedRow[]): ImportPlan["counts"] {
  return {
    total: rows.length,
    creating: rows.filter((r) => r.action === "create" && r.errors.length === 0).length,
    skipping: rows.filter((r) => r.action === "skip" && r.errors.length === 0).length,
    invalid: rows.filter((r) => r.errors.length > 0).length,
    duplicates: rows.filter((r) => r.duplicate !== null).length,
  };
}

/**
 * The households actually needed once the user has finished flipping rows.
 *
 * Recomputed at commit rather than reused from the preview: a household whose
 * only guest was switched to skip must not be created, or the import leaves
 * behind an empty household nobody asked for.
 */
export function householdsToCreate(
  plan: ImportPlan,
  rows: readonly PlannedRow[] = plan.rows,
): { key: string; displayName: string; address: string | null }[] {
  const needed = new Set(
    rows
      .filter((row) => row.action === "create" && row.errors.length === 0 && row.existingHouseholdId === null)
      .map((row) => row.householdKey),
  );
  return plan.newHouseholds.filter((household) => needed.has(household.key));
}
