-- ===========================================================================
-- V1 core schema: guest list and RSVP
-- ===========================================================================
-- Tenancy pattern used throughout this file
-- ---------------------------------------------------------------------------
-- Every tenant table carries `wedding_id`, and every parent table carries a
-- redundant `unique (id, wedding_id)`. Child tables then reference the parent
-- through a COMPOSITE foreign key on (parent_id, wedding_id) rather than on
-- (parent_id) alone.
--
-- The effect: it is structurally impossible to attach a guest in wedding A to
-- a household in wedding B. Tenancy is enforced by the foreign key itself, so
-- there are no triggers to forget and no application code to trust, and every
-- RLS policy reads one local column instead of walking a join.
--
-- Requires PostgreSQL 15+ (column-list ON DELETE SET NULL).
-- ===========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid, digest
create extension if not exists pg_trgm;    -- fuzzy-name dedupe on CSV import

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type collaborator_role as enum ('owner', 'partner');
create type age_band          as enum ('adult', 'child', 'infant');
create type guest_side        as enum ('partner_a', 'partner_b', 'both', 'other');
create type rsvp_status       as enum ('pending', 'yes', 'no', 'maybe');
create type invite_channel    as enum ('email', 'whatsapp', 'post', 'hand');
create type question_type     as enum ('short_text', 'long_text', 'boolean',
                                       'single_select', 'multi_select', 'number');
create type question_scope    as enum ('guest', 'household');
create type message_kind      as enum ('invitation', 'reminder', 'update', 'test');
create type message_status    as enum ('queued', 'sent', 'failed', 'skipped');
create type household_tier    as enum ('A', 'B', 'C');

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- weddings
-- ---------------------------------------------------------------------------
-- cut_rank    A/B boundary: the rank of the LAST household above the line.
-- tier_b_rank B/C boundary, same convention. Null means "everything below the
--             cut line is tier B" — a single waitlist rather than two.
create table public.weddings (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  wedding_date    date,
  timezone        text not null default 'Europe/London',
  base_currency   char(3) not null default 'GBP',
  capacity        integer check (capacity is null or capacity > 0),
  -- COLLATE "C" is not decoration. Fractional ranks are compared in two
  -- places: here, and in JavaScript on the ranking screen. JavaScript
  -- compares UTF-16 code units, so 'B' < 'a'. A Supabase project defaults to
  -- en_US.UTF-8, where collation is alphabetical-then-case and 'a' < 'B' —
  -- the opposite. Left unpinned, the cut line would disagree with the order
  -- the user dragged, intermittently, only for ranks that straddle a case
  -- boundary. C collation is byte order, which is what the client does.
  cut_rank        text collate "C",
  tier_b_rank     text collate "C",
  rsvp_lock_at    timestamptz,
  invite_send_on  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id)
);
create trigger weddings_touch before update on public.weddings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- collaborators  (the two humans who can see everything)
-- ---------------------------------------------------------------------------
create table public.collaborators (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        collaborator_role not null default 'partner',
  created_at  timestamptz not null default now(),
  unique (wedding_id, user_id),
  unique (id, wedding_id)
);
create index collaborators_user_idx on public.collaborators (user_id);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  venue       text,
  address     text,
  is_public   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index events_wedding_idx on public.events (wedding_id, sort_order, starts_at);
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- households  (the invite unit)
-- ---------------------------------------------------------------------------
-- `rank` is a fractional index (base-62 midpoint string, see src/lib/rank.ts).
-- A drag writes exactly one cell, so two people reordering concurrently do not
-- fight over a block of integer positions.
create table public.households (
  id               uuid primary key default gen_random_uuid(),
  wedding_id       uuid not null references public.weddings (id) on delete cascade,
  display_name     text not null,
  address          text,
  rank             text collate "C" not null,
  reminders_muted  boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (id, wedding_id),
  check (rank <> '')
);
-- Ranks must be unique per wedding or ordering is non-deterministic. Partial,
-- so a soft-deleted household does not squat on a rank forever.
create unique index households_rank_key
  on public.households (wedding_id, rank) where deleted_at is null;
create index households_wedding_idx
  on public.households (wedding_id) where deleted_at is null;
create trigger households_touch before update on public.households
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- guests  (the headcount unit)
-- ---------------------------------------------------------------------------
create table public.guests (
  id              uuid not null default gen_random_uuid(),
  wedding_id      uuid not null,
  household_id    uuid not null,
  first_name      text not null,
  last_name       text,
  preferred_name  text,
  email           text,
  phone           text,
  age_band        age_band not null default 'adult',
  side            guest_side,
  dietary         text,
  accessibility   text,
  notes           text,
  is_plus_one     boolean not null default false,
  plus_one_for    uuid,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  primary key (id),
  unique (id, wedding_id),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade,
  foreign key (plus_one_for, wedding_id)
    references public.guests (id, wedding_id) on delete set null (plus_one_for),
  check (first_name <> ''),
  check (plus_one_for is null or plus_one_for <> id)
);
create index guests_household_idx on public.guests (household_id) where deleted_at is null;
create index guests_wedding_idx   on public.guests (wedding_id) where deleted_at is null;
-- Import dedupe: exact on email, fuzzy on name.
create index guests_email_idx on public.guests (wedding_id, lower(email))
  where email is not null and deleted_at is null;
create index guests_name_trgm_idx on public.guests
  using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '')) gin_trgm_ops);
create trigger guests_touch before update on public.guests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  colour      text not null default '#8a8580',
  created_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> '')
);
create unique index tags_name_key on public.tags (wedding_id, lower(name));

create table public.guest_tags (
  wedding_id  uuid not null,
  guest_id    uuid not null,
  tag_id      uuid not null,
  created_at  timestamptz not null default now(),
  primary key (guest_id, tag_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (tag_id, wedding_id)
    references public.tags (id, wedding_id) on delete cascade
);
create index guest_tags_tag_idx on public.guest_tags (tag_id);

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
-- The raw token exists only in the URL we hand out and in the send payload.
-- What is stored is sha256(token || pepper), so a database leak is not a
-- pile of live RSVP links. Lookup still works because the hash is
-- deterministic — see src/lib/tokens.ts.
create table public.invitations (
  id                 uuid primary key default gen_random_uuid(),
  wedding_id         uuid not null,
  household_id       uuid not null,
  token_hash         text not null,
  channel            invite_channel not null default 'email',
  sent_at            timestamptz,
  opened_at          timestamptz,
  first_response_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (id, wedding_id),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade
);
create unique index invitations_token_key on public.invitations (token_hash);
create unique index invitations_active_household_key
  on public.invitations (household_id) where deleted_at is null;
create trigger invitations_touch before update on public.invitations
  for each row execute function public.touch_updated_at();

-- Which events this invitation covers. A join table, not an array column:
-- "who is invited to the ceremony" is a constant query, and an array cannot
-- enforce referential integrity against a deleted event.
create table public.invitation_events (
  wedding_id     uuid not null,
  invitation_id  uuid not null,
  event_id       uuid not null,
  primary key (invitation_id, event_id),
  foreign key (invitation_id, wedding_id)
    references public.invitations (id, wedding_id) on delete cascade,
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
create index invitation_events_event_idx on public.invitation_events (event_id);

-- ---------------------------------------------------------------------------
-- rsvps
-- ---------------------------------------------------------------------------
create table public.rsvps (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  guest_id      uuid not null,
  event_id      uuid not null,
  status        rsvp_status not null default 'pending',
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (guest_id, event_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
create index rsvps_event_status_idx on public.rsvps (event_id, status);
create index rsvps_wedding_idx on public.rsvps (wedding_id, status);
create trigger rsvps_touch before update on public.rsvps
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- custom RSVP questions
-- ---------------------------------------------------------------------------
create table public.rsvp_questions (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  label       text not null,
  help_text   text,
  type        question_type not null default 'short_text',
  scope       question_scope not null default 'guest',
  required    boolean not null default false,
  options     jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (label <> ''),
  check (jsonb_typeof(options) = 'array')
);
create index rsvp_questions_wedding_idx
  on public.rsvp_questions (wedding_id, sort_order) where active;
create trigger rsvp_questions_touch before update on public.rsvp_questions
  for each row execute function public.touch_updated_at();

-- Answers are polymorphic over guest OR household: two nullable columns plus a
-- check that exactly one is set. No discriminator column to fall out of sync.
create table public.rsvp_answers (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  question_id   uuid not null,
  guest_id      uuid,
  household_id  uuid,
  value         jsonb,
  answered_at   timestamptz not null default now(),
  foreign key (question_id, wedding_id)
    references public.rsvp_questions (id, wedding_id) on delete cascade,
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade,
  check (num_nonnulls(guest_id, household_id) = 1)
);
create unique index rsvp_answers_guest_key
  on public.rsvp_answers (question_id, guest_id) where guest_id is not null;
create unique index rsvp_answers_household_key
  on public.rsvp_answers (question_id, household_id) where household_id is not null;

-- ---------------------------------------------------------------------------
-- message_log
-- ---------------------------------------------------------------------------
-- Reminders run on a cron, and a cron retries. Without a log keyed by a
-- dedupe_key, a retry double-sends and nobody can answer "did she get it".
create table public.message_log (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.weddings (id) on delete cascade,
  household_id  uuid,
  kind          message_kind not null,
  channel       invite_channel not null default 'email',
  to_address    text,
  dedupe_key    text not null,
  status        message_status not null default 'queued',
  provider_id   text,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete set null (household_id)
);
create unique index message_log_dedupe_key on public.message_log (wedding_id, dedupe_key);
create index message_log_household_idx on public.message_log (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- public site content
-- ---------------------------------------------------------------------------
create table public.site_content (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  block_key   text not null,
  payload     jsonb not null default '{}'::jsonb,
  sort_order  integer not null default 0,
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (wedding_id, block_key)
);
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- saved views  (per collaborator, on /guests)
-- ---------------------------------------------------------------------------
create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (wedding_id, user_id, name)
);

-- ---------------------------------------------------------------------------
-- rsvp_token_attempts
-- ---------------------------------------------------------------------------
-- DELIBERATE EXCEPTION to the wedding_id-everywhere rule. A failed token
-- lookup has no wedding to attribute itself to — that is the whole point of
-- the throttle. Infrastructure, not tenant data: no RLS policy, service role
-- only, pruned on a schedule.
create table public.rsvp_token_attempts (
  id            bigserial primary key,
  ip_hash       text not null,
  succeeded     boolean not null default false,
  attempted_at  timestamptz not null default now()
);
create index rsvp_token_attempts_ip_idx
  on public.rsvp_token_attempts (ip_hash, attempted_at desc);
