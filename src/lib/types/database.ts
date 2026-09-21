/**
 * Database types.
 *
 * Written as type aliases, never interfaces. supabase-js constrains each Row
 * to `Record<string, unknown>`; a TypeScript interface has no implicit index
 * signature and quietly fails that constraint, at which point every query in
 * the app resolves to `never` and casts hide it. Type aliases do satisfy it.
 *
 * Hand-maintained to match supabase/migrations. Once a Supabase project
 * exists, `npm run db:types` regenerates this file from the live schema and
 * that generated version becomes the source of truth — until then this keeps
 * the app type-checked against the schema as written.
 *
 * Insert and Update shapes are derived from Row rather than written out three
 * times, so a column added in one place cannot be forgotten in the others.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Columns the caller may omit because the database supplies a null. */
type NullableKeys<Row> = {
  [K in keyof Row]-?: null extends Row[K] ? K : never;
}[keyof Row];

/**
 * Row minus what the database fills in. Two sources of "optional": columns
 * with a DEFAULT (named per table below) and columns that accept null
 * (derived). Miss either and every insert in the app demands columns nobody
 * should have to supply.
 */
type Insertable<Row, Generated extends keyof Row> = Omit<Row, Generated | NullableKeys<Row>> &
  Partial<Pick<Row, (Generated | NullableKeys<Row>) & keyof Row>>;

/**
 * One foreign key, in the shape PostgREST's select parser expects.
 *
 * These are not decoration. The parser resolves an embedded select —
 * `guests(*, households(display_name))` — by looking through Relationships.
 * Leave the array empty and the embed resolves to `never`, which is
 * assignable to anything, so the query still compiles and silently loses all
 * type safety.
 */
type Rel<
  Name extends string,
  Columns extends string[],
  Ref extends string,
  RefColumns extends string[],
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne: OneToOne;
  referencedRelation: Ref;
  referencedColumns: RefColumns;
};

type Table<Row, Generated extends keyof Row, Relationships extends unknown[] = []> = {
  Row: Row;
  Insert: Insertable<Row, Generated>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

type View<Row> = { Row: Row; Relationships: [] };

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------
// Only the foreign keys the app actually embeds through. `supabase gen types`
// emits the full set once a project exists; until then, adding an embed means
// adding its relationship here or the result silently becomes `never`.
//
// Note the two-column references: tenancy is enforced by composite foreign
// keys on (parent_id, wedding_id), so these mirror that.

type GuestRelationships = [
  Rel<
    "guests_household_id_wedding_id_fkey",
    ["household_id", "wedding_id"],
    "households",
    ["id", "wedding_id"]
  >,
];

type GuestTagRelationships = [
  Rel<"guest_tags_guest_id_wedding_id_fkey", ["guest_id", "wedding_id"], "guests", ["id", "wedding_id"]>,
  Rel<"guest_tags_tag_id_wedding_id_fkey", ["tag_id", "wedding_id"], "tags", ["id", "wedding_id"]>,
];

type RsvpRelationships = [
  Rel<"rsvps_guest_id_wedding_id_fkey", ["guest_id", "wedding_id"], "guests", ["id", "wedding_id"]>,
  Rel<"rsvps_event_id_wedding_id_fkey", ["event_id", "wedding_id"], "events", ["id", "wedding_id"]>,
];

type InvitationRelationships = [
  Rel<
    "invitations_household_id_wedding_id_fkey",
    ["household_id", "wedding_id"],
    "households",
    ["id", "wedding_id"],
    true
  >,
];

type SongRequestRelationships = [
  Rel<
    "song_requests_household_id_wedding_id_fkey",
    ["household_id", "wedding_id"],
    "households",
    ["id", "wedding_id"],
    true
  >,
];

type GuestNoteRelationships = [
  Rel<
    "guest_notes_household_id_wedding_id_fkey",
    ["household_id", "wedding_id"],
    "households",
    ["id", "wedding_id"],
    true
  >,
];

type RsvpAnswerRelationships = [
  Rel<
    "rsvp_answers_question_id_wedding_id_fkey",
    ["question_id", "wedding_id"],
    "rsvp_questions",
    ["id", "wedding_id"]
  >,
];

type InvitationEventRelationships = [
  Rel<
    "invitation_events_invitation_id_wedding_id_fkey",
    ["invitation_id", "wedding_id"],
    "invitations",
    ["id", "wedding_id"]
  >,
  Rel<
    "invitation_events_event_id_wedding_id_fkey",
    ["event_id", "wedding_id"],
    "events",
    ["id", "wedding_id"]
  >,
];

type ListSectionRelationships = [
  Rel<"list_sections_list_id_wedding_id_fkey", ["list_id", "wedding_id"], "lists", ["id", "wedding_id"]>,
];

type ListItemRelationships = [
  Rel<"list_items_list_id_wedding_id_fkey", ["list_id", "wedding_id"], "lists", ["id", "wedding_id"], false>,
  Rel<
    "list_items_section_id_wedding_id_fkey",
    ["section_id", "wedding_id"],
    "list_sections",
    ["id", "wedding_id"]
  >,
];

type BudgetItemRelationships = [
  Rel<
    "budget_items_category_id_wedding_id_fkey",
    ["category_id", "wedding_id"],
    "budget_categories",
    ["id", "wedding_id"]
  >,
  Rel<"budget_items_event_id_wedding_id_fkey", ["event_id", "wedding_id"], "events", ["id", "wedding_id"]>,
];

type ConsumptionComponentRelationships = [
  Rel<
    "consumption_components_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
];

type PaymentRelationships = [
  Rel<
    "payments_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
];

type BudgetItemTaskRelationships = [
  Rel<
    "budget_item_tasks_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
  Rel<
    "budget_item_tasks_list_item_id_wedding_id_fkey",
    ["list_item_id", "wedding_id"],
    "list_items",
    ["id", "wedding_id"]
  >,
];

type RunSheetItemRelationships = [
  Rel<"run_sheet_items_event_id_wedding_id_fkey", ["event_id", "wedding_id"], "events", ["id", "wedding_id"]>,
  Rel<
    "run_sheet_items_predecessor_id_wedding_id_fkey",
    ["predecessor_id", "wedding_id"],
    "run_sheet_items",
    ["id", "wedding_id"]
  >,
];

type CoachStopRelationships = [
  Rel<"coach_stops_coach_run_id_wedding_id_fkey", ["coach_run_id", "wedding_id"], "coach_runs", ["id", "wedding_id"]>,
];

type CoachSeatRelationships = [
  Rel<"coach_seats_coach_run_id_wedding_id_fkey", ["coach_run_id", "wedding_id"], "coach_runs", ["id", "wedding_id"]>,
  Rel<"coach_seats_coach_stop_id_wedding_id_fkey", ["coach_stop_id", "wedding_id"], "coach_stops", ["id", "wedding_id"]>,
  Rel<"coach_seats_household_id_wedding_id_fkey", ["household_id", "wedding_id"], "households", ["id", "wedding_id"]>,
];

type SiteAssetRelationships = [
  Rel<"site_assets_uploaded_by_household_wedding_id_fkey", ["uploaded_by_household", "wedding_id"], "households", ["id", "wedding_id"]>,
];

type AccommodationRelationships = [
  Rel<"accommodations_image_fk", ["image_id", "wedding_id"], "site_assets", ["id", "wedding_id"]>,
];

type MoodboardRelationships = [
  Rel<"moodboards_event_id_wedding_id_fkey", ["event_id", "wedding_id"], "events", ["id", "wedding_id"]>,
];

type MoodboardItemRelationships = [
  Rel<
    "moodboard_items_moodboard_id_wedding_id_fkey",
    ["moodboard_id", "wedding_id"],
    "moodboards",
    ["id", "wedding_id"]
  >,
];

type MoodboardShareRelationships = [
  Rel<
    "moodboard_shares_moodboard_id_wedding_id_fkey",
    ["moodboard_id", "wedding_id"],
    "moodboards",
    ["id", "wedding_id"]
  >,
];

type MoodboardClipTokenRelationships = [
  Rel<
    "moodboard_clip_tokens_default_moodboard_id_wedding_id_fkey",
    ["default_moodboard_id", "wedding_id"],
    "moodboards",
    ["id", "wedding_id"]
  >,
];

type BudgetItemListRelationships = [
  Rel<
    "budget_item_lists_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
  Rel<"budget_item_lists_list_id_wedding_id_fkey", ["list_id", "wedding_id"], "lists", ["id", "wedding_id"]>,
];

type BudgetItemSectionRelationships = [
  Rel<
    "budget_item_sections_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
  Rel<
    "budget_item_sections_section_id_wedding_id_fkey",
    ["section_id", "wedding_id"],
    "list_sections",
    ["id", "wedding_id"]
  >,
];

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export type CollaboratorRole = "owner" | "partner";
export type AgeBand = "adult" | "child" | "infant";
export type GuestSide = "partner_a" | "partner_b" | "both" | "other";
export type RsvpStatus = "pending" | "yes" | "no" | "maybe";
export type InviteChannel = "email" | "whatsapp" | "post" | "hand";
export type QuestionType =
  | "short_text"
  | "long_text"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "number";
export type QuestionScope = "guest" | "household";
/** `save_the_date` added by 0016 — its own kind, not an early invitation, so
 *  the chasing cron never counts it as a question somebody failed to answer. */
export type TransportKind = "parking" | "taxi" | "train" | "walk" | "other";
export type CoachDirection = "to_venue" | "from_venue";
export type SiteAssetKind = "hero" | "gallery" | "story" | "party" | "stay";

export type MessageKind =
  | "invitation"
  | "save_the_date"
  | "reminder"
  | "update"
  | "test"
  | "digest";
export type MessageStatus = "queued" | "sent" | "failed" | "skipped";
export type ListKind = "checklist" | "timeline" | "generic";
export type ListItemStatus = "not_started" | "in_progress" | "done";
export type BudgetQuantityBasis = "flat" | "per_adult" | "per_child" | "per_seat" | "consumption" | "manual";
export type BudgetGuestBasis = "per_adult" | "per_seat";
/** spec 18 — a per-line GST toggle; "exclusive" adds a hardcoded 15% to everything that sums the line. */
export type BudgetGstTreatment = "inclusive" | "exclusive";
/** spec 19 — where a line's working estimate came from: typed, derived from its allocation, or nowhere yet. */
export type EstimateSource = "entered" | "allocation" | "none";
export type ReminderDueSource = "list_item" | "payment";
export type RunSheetTrack = "guests" | "couple" | "vendors" | "other";
export type MoodboardShareChannel = "link" | "public_site" | "rsvp";
export type MoodboardItemOrigin = "upload" | "clip" | "pinterest";
export type MoodboardLayout = "grid" | "canvas";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export type WeddingRow = {
  id: string;
  name: string;
  /** Public site address: /w/<slug>. Derived from `name` on insert (0015). */
  slug: string;
  wedding_date: string | null;
  timezone: string;
  capacity: number | null;
  rsvp_lock_at: string | null;
  invite_send_on: string | null;
  /** Digest urgency window in days — "overdue + due within this many days". Send day/time stays vercel.json's fixed cron. */
  reminder_window_days: number;
  /** The overall wedding budget in minor units, NZD (spec 19). Null means none set — every allocation-derived figure is then null and every budget line behaves as it did before spec 19. */
  total_budget: number | null;
  created_at: string;
  updated_at: string;
}

export type TransportOptionRow = {
  id: string;
  wedding_id: string;
  kind: TransportKind;
  name: string;
  detail: string | null;
  url: string | null;
  /**
   * Spec 25 §5. All four nullable, and that is the promise: 0017 refused these
   * columns because a wedding people drive to would show empty ones. The
   * renderer draws only what is filled.
   */
  arrival_point_id: string | null;
  duration_minutes: number | null;
  /** Integer minor units, NZD (spec 18). Never a float. */
  cost_low: number | null;
  cost_high: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Where guests fly or sail into, and how far it is (spec 25 §5). */
export type ArrivalPointRow = {
  id: string;
  wedding_id: string;
  /** The big display token — MXP. Null when it is not an airport. */
  code: string | null;
  name: string;
  region: string | null;
  minutes_to_venue: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** A named dress code an event points at (spec 25 §4). */
export type DressCodeRow = {
  id: string;
  wedding_id: string;
  name: string;
  board_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * One labelled block of guidance under a code.
 *
 * `label` is free text on purpose. Two columns called for_her and for_him
 * would hardcode a gender binary into the schema of a product whose guest list
 * does not have one; the app pre-fills those two words and the couple may
 * write anything (spec 25 Answered, question 1).
 */
export type DressCodeNoteRow = {
  id: string;
  wedding_id: string;
  dress_code_id: string;
  label: string;
  body: string | null;
  board_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CoachRunRow = {
  id: string;
  wedding_id: string;
  direction: CoachDirection;
  label: string;
  /**
   * The event this run serves, so the schedule can render it under that event
   * (spec 25 §6). Null means the whole weekend, which is how every run behaved
   * before 0026 and how they keep behaving.
   */
  event_id: string | null;
  departs_at: string | null;
  /** Null means "not counted yet", which is not the same as zero. */
  capacity: number | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CoachStopRow = {
  id: string;
  wedding_id: string;
  coach_run_id: string;
  name: string;
  address: string | null;
  map_url: string | null;
  pickup_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CoachSeatRow = {
  id: string;
  wedding_id: string;
  coach_run_id: string;
  coach_stop_id: string;
  household_id: string;
  seats: number;
  created_at: string;
  updated_at: string;
};

export type AccommodationRow = {
  id: string;
  wedding_id: string;
  name: string;
  address: string | null;
  url: string | null;
  distance_label: string | null;
  notes: string | null;
  image_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SiteAssetRow = {
  id: string;
  wedding_id: string;
  kind: SiteAssetKind;
  storage_path: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  alt: string | null;
  credit: string | null;
  /** Null = the couple uploaded it; set = a guest did, from their RSVP link. */
  uploaded_by_household: string | null;
  /** Null = waiting for approval. Default moderation is 'review'. */
  approved_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SiteVisitRow = {
  wedding_id: string;
  day: string;
  section: string;
  count: number;
};

/** coach_runs plus seats taken and left, both computed (spec 14 §7.1). */
export type CoachRunView = CoachRunRow & {
  seats_taken: number;
  /** Null when the run has no capacity set — not zero. */
  seats_left: number | null;
};

export type CollaboratorRow = {
  id: string;
  wedding_id: string;
  user_id: string;
  role: CollaboratorRole;
  /** A typed name for the assign picker and every place an assignee renders — falls back to the role label when unset (spec 15 §2). */
  display_name: string | null;
  created_at: string;
}

export type EventRow = {
  id: string;
  wedding_id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  is_public: boolean;
  sort_order: number;
  /**
   * Guest-facing note for this event (spec 21 §5.4). Shown on a household's
   * own page for the events they are invited to — never the run sheet, which
   * carries supplier phone numbers.
   */
  guest_note: string | null;
  /** The dress code this event wears (spec 25 §4). */
  dress_code_id: string | null;
  created_at: string;
  updated_at: string;
}

export type HouseholdRow = {
  id: string;
  wedding_id: string;
  display_name: string;
  address: string | null;
  rank: string;
  reminders_muted: boolean;
  notes: string | null;
  /** Readable half of /w/<wedding>/<slug>-<suffix>. Editable (spec 21 §4). */
  slug: string;
  /** Unguessable half. Minted once; an edit never changes it (spec 21 §3). */
  slug_suffix: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** One block of the site the planner is editing (spec 23 §4). */
export type SiteBlockRow = {
  id: string;
  wedding_id: string;
  type: string;
  payload: Json;
  style: Json;
  sort_order: number;
  visible: boolean;
  audience: "everyone" | "invited" | "public_only";
  created_at: string;
  updated_at: string;
}

/** A published snapshot of the whole page. What guests actually see. */
export type SiteRevisionRow = {
  id: string;
  wedding_id: string;
  published_at: string;
  published_by: string | null;
  blocks: Json;
  note: string | null;
}

/** A song a guest asked for (spec 23 §8). */
export type SongRequestRow = {
  id: string;
  wedding_id: string;
  household_id: string | null;
  guest_id: string | null;
  /** The optional "your name" field — a name, never an identity. */
  asked_by: string | null;
  title: string;
  artist: string | null;
  note: string | null;
  status: "new" | "approved" | "played" | "ignored";
  created_at: string;
  updated_at: string;
}

/** A per-guest exception to their household's invitation (spec 22 §4). */
export type GuestEventOverrideRow = {
  wedding_id: string;
  guest_id: string;
  event_id: string;
  invited: boolean;
  created_at: string;
  updated_at: string;
}

/** One open of a household's invitation. No IP, no user agent (spec 22 §9). */
export type InvitationViewRow = {
  id: string;
  wedding_id: string;
  household_id: string;
  viewed_at: string;
  source: "address" | "token" | "email";
}

/** A household address that has been replaced, kept so old links still land (spec 21 §4). */
export type HouseholdSlugAliasRow = {
  wedding_id: string;
  household_id: string;
  slug: string;
  slug_suffix: string;
  retired_at: string;
}

/** Spec 5, part A. Replaces weddings.cut_rank/tier_b_rank — "how many lines" is now data. */
export type CutLineRow = {
  id: string;
  wedding_id: string;
  label: string;
  /** 0-indexed, top to bottom. Position 0 counts toward capacity. */
  position: number;
  /** Rank of the last household in this tier. Null on the last line by position — "no lower bound." */
  boundary_rank: string | null;
  created_at: string;
  updated_at: string;
}

export type GuestRow = {
  id: string;
  wedding_id: string;
  household_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  age_band: AgeBand;
  side: GuestSide | null;
  dietary: string | null;
  accessibility: string | null;
  notes: string | null;
  is_plus_one: boolean;
  plus_one_for: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TagRow = {
  id: string;
  wedding_id: string;
  name: string;
  colour: string;
  created_at: string;
}

export type GuestTagRow = {
  wedding_id: string;
  guest_id: string;
  tag_id: string;
  created_at: string;
}

export type InvitationRow = {
  id: string;
  wedding_id: string;
  household_id: string;
  token_hash: string;
  token_encrypted: string;
  channel: InviteChannel;
  sent_at: string | null;
  opened_at: string | null;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type InvitationEventRow = {
  wedding_id: string;
  invitation_id: string;
  event_id: string;
}

export type RsvpRow = {
  id: string;
  wedding_id: string;
  guest_id: string;
  event_id: string;
  status: RsvpStatus;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RsvpQuestionRow = {
  id: string;
  wedding_id: string;
  label: string;
  help_text: string | null;
  type: QuestionType;
  scope: QuestionScope;
  required: boolean;
  options: Json;
  sort_order: number;
  active: boolean;
  /**
   * Set on questions the app owns rather than the planner — today only
   * `decline_note` (spec 22 §3a). Null for everything a planner wrote.
   */
  builtin_key: string | null;
  created_at: string;
  updated_at: string;
}

export type RsvpAnswerRow = {
  id: string;
  wedding_id: string;
  question_id: string;
  guest_id: string | null;
  household_id: string | null;
  value: Json;
  answered_at: string;
}

export type MessageLogRow = {
  id: string;
  wedding_id: string;
  household_id: string | null;
  kind: MessageKind;
  channel: InviteChannel;
  to_address: string | null;
  dedupe_key: string;
  status: MessageStatus;
  provider_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export type SiteContentRow = {
  id: string;
  wedding_id: string;
  block_key: string;
  payload: Json;
  sort_order: number;
  visible: boolean;
  updated_at: string;
}

/**
 * The throttle table. Deliberately has no wedding_id: a failed token lookup
 * has no wedding to attribute itself to, which is the point of a throttle.
 * Service role only — there is no RLS policy on it at all.
 */
export type RsvpTokenAttemptRow = {
  id: number;
  ip_hash: string;
  succeeded: boolean;
  attempted_at: string;
};

/**
 * One household's vote for one song (spec 25 §11).
 *
 * `household_id` is NOT NULL here and in the database, and that is the design
 * rather than an oversight: without identity, "one vote each" is a cookie, and
 * a cookie is a suggestion (spec 25 Answered, question 4).
 */
export type SongVoteRow = {
  id: string;
  wedding_id: string;
  song_request_id: string;
  household_id: string;
  created_at: string;
};

/**
 * A line in the guestbook (spec 25 §12).
 *
 * Born `approved` when it came from a household's own link and `new` when it
 * came from the shared address — the one rule that made reopening spec 23's
 * cut affordable. No `played`; that rung belongs to a song.
 */
export type GuestNoteRow = {
  id: string;
  wedding_id: string;
  household_id: string | null;
  guest_id: string | null;
  author_name: string | null;
  body: string;
  status: "new" | "approved" | "ignored";
  created_at: string;
  updated_at: string;
};

export type SavedViewRow = {
  id: string;
  wedding_id: string;
  user_id: string;
  name: string;
  filters: Json;
  created_at: string;
}

/** Global reference data — no wedding_id. Readable by every collaborator, writable by nobody through the API. */
export type ListTemplateRow = {
  id: string;
  key: string;
  title: string;
  kind: ListKind;
  sort_order: number;
  payload: Json;
  created_at: string;
}

export type ListRow = {
  id: string;
  wedding_id: string;
  template_key: string | null;
  title: string;
  kind: ListKind;
  color: string | null;
  icon: string | null;
  event_id: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ListSectionRow = {
  id: string;
  wedding_id: string;
  list_id: string;
  title: string;
  /**
   * Free text below the section's own title (spec 15 §4, revised) — links,
   * ideas, anything relevant to the section that isn't itself a task.
   * Every section has one; it's independent of whatever tasks the section
   * also holds, not a replacement for them. Collapsed in the UI until
   * clicked (ItemRow's sibling, `SectionNotes`).
   */
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export type ListItemRow = {
  id: string;
  wedding_id: string;
  list_id: string;
  section_id: string | null;
  title: string;
  notes: string | null;
  qty: number | null;
  url: string | null;
  due_date: string | null;
  /**
   * Non-null: due_date is calculated relative to the wedding date, kept in
   * sync by updateWeddingSettings, not typed directly. Negative = before the
   * wedding, positive = after, 0 = on the day. Mutually exclusive with a
   * fixed due_date — setting one clears the other (spec 15 §5).
   */
  due_date_offset_days: number | null;
  done_at: string | null;
  done_by: string | null;
  flagged: boolean;
  priority: number;
  snoozed_until: string | null;
  sort_order: number;
  template_key: string | null;
  offset_days: number | null;
  generated_at: string | null;
  status: ListItemStatus;
  parent_item_id: string | null;
  /** Shape: RepeatRule in src/lib/lists/generate.ts. Null when the item does not repeat. */
  repeat_rule: Json;
  recurrence_parent_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Budget (spec 6)
// ---------------------------------------------------------------------------
export type BudgetCategoryRow = {
  id: string;
  wedding_id: string;
  name: string;
  sort_order: number;
  /** This category's target share of weddings.total_budget, as a percentage (spec 19). Null when unallocated. */
  allocation_pct: number | null;
  created_at: string;
  updated_at: string;
}

export type BudgetItemRow = {
  id: string;
  wedding_id: string;
  category_id: string;
  event_id: string | null;
  label: string;
  vendor_name: string | null;
  quantity_basis: BudgetQuantityBasis;
  /** Minor units. Null for `consumption` — component rows carry their own pricing. */
  unit_price: number | null;
  estimated: number | null;
  quoted: number | null;
  contracted: number | null;
  /** Whether estimated/quoted/contracted/unit_price were entered incl. or excl. GST (spec 18). Only the live computed_current grosses up when exclusive — these stay exactly as typed. */
  gst_treatment: BudgetGstTreatment;
  contracted_task_created: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Planner-entered multiplier for the `manual` basis (spec 6.1) — decimals allowed, defaults to 1 when blank. Null and unused for every other basis. */
  quantity: number | null;
  /** This line's target share of its CATEGORY's target amount, as a percentage (spec 19) — 80% of Drinks, not 80% of the wedding. */
  allocation_pct: number | null;
}

export type ConsumptionComponentRow = {
  id: string;
  wedding_id: string;
  budget_item_id: string;
  label: string;
  guest_basis: BudgetGuestBasis;
  servings_per_guest_per_hour: number;
  duration_hours: number;
  /** Minor units. */
  price_per_serving: number;
  /** e.g. 0.1 for a 10% buffer. */
  wastage_buffer_pct: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PaymentRow = {
  id: string;
  wedding_id: string;
  budget_item_id: string;
  due_date: string | null;
  /** Minor units. */
  amount: number;
  paid_at: string | null;
  reference: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BudgetItemTaskRow = {
  wedding_id: string;
  budget_item_id: string;
  list_item_id: string;
  created_at: string;
}

export type BudgetItemListRow = {
  wedding_id: string;
  budget_item_id: string;
  list_id: string;
  created_at: string;
}

/** A budget line linked to a single section, rather than a whole list or one task (spec 16, section 3). */
export type BudgetItemSectionRow = {
  wedding_id: string;
  budget_item_id: string;
  section_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Run sheet (spec 5, part B)
// ---------------------------------------------------------------------------
export type RunSheetItemRow = {
  id: string;
  wedding_id: string;
  event_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  /** Free text — no vendor FK exists yet. */
  owner: string | null;
  track: RunSheetTrack;
  pinned: boolean;
  /** Set iff pinned. */
  pinned_at: string | null;
  duration_minutes: number;
  /** Null for a pinned item, or an unpinned one with no predecessor yet ("time TBD"). */
  predecessor_id: string | null;
  offset_minutes: number;
  /** Schema-only in this pass — nothing reads it yet. */
  guest_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Moodboards
// ---------------------------------------------------------------------------
export type MoodboardRow = {
  id: string;
  wedding_id: string;
  title: string;
  description: string | null;
  event_id: string | null;
  /** Provisioned by 0014; nothing reads it yet. */
  layout: MoodboardLayout;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MoodboardItemRow = {
  id: string;
  wedding_id: string;
  moodboard_id: string;
  storage_path: string;
  thumb_path: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  /** Null means the bytes never arrived. Hidden everywhere except the board page that made it. */
  uploaded_at: string | null;
  /** Shown to everyone. */
  caption: string | null;
  /** Shown only where a share says to. */
  note: string | null;
  source_url: string | null;
  credit: string | null;
  is_cover: boolean;
  sort_order: number;
  origin: MoodboardItemOrigin;
  /** The Pinterest pin id, for import dedupe. Null for anything else. */
  external_id: string | null;
  x: number | null;
  y: number | null;
  scale: number | null;
  z_index: number | null;
  created_at: string;
  updated_at: string;
}

export type MoodboardShareRow = {
  id: string;
  wedding_id: string;
  moodboard_id: string;
  channel: MoodboardShareChannel;
  label: string | null;
  /** Non-null iff channel is "link" — the database enforces it. */
  token_hash: string | null;
  token_encrypted: string | null;
  show_notes: boolean;
  show_credits: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MoodboardClipTokenRow = {
  id: string;
  wedding_id: string;
  label: string;
  token_hash: string;
  token_encrypted: string;
  default_moodboard_id: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PinterestAccountRow = {
  id: string;
  wedding_id: string;
  external_user_id: string;
  username: string | null;
  /** Encrypted, not hashed: these have to be used, not compared. */
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[];
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
/**
 * The effective answer to "is this person invited to this event" (spec 22 §4)
 * — `coalesce(override, household_invited)`, computed in one place.
 */
export type GuestEventInviteView = {
  wedding_id: string;
  household_id: string;
  guest_id: string;
  event_id: string;
  invited: boolean;
  household_invited: boolean;
  override: boolean | null;
  invitation_id: string | null;
  sent_at: string | null;
}

export type HouseholdView = {
  id: string;
  wedding_id: string;
  display_name: string;
  address: string | null;
  rank: string;
  reminders_muted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  head_count: number;
  adult_count: number;
  child_count: number;
  infant_count: number;
  /** Adults plus children. Infants sit on laps and are counted separately. */
  seat_count: number;
  /** Running seat total down the ranked list — what the cut line is drawn against. */
  seats_cumulative: number;
  /** The cut_lines.label this household falls under. Derived, never stored. */
  tier: string;
  /** 0-indexed position of that cut line. 0 = the top tier, the one that counts toward capacity. */
  tier_position: number;
  /** Readable half of the household's address (spec 21). */
  slug: string;
  /** Unguessable half of it. */
  slug_suffix: string;
}

export type HouseholdRsvpView = {
  household_id: string;
  wedding_id: string;
  invitation_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  channel: InviteChannel | null;
  rsvp_total: number;
  rsvp_answered: number;
  rsvp_yes: number;
  rsvp_no: number;
  rsvp_maybe: number;
  response_state: "none" | "partial" | "complete";
  /** Most recent open of this household's invitation, or null (spec 22 §9). */
  last_viewed_at: string | null;
  /** How many opens in total. Zero, never null. */
  view_count: number;
}

export type WeddingStatsView = {
  wedding_id: string;
  capacity: number | null;
  household_count: number;
  above_cut_households: number;
  above_cut_seats: number;
  guest_count: number;
  adult_count: number;
  child_count: number;
  infant_count: number;
  invited_households: number;
  opened_households: number;
  attending_guests: number;
  declined_guests: number;
  maybe_guests: number;
  outstanding_guests: number;
  seats_remaining: number | null;
  /** Sent, opened, and still no answer — the list worth chasing (spec 22 §9). */
  silent_households: number;
}

/** `v_timeline_items` — every list_items row with a due_date, joined to its list. See spec 1, section 3. */
export type TimelineItemView = {
  id: string;
  wedding_id: string;
  list_id: string;
  list_title: string;
  list_color: string | null;
  list_kind: ListKind;
  event_id: string | null;
  section_id: string | null;
  parent_item_id: string | null;
  title: string;
  notes: string | null;
  due_date: string;
  done_at: string | null;
  status: ListItemStatus;
  flagged: boolean;
  priority: number;
  assigned_to: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  /** Spec 16 §2 — set only when the list's icon wins over its color (see DEFAULT_LIST_COLOR usage sites). */
  list_icon: string | null;
}

/** `v_budget_items` — every budget_items row plus computed/derived money columns. See spec 6, section 3; spec 18 for the GST uplift. */
export type BudgetItemView = BudgetItemRow & {
  /** "The best number we currently have" — never one of estimated/quoted/contracted stored as truth. Grossed up by 15% when gst_treatment is "exclusive" (spec 18). */
  computed_current: number;
  /** sum(payments.amount) where paid_at is not null. */
  paid: number;
  outstanding: number;
  /** This line's target in minor units: its allocation_pct of its category's own target (spec 19). Null unless the overall budget, the category's % and the line's % all exist. */
  allocated_amount: number | null;
  /** The estimate being worked to: `estimated` when typed, else the allocation (÷1.15 first on a GST-exclusive line, so the line lands on its allocation). Computed on read — never written into `estimated`. */
  effective_estimated: number | null;
  /** Which of those two `effective_estimated` came from, so a screen can mark a figure nobody typed. */
  estimate_source: EstimateSource;
}

/** `v_budget_summary` — one row per wedding, every total in NZD. */
export type BudgetSummaryView = {
  wedding_id: string;
  total_estimated: number;
  total_quoted: number;
  total_contracted: number;
  total_paid: number;
  total_outstanding: number;
  /** Spec 19: the overall budget, echoed from weddings.total_budget. Null when none is set. */
  total_budget: number | null;
  /** Sum of every category's allocation_pct — 97 means 3% of the budget is still unallocated. Null when no category has one. */
  total_allocated_pct: number | null;
  /** Sum of every category's target amount. Null without an overall budget. */
  total_allocated_amount: number | null;
  /** total_budget minus total_allocated_amount — from the amounts, not the percentages, so rounding remainders land here. */
  unallocated_amount: number | null;
  /** Every line's computed_current, summed: the wedding's current spend-or-forecast. */
  total_current: number;
  /** total_current minus total_budget: positive is over. Null without an overall budget. */
  budget_variance: number | null;
  per_head_adult: number | null;
  per_head_seat: number | null;
}

/** `v_budget_category_totals` — spec 19's rollup: what a category was meant to cost, what it currently costs, and the gap both ways. */
export type BudgetCategoryTotalsView = {
  wedding_id: string;
  category_id: string;
  name: string;
  sort_order: number;
  allocation_pct: number | null;
  /** allocation_pct of the overall budget, in minor units. Null without both. */
  allocated_amount: number | null;
  /** Sums effective_estimated — so a line still on its allocation counts here (spec 19 §12, decision 1). */
  total_estimated: number;
  total_current: number;
  total_paid: number;
  total_outstanding: number;
  /** total_current minus allocated_amount: positive is over. */
  variance_amount: number | null;
  /** That variance as a percentage of this category's own allocation. */
  variance_pct: number | null;
  /** What this category is ACTUALLY taking of the overall budget, against the allocation_pct it was meant to take. */
  share_of_budget_pct: number | null;
  item_count: number;
  /** How many of those lines are still showing their allocation because nobody has typed an estimate — what stops a forecast reading as a firm number. */
  allocation_only_count: number;
}

/** `v_reminders_due` — spec 1's v_timeline_items unioned with unpaid payments. What the digest and dashboard tiles read; /timeline stays on v_timeline_items directly. */
export type ReminderDueView = {
  id: string;
  wedding_id: string;
  title: string;
  due_date: string;
  list_title: string;
  list_color: string | null;
  snoozed_until: string | null;
  status: ListItemStatus;
  source: ReminderDueSource;
}

/** `v_budget_item_tasks` — every list_item linked to a budget line, directly, via its list, or (spec 16 §3) via its section, deduplicated to its most specific source. See spec 6, section 7. */
export type BudgetItemTaskView = {
  budget_item_id: string;
  list_item_id: string;
  list_id: string;
  list_title: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  status: ListItemStatus;
  done_at: string | null;
  link_source: "direct" | "via_list" | "via_section";
}

/** `v_run_sheet_items` — every run_sheet_items row plus computed starts_at/ends_at/conflict. See spec 5, part B, section 3. */
export type RunSheetItemView = RunSheetItemRow & {
  /** Null when this item is unpinned with no (resolvable) predecessor — "time TBD". */
  starts_at: string | null;
  ends_at: string | null;
  /** True when this item's computed end runs past the next pinned anchor in the same event. Non-blocking. */
  conflict: boolean;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export type MoodboardView = MoodboardRow & {
  event_name: string | null;
  /** Uploaded items only — a half-finished upload is not on the board. */
  item_count: number;
  total_bytes: number;
  cover_thumb_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
  /** Live link shares: not revoked, not expired. */
  link_share_count: number;
  published_to_site: boolean;
  published_to_rsvp: boolean;
  last_viewed_at: string | null;
}

type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      // The second parameter lists columns with a database DEFAULT. Nullable
      // columns are inferred, so they are not repeated here.
      weddings: Table<
        WeddingRow,
        // `slug` is optional on insert: 0015's trigger derives one from the
        // name when it is absent, so callers that do not care never set it.
        "id" | Timestamps | "timezone" | "reminder_window_days" | "slug"
      >;
      collaborators: Table<CollaboratorRow, "id" | "created_at" | "role">;
      events: Table<
        EventRow,
        "id" | Timestamps | "is_public" | "sort_order" | "guest_note" | "dress_code_id"
      >;
      households: Table<HouseholdRow, "id" | Timestamps | "reminders_muted" | "slug" | "slug_suffix">;
      household_slug_aliases: Table<HouseholdSlugAliasRow, "retired_at">;
      guest_event_overrides: Table<GuestEventOverrideRow, Timestamps>;
      site_blocks: Table<
        SiteBlockRow,
        "id" | Timestamps | "payload" | "style" | "sort_order" | "visible" | "audience"
      >;
      site_revisions: Table<SiteRevisionRow, "id" | "published_at" | "published_by" | "note">;
      song_requests: Table<
        SongRequestRow,
        "id" | Timestamps | "status" | "household_id" | "guest_id" | "asked_by" | "artist" | "note",
        SongRequestRelationships
      >;
      invitation_views: Table<InvitationViewRow, "id" | "viewed_at" | "source">;
      cut_lines: Table<CutLineRow, "id" | Timestamps>;
      guests: Table<
        GuestRow,
        "id" | Timestamps | "age_band" | "is_plus_one" | "sort_order",
        GuestRelationships
      >;
      tags: Table<TagRow, "id" | "created_at" | "colour">;
      guest_tags: Table<GuestTagRow, "created_at", GuestTagRelationships>;
      invitations: Table<InvitationRow, "id" | Timestamps | "channel", InvitationRelationships>;
      invitation_events: Table<InvitationEventRow, never, InvitationEventRelationships>;
      rsvps: Table<RsvpRow, "id" | Timestamps | "status", RsvpRelationships>;
      rsvp_questions: Table<
        RsvpQuestionRow,
        | "id"
        | Timestamps
        | "type"
        | "scope"
        | "required"
        | "options"
        | "sort_order"
        | "active"
        | "builtin_key"
      >;
      rsvp_answers: Table<RsvpAnswerRow, "id" | "answered_at" | "value", RsvpAnswerRelationships>;
      message_log: Table<MessageLogRow, "id" | "created_at" | "channel" | "status">;
      transport_options: Table<
        TransportOptionRow,
        | "id"
        | Timestamps
        | "kind"
        | "sort_order"
        | "arrival_point_id"
        | "duration_minutes"
        | "cost_low"
        | "cost_high"
      >;
      arrival_points: Table<
        ArrivalPointRow,
        "id" | Timestamps | "sort_order" | "code" | "region" | "minutes_to_venue"
      >;
      dress_codes: Table<DressCodeRow, "id" | Timestamps | "sort_order" | "board_id">;
      dress_code_notes: Table<
        DressCodeNoteRow,
        "id" | Timestamps | "sort_order" | "body" | "board_id"
      >;
      song_votes: Table<SongVoteRow, "id" | "created_at">;
      guest_notes: Table<
        GuestNoteRow,
        "id" | Timestamps | "status" | "household_id" | "guest_id" | "author_name",
        GuestNoteRelationships
      >;
      coach_runs: Table<CoachRunRow, "id" | Timestamps | "sort_order" | "event_id">;
      coach_stops: Table<CoachStopRow, "id" | Timestamps | "sort_order", CoachStopRelationships>;
      coach_seats: Table<CoachSeatRow, "id" | Timestamps, CoachSeatRelationships>;
      accommodations: Table<AccommodationRow, "id" | Timestamps | "sort_order", AccommodationRelationships>;
      site_assets: Table<SiteAssetRow, "id" | Timestamps | "kind" | "sort_order", SiteAssetRelationships>;
      site_visits: Table<SiteVisitRow, "count">;
      site_content: Table<SiteContentRow, "id" | "updated_at" | "payload" | "sort_order" | "visible">;
      saved_views: Table<SavedViewRow, "id" | "created_at" | "filters">;
      rsvp_token_attempts: Table<RsvpTokenAttemptRow, "id" | "succeeded" | "attempted_at">;
      list_templates: Table<ListTemplateRow, "id" | "created_at" | "kind" | "sort_order" | "payload">;
      lists: Table<ListRow, "id" | Timestamps | "kind" | "sort_order">;
      list_sections: Table<ListSectionRow, "id" | "created_at" | "sort_order", ListSectionRelationships>;
      list_items: Table<
        ListItemRow,
        | "id"
        | Timestamps
        | "flagged"
        | "priority"
        | "sort_order"
        | "status"
        | "repeat_rule",
        ListItemRelationships
      >;
      budget_categories: Table<BudgetCategoryRow, "id" | Timestamps | "sort_order">;
      budget_items: Table<
        BudgetItemRow,
        "id" | Timestamps | "quantity_basis" | "gst_treatment" | "contracted_task_created",
        BudgetItemRelationships
      >;
      consumption_components: Table<
        ConsumptionComponentRow,
        "id" | Timestamps | "wastage_buffer_pct" | "sort_order",
        ConsumptionComponentRelationships
      >;
      payments: Table<PaymentRow, "id" | Timestamps, PaymentRelationships>;
      budget_item_tasks: Table<BudgetItemTaskRow, "created_at", BudgetItemTaskRelationships>;
      budget_item_lists: Table<BudgetItemListRow, "created_at", BudgetItemListRelationships>;
      budget_item_sections: Table<BudgetItemSectionRow, "created_at", BudgetItemSectionRelationships>;
      moodboards: Table<
        MoodboardRow,
        "id" | Timestamps | "layout" | "sort_order",
        MoodboardRelationships
      >;
      moodboard_items: Table<
        MoodboardItemRow,
        "id" | Timestamps | "is_cover" | "sort_order" | "origin",
        MoodboardItemRelationships
      >;
      moodboard_shares: Table<
        MoodboardShareRow,
        "id" | Timestamps | "channel" | "show_notes" | "show_credits" | "view_count",
        MoodboardShareRelationships
      >;
      moodboard_clip_tokens: Table<
        MoodboardClipTokenRow,
        "id" | Timestamps,
        MoodboardClipTokenRelationships
      >;
      pinterest_accounts: Table<PinterestAccountRow, "id" | Timestamps | "scopes">;
      run_sheet_items: Table<
        RunSheetItemRow,
        | "id"
        | Timestamps
        | "track"
        | "pinned"
        | "duration_minutes"
        | "offset_minutes"
        | "guest_visible"
        | "sort_order",
        RunSheetItemRelationships
      >;
    };
    Views: {
      v_households: View<HouseholdView>;
      v_household_rsvp: View<HouseholdRsvpView>;
      v_guest_event_invites: View<GuestEventInviteView>;
      v_wedding_stats: View<WeddingStatsView>;
      v_timeline_items: View<TimelineItemView>;
      v_budget_items: View<BudgetItemView>;
      v_budget_summary: View<BudgetSummaryView>;
      v_budget_category_totals: View<BudgetCategoryTotalsView>;
      v_reminders_due: View<ReminderDueView>;
      v_budget_item_tasks: View<BudgetItemTaskView>;
      v_run_sheet_items: View<RunSheetItemView>;
      v_moodboards: View<MoodboardView>;
      v_coach_runs: View<CoachRunView>;
    };
    Functions: {
      budget_guest_counts: {
        Args: { p_wedding_id: string; p_event_id?: string | null; p_force_invited?: boolean };
        Returns: { adult: number; child: number; seat: number }[];
      };
    };
    Enums: {
      collaborator_role: CollaboratorRole;
      age_band: AgeBand;
      guest_side: GuestSide;
      rsvp_status: RsvpStatus;
      invite_channel: InviteChannel;
      question_type: QuestionType;
      question_scope: QuestionScope;
      message_kind: MessageKind;
      message_status: MessageStatus;
      list_kind: ListKind;
      list_item_status: ListItemStatus;
      budget_quantity_basis: BudgetQuantityBasis;
      budget_guest_basis: BudgetGuestBasis;
      run_sheet_track: RunSheetTrack;
      moodboard_share_channel: MoodboardShareChannel;
      moodboard_item_origin: MoodboardItemOrigin;
      moodboard_layout: MoodboardLayout;
    };
    CompositeTypes: Record<string, never>;
  };
}
