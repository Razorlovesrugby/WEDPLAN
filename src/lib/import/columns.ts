/**
 * Column mapping: which spreadsheet column means what.
 *
 * The file comes from wherever the planner had names already — a Google
 * Contacts export, a shared Google Sheet, a list the mother of the bride
 * keeps in Excel. None of them agree on headers, so the mapping is always
 * editable by hand and the detection here only supplies the first guess.
 *
 * Detection is deliberately conservative. A wrong guess that looks right is
 * worse than no guess: the user skims the mapping screen, sees every column
 * already assigned, and imports 300 phone numbers into the notes field.
 * Synonyms are therefore exact matches against a normalised header, never
 * substring or fuzzy matches — "name" must not quietly win "nickname".
 */

export const IMPORT_FIELDS = [
  "household",
  "address",
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "phone",
  "age_band",
  "side",
  "dietary",
  "accessibility",
  "notes",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Nothing in the file has to map to a field; unmapped columns are ignored. */
export type ColumnMapping = (ImportField | null)[];

export const FIELD_LABELS: Record<ImportField, string> = {
  household: "Household",
  address: "Address",
  first_name: "First name",
  last_name: "Last name",
  preferred_name: "Preferred name",
  email: "Email",
  phone: "Phone",
  age_band: "Adult / child / infant",
  side: "Side",
  dietary: "Dietary",
  accessibility: "Access needs",
  notes: "Notes",
};

export const FIELD_HINTS: Partial<Record<ImportField, string>> = {
  household:
    "Rows sharing a household name are imported as one household. Leave unmapped to put each row in its own.",
  first_name: "The only column that must be mapped.",
  age_band: "Adult unless the cell says child, kid, infant or baby.",
  side: "Whose guest this is. Anything unrecognised is left blank.",
};

/**
 * Header spellings seen in the wild, normalised.
 *
 * `full_name` and `name` map to first_name because that is where a single
 * name column has to land — `splitName` below pulls a surname off it, and a
 * name that does not split is still a valid guest with no last name.
 */
const SYNONYMS: Record<string, ImportField> = {
  household: "household",
  householdname: "household",
  family: "household",
  familyname: "household",
  group: "household",
  party: "household",
  invite: "household",
  address: "address",
  addressline1: "address",
  postaladdress: "address",
  streetaddress: "address",
  firstname: "first_name",
  first: "first_name",
  forename: "first_name",
  givenname: "first_name",
  christianname: "first_name",
  name: "first_name",
  fullname: "first_name",
  guestname: "first_name",
  guest: "first_name",
  lastname: "last_name",
  last: "last_name",
  surname: "last_name",
  familyname2: "last_name",
  preferredname: "preferred_name",
  nickname: "preferred_name",
  knownas: "preferred_name",
  goesby: "preferred_name",
  email: "email",
  emailaddress: "email",
  mail: "email",
  emails: "email",
  phone: "phone",
  mobile: "phone",
  telephone: "phone",
  tel: "phone",
  phonenumber: "phone",
  cell: "phone",
  ageband: "age_band",
  age: "age_band",
  agegroup: "age_band",
  adultchild: "age_band",
  type: "age_band",
  side: "side",
  whoseguest: "side",
  brideorgroom: "side",
  partner: "side",
  dietary: "dietary",
  dietaryrequirements: "dietary",
  diet: "dietary",
  dietaryneeds: "dietary",
  allergies: "dietary",
  food: "dietary",
  accessibility: "accessibility",
  access: "accessibility",
  accessneeds: "accessibility",
  mobility: "accessibility",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A first-guess mapping for a header row.
 *
 * A field is claimed at most once. Two columns both called "Email" means the
 * second is left unmapped rather than silently overwriting the first — the
 * user can see both in the dropdown and pick.
 */
export function detectMapping(headers: readonly string[]): ColumnMapping {
  const taken = new Set<ImportField>();

  return headers.map((header) => {
    const field = SYNONYMS[normaliseHeader(header)];
    if (field === undefined || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

/**
 * Split a single name column into first and last.
 *
 * Everything after the first token is the surname, so "Anna Maria del Toro"
 * keeps "del Toro" together rather than guessing at particles. A single token
 * yields no surname at all, which is correct — plenty of lists hold only
 * first names, and inventing one is worse than leaving it null.
 */
export function splitName(value: string): { first: string; last: string | null } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: null };
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/** Lowercased, punctuation stripped, whitespace collapsed. */
function normaliseValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Age band from whatever the column says.
 *
 * Two shapes, because "Age" is one of the headers this maps from and half the
 * files that have it hold a number rather than a word. The boundaries match
 * the seat rule in `docs/HANDOFF.md`: adults and children occupy a seat,
 * infants do not, and an infant is one small enough to sit on a lap.
 *
 * Unrecognised means adult. That is the safe default for a headcount: an
 * adult seat is the expensive one, so guessing adult over-caters rather than
 * leaving somebody without a chair.
 */
export function parseAgeBand(value: string): "adult" | "child" | "infant" {
  const text = normaliseValue(value);
  if (text === "") return "adult";

  if (/^\d+$/.test(text)) {
    const age = Number(text);
    if (age < 2) return "infant";
    if (age < 18) return "child";
    return "adult";
  }

  if (/^(infant|baby|babies|newborn|lap|lap child)/.test(text)) return "infant";
  if (/^(child|children|kid|kids|minor|teen|teenager)/.test(text)) return "child";
  return "adult";
}

const SIDE_VALUES: Record<string, "partner_a" | "partner_b" | "both" | "other"> = {
  a: "partner_a",
  partnera: "partner_a",
  "partner a": "partner_a",
  bride: "partner_a",
  brides: "partner_a",
  "bride side": "partner_a",
  "brides side": "partner_a",
  "bride family": "partner_a",
  her: "partner_a",
  hers: "partner_a",
  "her side": "partner_a",
  b: "partner_b",
  partnerb: "partner_b",
  "partner b": "partner_b",
  groom: "partner_b",
  grooms: "partner_b",
  "groom side": "partner_b",
  "grooms side": "partner_b",
  "groom family": "partner_b",
  his: "partner_b",
  "his side": "partner_b",
  both: "both",
  shared: "both",
  joint: "both",
  mutual: "both",
  everyone: "both",
  other: "other",
  work: "other",
  colleague: "other",
  colleagues: "other",
  friend: "other",
  friends: "other",
};

/**
 * Side from whatever the column says.
 *
 * Exact matches only, for the same reason the header synonyms are exact: a
 * prefix rule reads "Aunt Margaret's lot" as `a` and labels a third of the
 * seating plan as the bride's side, and it does it silently. Unrecognised is
 * null rather than a guess — side drives nothing structural, so a blank is
 * harmless and a wrong value is not.
 */
export function parseSide(value: string): "partner_a" | "partner_b" | "both" | "other" | null {
  return SIDE_VALUES[normaliseValue(value)] ?? null;
}

/** Empty string means the cell was blank, which in the database is null. */
export function cellOrNull(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}
