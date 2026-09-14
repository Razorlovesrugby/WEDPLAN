/**
 * Database types.
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

/** Row minus the columns the database fills in, which become optional. */
type Insertable<Row, Generated extends keyof Row> = Omit<Row, Generated> &
  Partial<Pick<Row, Generated>>;

type Table<Row, Generated extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Generated>;
  Update: Partial<Row>;
  Relationships: [];
};

type View<Row> = { Row: Row; Relationships: [] };

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
export type MessageKind = "invitation" | "reminder" | "update" | "test";
export type MessageStatus = "queued" | "sent" | "failed" | "skipped";
export type HouseholdTier = "A" | "B" | "C";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export interface WeddingRow {
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
  created_at: string;
  updated_at: string;
}

export interface CollaboratorRow {
  id: string;
  wedding_id: string;
  user_id: string;
  role: CollaboratorRole;
  created_at: string;
}

export interface EventRow {
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

export interface HouseholdRow {
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

export interface GuestRow {
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

export interface TagRow {
  id: string;
  wedding_id: string;
  name: string;
  colour: string;
  created_at: string;
}

export interface GuestTagRow {
  wedding_id: string;
  guest_id: string;
  tag_id: string;
  created_at: string;
}

export interface InvitationRow {
  id: string;
  wedding_id: string;
  household_id: string;
  token_hash: string;
  channel: InviteChannel;
  sent_at: string | null;
  opened_at: string | null;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InvitationEventRow {
  wedding_id: string;
  invitation_id: string;
  event_id: string;
}

export interface RsvpRow {
  id: string;
  wedding_id: string;
  guest_id: string;
  event_id: string;
  status: RsvpStatus;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RsvpQuestionRow {
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

export interface RsvpAnswerRow {
  id: string;
  wedding_id: string;
  question_id: string;
  guest_id: string | null;
  household_id: string | null;
  value: Json;
  answered_at: string;
}

export interface MessageLogRow {
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

export interface SiteContentRow {
  id: string;
  wedding_id: string;
  block_key: string;
  payload: Json;
  sort_order: number;
  visible: boolean;
  updated_at: string;
}

export interface SavedViewRow {
  id: string;
  wedding_id: string;
  user_id: string;
  name: string;
  filters: Json;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export interface HouseholdView {
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

export interface HouseholdRsvpView {
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

export interface WeddingStatsView {
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

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
type Timestamps = "created_at" | "updated_at";

export interface Database {
  public: {
    Tables: {
      weddings: Table<WeddingRow, "id" | Timestamps>;
      collaborators: Table<CollaboratorRow, "id" | "created_at">;
      events: Table<EventRow, "id" | Timestamps>;
      households: Table<HouseholdRow, "id" | Timestamps>;
      guests: Table<GuestRow, "id" | Timestamps>;
      tags: Table<TagRow, "id" | "created_at">;
      guest_tags: Table<GuestTagRow, "created_at">;
      invitations: Table<InvitationRow, "id" | Timestamps>;
      invitation_events: Table<InvitationEventRow, never>;
      rsvps: Table<RsvpRow, "id" | Timestamps>;
      rsvp_questions: Table<RsvpQuestionRow, "id" | Timestamps>;
      rsvp_answers: Table<RsvpAnswerRow, "id" | "answered_at">;
      message_log: Table<MessageLogRow, "id" | "created_at">;
      site_content: Table<SiteContentRow, "id" | "updated_at">;
      saved_views: Table<SavedViewRow, "id" | "created_at">;
    };
    Views: {
      v_households: View<HouseholdView>;
      v_household_rsvp: View<HouseholdRsvpView>;
      v_wedding_stats: View<WeddingStatsView>;
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
    };
    CompositeTypes: Record<string, never>;
  };
}
