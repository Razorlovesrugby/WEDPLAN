-- ===========================================================================
-- 0017: getting there, somewhere to stay, site images (spec 14 §4, §7, §9)
-- ===========================================================================
-- Spec 14's remaining schema, shaped by Q2's answer: this is a LOCAL wedding
-- with a coach, not a destination one. Aisle's multi-hotel room blocks — rooms,
-- nights, nightly prices, holds, rooming lists — are deliberately absent, and
-- so are airports and flight times. §4 lists them by name as cut, so nobody
-- re-adds them by reflex.
--
-- What replaces them is smaller and carries a headcount: a coach with named
-- runs, ordered stops that each have their own pickup time, and seats a
-- household reserves from its own RSVP page. That reservation is not a
-- payment (Q4) — it is the thing that produces a manifest on the day.
--
-- Numbered 0017 rather than the 0016 §4 predicted: 0016 became the
-- save-the-date enum, which had to be its own file (55P04).
-- ===========================================================================

create type public.transport_kind as enum ('parking', 'taxi', 'train', 'walk', 'other');
create type public.coach_direction as enum ('to_venue', 'from_venue');
create type public.site_asset_kind as enum ('hero', 'gallery', 'story', 'party', 'stay');

-- ---------------------------------------------------------------------------
-- transport_options — parking, taxis, the train, anything else
-- ---------------------------------------------------------------------------
-- No cost and no duration columns. At this distance a guest wants a sentence
-- and a phone number; the comparison table a destination wedding needs would
-- be five empty columns here.
create table public.transport_options (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  kind        public.transport_kind not null default 'other',
  name        text not null,
  detail      text,
  url         text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> '')
);
create index transport_options_wedding_idx
  on public.transport_options (wedding_id, sort_order);
create trigger transport_options_touch before update on public.transport_options
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- coach_runs
-- ---------------------------------------------------------------------------
-- `capacity` is the number of seats on the vehicle. Null means "we have not
-- counted yet", which is different from zero and must not silently behave
-- like it: seats_taken is still reported, the page just cannot say
-- "34 of 49".
create table public.coach_runs (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  direction   public.coach_direction not null,
  label       text not null,
  departs_at  timestamptz,
  capacity    integer check (capacity is null or capacity > 0),
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (label <> '')
);
create index coach_runs_wedding_idx on public.coach_runs (wedding_id, sort_order, departs_at);
create trigger coach_runs_touch before update on public.coach_runs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- coach_stops
-- ---------------------------------------------------------------------------
create table public.coach_stops (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  coach_run_id  uuid not null,
  name          text not null,
  address       text,
  map_url       text,
  pickup_at     timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (coach_run_id, wedding_id)
    references public.coach_runs (id, wedding_id) on delete cascade,
  check (name <> '')
);
create index coach_stops_run_idx on public.coach_stops (coach_run_id, sort_order);
create trigger coach_stops_touch before update on public.coach_stops
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- coach_seats
-- ---------------------------------------------------------------------------
-- One row per household per run: a household travels together, which is what
-- Q1's household-token answer already committed to. `seats` is a count rather
-- than named guests for the same reason — naming them would need per-guest
-- identity the product deliberately does not have.
--
-- The stop is on this row, not derived, because a household boarding at The
-- Crown and one boarding at the station are on the same run and the driver
-- needs both lists.
create table public.coach_seats (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  coach_run_id  uuid not null,
  coach_stop_id uuid not null,
  household_id  uuid not null,
  seats         integer not null check (seats > 0 and seats <= 20),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  -- One reservation per household per run. A household changing its mind
  -- updates this row; it does not accumulate rows nobody reconciles.
  unique (coach_run_id, household_id),
  foreign key (coach_run_id, wedding_id)
    references public.coach_runs (id, wedding_id) on delete cascade,
  foreign key (coach_stop_id, wedding_id)
    references public.coach_stops (id, wedding_id) on delete cascade,
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade
);
create index coach_seats_run_idx on public.coach_seats (coach_run_id);
create index coach_seats_household_idx on public.coach_seats (household_id);
create trigger coach_seats_touch before update on public.coach_seats
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- accommodations — a list of links, not a booking system (Q2)
-- ---------------------------------------------------------------------------
-- No room types, no nightly prices, no blocks, no holds. If a block is
-- negotiated with one hotel later, `notes` carries the code and the deadline,
-- which is all a block is from the guest's side.
create table public.accommodations (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.weddings (id) on delete cascade,
  name           text not null,
  address        text,
  url            text,
  distance_label text,
  notes          text,
  image_id       uuid,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> '')
);
create index accommodations_wedding_idx on public.accommodations (wedding_id, sort_order);
create trigger accommodations_touch before update on public.accommodations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- site_assets (spec 14 §4, §9)
-- ---------------------------------------------------------------------------
-- Reuses spec 9's private-bucket discipline exactly: one bucket, no storage
-- policies in any migration (so verify-migrations.sh keeps working against a
-- bare cluster), and object paths DERIVED server-side from ids already
-- checked — never accepted from a client. A client that could name its own
-- path could name somebody else's.
--
-- `uploaded_by_household` null means the couple uploaded it; a value means a
-- guest did, from their own RSVP link. That column is what makes "remove this"
-- answerable for the household that posted it (§9).
--
-- `approved_at` null means waiting. Default moderation is 'review' (Q5), so
-- the public site filters on this being set.
create table public.site_assets (
  id                     uuid primary key default gen_random_uuid(),
  wedding_id             uuid not null references public.weddings (id) on delete cascade,
  kind                   public.site_asset_kind not null default 'gallery',
  storage_path           text not null,
  width                  integer,
  height                 integer,
  blurhash               text,
  alt                    text,
  credit                 text,
  uploaded_by_household  uuid,
  approved_at            timestamptz,
  sort_order             integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, wedding_id),
  unique (storage_path),
  foreign key (uploaded_by_household, wedding_id)
    references public.households (id, wedding_id) on delete set null (uploaded_by_household),
  check (storage_path <> '')
);
create index site_assets_wedding_idx
  on public.site_assets (wedding_id, kind, sort_order);
create index site_assets_pending_idx
  on public.site_assets (wedding_id, created_at) where approved_at is null;
create trigger site_assets_touch before update on public.site_assets
  for each row execute function public.touch_updated_at();

alter table public.accommodations
  add constraint accommodations_image_fk
  foreign key (image_id, wedding_id)
  references public.site_assets (id, wedding_id) on delete set null (image_id);

-- ---------------------------------------------------------------------------
-- site_visits (spec 14 §13)
-- ---------------------------------------------------------------------------
-- First-party and deliberately dull: a count per section per day, enough to
-- answer "is anyone reading the FAQ" and "did the shuttle update get seen".
-- No third party is introduced to a page full of guests' names (§11).
create table public.site_visits (
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  day         date not null,
  section     text not null,
  count       integer not null default 0,
  primary key (wedding_id, day, section)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'transport_options',
    'coach_runs',
    'coach_stops',
    'coach_seats',
    'accommodations',
    'site_assets',
    'site_visits'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated '
      'using (public.is_collaborator(wedding_id)) '
      'with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_coach_runs
-- ---------------------------------------------------------------------------
-- Seats taken per run, computed rather than cached, so the number on the page
-- and the number the capacity check reads can never disagree. A cached column
-- drifts the first time a reservation is deleted by a cascade.
--
-- Columns listed explicitly, not `r.*` — 0014's lesson: `*` expands at
-- definition time and `create or replace view` may only append, so a column
-- added to coach_runs later would land mid-list and refuse to replace.
create view public.v_coach_runs with (security_invoker = true) as
select
  r.id,
  r.wedding_id,
  r.direction,
  r.label,
  r.departs_at,
  r.capacity,
  r.notes,
  r.sort_order,
  coalesce(s.seats_taken, 0)::integer as seats_taken,
  case
    when r.capacity is null then null
    else greatest(r.capacity - coalesce(s.seats_taken, 0), 0)
  end::integer as seats_left
from public.coach_runs r
left join (
  select coach_run_id, sum(seats) as seats_taken
  from public.coach_seats
  group by coach_run_id
) s on s.coach_run_id = r.id;

comment on view public.v_coach_runs is
  'Coach runs with seats taken and left. Computed, never cached (spec 14 §7.1).';
