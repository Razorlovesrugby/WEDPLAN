import { formatDate, formatMoney } from "@/lib/format";
import type { AuditLogRow } from "@/lib/types/database";

/**
 * Turning an audit row into a sentence (spec 32 §4.3).
 *
 * Pure, so it is unit-tested; the `/settings/activity` page only lays the
 * result out. Nothing here reads the database — names come in as arguments,
 * which is also why a renamed collaborator re-labels their whole history: the
 * log stores an id, never a name.
 */

export type AreaKey =
  | "guests"
  | "invitations"
  | "tasks"
  | "budget"
  | "vendors"
  | "moodboards"
  | "site"
  | "travel"
  | "wedding";

type Area = { key: AreaKey; label: string; tables: readonly string[] };

/** What the filter on the page offers, and which tables each choice covers. */
export const AUDIT_AREAS: readonly Area[] = [
  {
    key: "guests",
    label: "Guests",
    tables: [
      "households",
      "guests",
      "tags",
      "guest_tags",
      "guest_notes",
      "guest_event_overrides",
      "cut_lines",
    ],
  },
  {
    key: "invitations",
    label: "Invitations & RSVPs",
    tables: [
      "invitations",
      "invitation_events",
      "rsvps",
      "rsvp_questions",
      "rsvp_answers",
      "song_requests",
      "song_votes",
    ],
  },
  {
    key: "tasks",
    label: "Lists & run sheet",
    tables: ["lists", "list_sections", "list_items", "run_sheet_items", "saved_views"],
  },
  {
    key: "budget",
    label: "Budget",
    tables: [
      "budget_categories",
      "budget_items",
      "consumption_components",
      "payments",
      "budget_item_lists",
      "budget_item_sections",
      "budget_item_tasks",
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    tables: ["vendor_categories", "vendors", "vendor_contacts", "vendor_notes"],
  },
  {
    key: "moodboards",
    label: "Moodboards",
    tables: ["moodboards", "moodboard_items", "moodboard_shares"],
  },
  {
    key: "site",
    label: "Website",
    tables: [
      "site_content",
      "site_blocks",
      "site_assets",
      "dress_codes",
      "dress_code_notes",
      "gift_funds",
      "gift_bank_details",
    ],
  },
  {
    key: "travel",
    label: "Travel & stay",
    tables: [
      "transport_options",
      "coach_runs",
      "coach_stops",
      "coach_seats",
      "accommodations",
      "arrival_points",
    ],
  },
  { key: "wedding", label: "Wedding & people", tables: ["weddings", "collaborators", "events"] },
];

/** What one row of each table is called in a sentence. */
const NOUNS: Record<string, string> = {
  weddings: "wedding details",
  collaborators: "collaborator",
  events: "event",
  households: "household",
  guests: "guest",
  tags: "tag",
  guest_tags: "guest tag",
  guest_notes: "guest note",
  guest_questions: "guest question",
  guest_event_overrides: "per-event invite",
  cut_lines: "cut line",
  invitations: "invitation",
  invitation_events: "invited event",
  rsvps: "RSVP",
  rsvp_questions: "RSVP question",
  rsvp_answers: "RSVP answer",
  lists: "list",
  list_sections: "list section",
  list_items: "task",
  run_sheet_items: "run sheet item",
  saved_views: "saved view",
  budget_categories: "budget category",
  budget_items: "budget item",
  consumption_components: "consumption component",
  payments: "payment",
  budget_item_lists: "budget link to a list",
  budget_item_sections: "budget link to a section",
  budget_item_tasks: "budget link to a task",
  moodboards: "moodboard",
  moodboard_items: "moodboard item",
  moodboard_shares: "moodboard share link",
  vendor_categories: "vendor category",
  vendors: "vendor",
  vendor_contacts: "vendor contact",
  vendor_notes: "vendor note",
  gift_funds: "gift fund",
  gift_bank_details: "bank details",
  transport_options: "transport option",
  coach_runs: "coach run",
  coach_stops: "coach stop",
  coach_seats: "coach seat",
  accommodations: "accommodation",
  arrival_points: "arrival point",
  site_content: "website section",
  site_blocks: "website block",
  site_assets: "website image",
  dress_codes: "dress code",
  dress_code_notes: "dress code note",
  song_requests: "song request",
  song_votes: "song vote",
  registry_settings: "registry settings",
  registry_shipping: "registry delivery address",
  registry_items: "registry item",
  registry_tags: "registry tag",
  registry_item_tags: "registry tag on an item",
  registry_claims: "registry claim",
};

/** Tables a guest writes to through their own link. */
const GUEST_WRITES = new Set([
  "households",
  "guests",
  "guest_notes",
  "guest_questions",
  "guest_event_overrides",
  "invitations",
  "rsvps",
  "rsvp_answers",
  "song_requests",
  "song_votes",
  // A registry visitor is not a guest, but the claim is written from their
  // browser with no session, which is all this set says.
  "registry_claims",
]);

const COLUMN_LABELS: Record<string, string> = {
  rsvp_lock_at: "RSVP lock date",
  wedding_date: "Wedding date",
  display_name: "Name",
  unable_to_attend_at: "Unable to attend",
  unable_to_attend_via: "Unable to attend (how)",
  save_the_date_sent_at: "Save the date sent",
  sent_at: "Sent",
  opened_at: "Opened",
  first_response_at: "First response",
};

/** Columns that identify or timestamp a row rather than describe a change to it. */
const HIDDEN_COLUMNS = new Set(["id", "wedding_id", "created_at", "updated_at"]);

export function areaForTables(area: AreaKey): readonly string[] {
  return AUDIT_AREAS.find((a) => a.key === area)?.tables ?? [];
}

export function allAuditedTables(): string[] {
  return AUDIT_AREAS.flatMap((a) => [...a.tables]);
}

export function nounFor(table: string): string {
  return NOUNS[table] ?? table.replace(/_/g, " ");
}

export function columnLabel(column: string): string {
  const known = COLUMN_LABELS[column];
  if (known) return known;
  const words = column
    .replace(/_minor$/, "")
    .replace(/_at$/, "")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .trim();
  const spaced = words.replace(/\brsvp\b/gi, "RSVP");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatValue(column: string, value: unknown, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (value === "[redacted]") return "hidden";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    return column.endsWith("_minor") ? formatMoney(value) : String(value);
  }
  if (typeof value === "string") {
    if (ISO_DATETIME.test(value)) {
      return formatDate(value, timeZone, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (ISO_DATE.test(value)) return formatDate(`${value}T12:00:00Z`, "UTC");
    return value.length > 60 ? `${value.slice(0, 57)}…` : value;
  }
  return "(updated)";
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}

export type Described = {
  who: string;
  /** "added", "changed", "deleted", "removed", "restored" */
  verb: string;
  /** What it happened to: `household “Okonkwo”` or `a guest tag`. */
  subject: string;
  /** For an update: one `Column: old → new` line per changed column. */
  details: string[];
};

type CollaboratorName = { user_id: string; role: string; display_name: string | null };

export function actorLabel(
  entry: Pick<AuditLogRow, "actor_id" | "actor_kind" | "table_name">,
  collaborators: readonly CollaboratorName[],
): string {
  if (entry.actor_kind === "planner") {
    const person = collaborators.find((c) => c.user_id === entry.actor_id);
    if (!person) return "A former collaborator";
    return person.display_name?.trim() || (person.role === "owner" ? "Owner" : "Partner");
  }
  return GUEST_WRITES.has(entry.table_name) ? "A guest (via their link)" : "An automatic update";
}

export function describeEntry(
  entry: AuditLogRow,
  collaborators: readonly CollaboratorName[],
  timeZone: string,
): Described {
  const noun = nounFor(entry.table_name);
  const subject = entry.label ? `${noun} “${entry.label}”` : `${article(noun)} ${noun}`;
  const who = actorLabel(entry, collaborators);

  if (entry.action === "insert") return { who, verb: "added", subject, details: [] };
  if (entry.action === "delete") return { who, verb: "deleted", subject, details: [] };

  const changes = Object.entries(entry.changed).filter(
    ([column, pair]) => !HIDDEN_COLUMNS.has(column) && Array.isArray(pair),
  ) as [string, [unknown, unknown]][];

  // Soft delete is a change to `deleted_at` and nothing else: say what it means.
  const only = changes.length === 1 ? changes[0] : null;
  if (only && only[0] === "deleted_at") {
    return {
      who,
      verb: only[1][1] ? "removed" : "restored",
      subject,
      details: [],
    };
  }

  return {
    who,
    verb: "changed",
    subject,
    details: changes
      .filter(([column]) => column !== "deleted_at")
      .map(
        ([column, [from, to]]) =>
          `${columnLabel(column)}: ${formatValue(column, from, timeZone)} → ${formatValue(column, to, timeZone)}`,
      ),
  };
}

// ---------------------------------------------------------------------------
// The page's filters, as they arrive in the URL
// ---------------------------------------------------------------------------

export type AuditFilters = {
  area: AreaKey | null;
  /** A collaborator's user id, or "public" for guests and automatic changes. */
  actor: string | null;
  /** Inclusive, in the wedding's own timezone: `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
  /** Keyset cursor: show entries older than this id. */
  before: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validDate(value: string | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

/** Anything that doesn't parse is dropped rather than rejected: a bad link shows the unfiltered log. */
export function parseAuditFilters(params: Record<string, string | undefined>): AuditFilters {
  const area = AUDIT_AREAS.find((a) => a.key === params.area)?.key ?? null;
  const actor = params.actor === "public" || (params.actor && UUID.test(params.actor)) ? params.actor : null;
  const before = params.before && /^\d{1,15}$/.test(params.before) ? Number(params.before) : null;
  return {
    area,
    actor: actor ?? null,
    from: validDate(params.from),
    to: validDate(params.to),
    before,
  };
}

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant a calendar day begins in `timeZone` — the filter is "that day, for the couple", not for UTC. */
export function dayStartInZone(date: string, timeZone: string): Date {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone));
}

export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
