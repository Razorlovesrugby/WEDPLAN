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

type BudgetItemListRelationships = [
  Rel<
    "budget_item_lists_budget_item_id_wedding_id_fkey",
    ["budget_item_id", "wedding_id"],
    "budget_items",
    ["id", "wedding_id"]
  >,
  Rel<"budget_item_lists_list_id_wedding_id_fkey", ["list_id", "wedding_id"], "lists", ["id", "wedding_id"]>,
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
export type ListKind = "checklist" | "timeline" | "generic";
export type ListItemStatus = "not_started" | "in_progress" | "done";
export type BudgetQuantityBasis = "flat" | "per_adult" | "per_child" | "per_seat" | "consumption" | "manual";
export type BudgetGuestBasis = "per_adult" | "per_seat";
export type ReminderDueSource = "list_item" | "payment";
export type RunSheetTrack = "guests" | "couple" | "vendors" | "other";

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
// Budget (spec 6)
// ---------------------------------------------------------------------------
export type BudgetCategoryRow = {
  id: string;
  wedding_id: string;
  name: string;
  sort_order: number;
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
  currency: string;
  /** Units of weddings.base_currency per 1 unit of `currency`. Null/1 when currency already matches base_currency. */
  fx_rate: number | null;
  quantity_basis: BudgetQuantityBasis;
  /** Minor units. Null for `consumption` — component rows carry their own pricing. */
  unit_price: number | null;
  estimated: number | null;
  quoted: number | null;
  contracted: number | null;
  contracted_task_created: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Planner-entered multiplier for the `manual` basis (spec 6.1) — decimals allowed, defaults to 1 when blank. Null and unused for every other basis. */
  quantity: number | null;
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
  currency: string;
  fx_rate: number | null;
  paid_at: string | null;
  reference: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Global reference data — no wedding_id. Readable by every collaborator, writable only by getFxRate's server-role lookup path. */
export type FxRateRow = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  as_of: string;
  fetched_at: string;
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
  /** The cut_lines.label this household falls under. Derived, never stored. */
  tier: string;
  /** 0-indexed position of that cut line. 0 = the top tier, the one that counts toward capacity. */
  tier_position: number;
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

/** `v_budget_items` — every budget_items row plus computed/derived money columns. See spec 6, section 3. */
export type BudgetItemView = BudgetItemRow & {
  /** "The best number we currently have," in the row's own currency — never one of estimated/quoted/contracted stored as truth. */
  computed_current: number;
  computed_current_base: number;
  /** sum(payments.amount) where paid_at is not null, in the item's own currency (assumes payments share the item's currency). */
  paid: number;
  /** Same sum, converted via each payment's own fx_rate — correct even if a payment's currency differs from the item's. */
  paid_base: number;
  outstanding_base: number;
}

/** `v_budget_summary` — one row per wedding, every total in weddings.base_currency. */
export type BudgetSummaryView = {
  wedding_id: string;
  total_estimated: number;
  total_quoted: number;
  total_contracted: number;
  total_paid: number;
  total_outstanding: number;
  per_head_adult: number | null;
  per_head_seat: number | null;
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

/** `v_budget_item_tasks` — every list_item linked to a budget line, directly or via its list, deduplicated. See spec 6, section 7. */
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
  linked_via_list: boolean;
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
      budget_categories: Table<BudgetCategoryRow, "id" | Timestamps | "sort_order">;
      budget_items: Table<
        BudgetItemRow,
        "id" | Timestamps | "quantity_basis" | "contracted_task_created",
        BudgetItemRelationships
      >;
      consumption_components: Table<
        ConsumptionComponentRow,
        "id" | Timestamps | "wastage_buffer_pct" | "sort_order",
        ConsumptionComponentRelationships
      >;
      payments: Table<PaymentRow, "id" | Timestamps, PaymentRelationships>;
      fx_rates: Table<FxRateRow, "fetched_at">;
      budget_item_tasks: Table<BudgetItemTaskRow, "created_at", BudgetItemTaskRelationships>;
      budget_item_lists: Table<BudgetItemListRow, "created_at", BudgetItemListRelationships>;
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
      v_wedding_stats: View<WeddingStatsView>;
      v_timeline_items: View<TimelineItemView>;
      v_budget_items: View<BudgetItemView>;
      v_budget_summary: View<BudgetSummaryView>;
      v_reminders_due: View<ReminderDueView>;
      v_budget_item_tasks: View<BudgetItemTaskView>;
      v_run_sheet_items: View<RunSheetItemView>;
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
    };
    CompositeTypes: Record<string, never>;
  };
}
