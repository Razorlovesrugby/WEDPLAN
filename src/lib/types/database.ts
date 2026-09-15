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
export type MessageKind = "invitation" | "reminder" | "update" | "test" | "digest";
export type MessageStatus = "queued" | "sent" | "failed" | "skipped";
export type HouseholdTier = "A" | "B" | "C";
export type ListKind = "checklist" | "timeline" | "generic";
export type ListItemStatus = "not_started" | "in_progress" | "done";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export type WeddingRow = {
  id: string;
  name: string;
  wedding_date: string | null;
  timezone: string;
  base_currency: string;
  capacity: number | null;
  /** Rank of the last household above the A/B cut line. */
  cut_rank: string | null;
  /** Rank of the last household above the B/C line; null means one waitlist. */
  tier_b_rank: string | null;
  rsvp_lock_at: string | null;
  invite_send_on: string | null;
  /** Digest urgency window in days — "overdue + due within this many days". Send day/time stays vercel.json's fixed cron. */
  reminder_window_days: number;
  created_at: string;
  updated_at: string;
}

export type CollaboratorRow = {
  id: string;
  wedding_id: string;
  user_id: string;
  role: CollaboratorRole;
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
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
// Views
// ---------------------------------------------------------------------------
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
  /** Derived from rank against the wedding's cut lines. Never stored. */
  tier: HouseholdTier;
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
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
type Timestamps = "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      // The second parameter lists columns with a database DEFAULT. Nullable
      // columns are inferred, so they are not repeated here.
      weddings: Table<WeddingRow, "id" | Timestamps | "timezone" | "base_currency" | "reminder_window_days">;
      collaborators: Table<CollaboratorRow, "id" | "created_at" | "role">;
      events: Table<EventRow, "id" | Timestamps | "is_public" | "sort_order">;
      households: Table<HouseholdRow, "id" | Timestamps | "reminders_muted">;
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
        "id" | Timestamps | "type" | "scope" | "required" | "options" | "sort_order" | "active"
      >;
      rsvp_answers: Table<RsvpAnswerRow, "id" | "answered_at" | "value", RsvpAnswerRelationships>;
      message_log: Table<MessageLogRow, "id" | "created_at" | "channel" | "status">;
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
    };
    Views: {
      v_households: View<HouseholdView>;
      v_household_rsvp: View<HouseholdRsvpView>;
      v_wedding_stats: View<WeddingStatsView>;
      v_timeline_items: View<TimelineItemView>;
    };
    Functions: Record<string, never>;
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
      household_tier: HouseholdTier;
      list_kind: ListKind;
      list_item_status: ListItemStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
