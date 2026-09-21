-- ===========================================================================
-- 0026_dress_codes_and_travel.sql — spec 25, Part A
--
-- Blocks that read the wedding instead of being a second place to type it.
--
-- Three changes, one idea: a fact a guest needs should live on the thing it
-- is a fact ABOUT, so the renderer can put it where the question is asked.
--
--   dress_codes        A named code ("Formal summer") with labelled guidance
--                      under it. An event points at one. Renders twice: a tag
--                      inside the event on the schedule, and a full entry in
--                      the attire block listing the events it covers.
--
--   coach_runs.event_id  Which event a shuttle serves. Null means "the whole
--                      weekend", which is how every existing run reads.
--
--   arrival_points +   An airport, and typed legs beneath it with a duration
--   four columns       and a cost range. 0017 deliberately left cost and
--                      duration out; see the note above that block for why
--                      this reopens it on its own terms rather than against
--                      them.
--
-- NO NEW ENUM, so this file needs no 55P04 split. `label` on a note and
-- `name` on a code are free text on purpose — a couple who wants "For the
-- wedding party" should not need a migration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- dress_codes
-- ---------------------------------------------------------------------------
-- `board_id` here is the code's own moodboard; a note can carry a different
-- one (the reference splits "for her" and "for him" onto separate boards).
-- Both are nullable and neither is required for a code to be useful.
create table public.dress_codes (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  board_id    uuid,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (board_id, wedding_id)
    references public.moodboards (id, wedding_id) on delete set null (board_id),
  check (name <> '')
);
create index dress_codes_wedding_idx on public.dress_codes (wedding_id, sort_order);
create trigger dress_codes_touch before update on public.dress_codes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- dress_code_notes
-- ---------------------------------------------------------------------------
-- The reference splits every code into FOR HER and FOR HIM. Two columns would
-- be the direct translation and would hardcode a gender binary into the schema
-- of a product whose guest list does not have one. A repeating labelled note
-- renders identically when the labels happen to be those two — which is what
-- the app pre-fills — and lets a couple write "For everyone" or "A note on the
-- cobblestones" instead. The default is content; the schema stays neutral.
create table public.dress_code_notes (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  dress_code_id uuid not null,
  label         text not null,
  body          text,
  board_id      uuid,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (dress_code_id, wedding_id)
    references public.dress_codes (id, wedding_id) on delete cascade,
  foreign key (board_id, wedding_id)
    references public.moodboards (id, wedding_id) on delete set null (board_id),
  check (label <> '')
);
create index dress_code_notes_code_idx
  on public.dress_code_notes (dress_code_id, sort_order);
create trigger dress_code_notes_touch before update on public.dress_code_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- events.dress_code_id
-- ---------------------------------------------------------------------------
-- `set null (dress_code_id)` rather than plain `set null`: the FK is composite,
-- and nulling `wedding_id` on an event because a dress code was deleted would
-- be a catastrophe rather than a cleanup. Same shape `moodboards.event_id`
-- already uses.
alter table public.events add column dress_code_id uuid;
alter table public.events add constraint events_dress_code_fk
  foreign key (dress_code_id, wedding_id)
  references public.dress_codes (id, wedding_id) on delete set null (dress_code_id);
create index events_dress_code_idx on public.events (dress_code_id)
  where dress_code_id is not null;

-- ---------------------------------------------------------------------------
-- coach_runs.event_id
-- ---------------------------------------------------------------------------
-- Nullable, and every existing run stays null. A run with no event keeps
-- rendering in the coach block exactly as it does today; a run WITH one also
-- renders under that event on the schedule. Nothing is moved, something is
-- added.
alter table public.coach_runs add column event_id uuid;
alter table public.coach_runs add constraint coach_runs_event_fk
  foreign key (event_id, wedding_id)
  references public.events (id, wedding_id) on delete set null (event_id);
create index coach_runs_event_idx on public.coach_runs (event_id)
  where event_id is not null;

-- v_coach_runs has to carry it, or the schedule cannot see which run serves
-- which event: the view lists its columns explicitly (0017's own note, taking
-- 0014's lesson about `r.*` expanding at definition time). `create or replace
-- view` may only APPEND, so `event_id` goes on the end rather than beside the
-- other coach_runs columns where it would read better.
create or replace view public.v_coach_runs with (security_invoker = true) as
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
  end::integer as seats_left,
  r.event_id
from public.coach_runs r
left join (
  select coach_run_id, sum(seats) as seats_taken
  from public.coach_seats
  group by coach_run_id
) s on s.coach_run_id = r.id;

-- ---------------------------------------------------------------------------
-- arrival_points
-- ---------------------------------------------------------------------------
-- `code` is the big display token (MXP) and is optional — not every arrival
-- point is an airport, and "the ferry terminal" has no three-letter code.
create table public.arrival_points (
  id               uuid primary key default gen_random_uuid(),
  wedding_id       uuid not null references public.weddings (id) on delete cascade,
  code             text,
  name             text not null,
  region           text,
  minutes_to_venue integer,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> ''),
  check (minutes_to_venue is null or minutes_to_venue >= 0)
);
create index arrival_points_wedding_idx on public.arrival_points (wedding_id, sort_order);
create trigger arrival_points_touch before update on public.arrival_points
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- transport_options — duration, cost, and an arrival point
-- ---------------------------------------------------------------------------
-- 0017 said, deliberately:
--
--   "No cost and no duration columns. At this distance a guest wants a
--    sentence and a phone number; the comparison table a destination wedding
--    needs would be five empty columns here."
--
-- That reasoning was SCOPED — to a wedding people drive to. A destination
-- wedding is the case it excluded, and it is the case that needs the table.
-- So every column here is nullable and the renderer draws only what is
-- filled: a wedding down the road still gets a sentence and a phone number,
-- with no empty columns anywhere near it.
--
-- Cost is integer minor units in NZD, per the platform money rule and spec 18.
-- No floats, and no currency column — there is one currency.
alter table public.transport_options
  add column arrival_point_id uuid,
  add column duration_minutes integer,
  add column cost_low integer,
  add column cost_high integer;

alter table public.transport_options
  add constraint transport_options_arrival_fk
    foreign key (arrival_point_id, wedding_id)
    references public.arrival_points (id, wedding_id) on delete set null (arrival_point_id),
  add constraint transport_options_duration_ck
    check (duration_minutes is null or duration_minutes >= 0),
  add constraint transport_options_cost_ck
    check (
      (cost_low is null or cost_low >= 0)
      and (cost_high is null or cost_high >= 0)
      and (cost_low is null or cost_high is null or cost_high >= cost_low)
    );

create index transport_options_arrival_idx on public.transport_options (arrival_point_id)
  where arrival_point_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: the dress codes that are already being typed
-- ---------------------------------------------------------------------------
-- Per-event dress code ALREADY EXISTS — as a free string inside the schedule
-- block's own payload (`payload -> 'events' -> n ->> 'dress_code'`), with no
-- relationship to the dress_code block rendering prose on the same subject.
-- This lifts those strings into rows.
--
-- Two things worth knowing:
--
-- 1. The payload is JSONB written by an earlier version of the app and is
--    therefore untrusted. `(e ->> 'id')::uuid` on a malformed entry would
--    abort the whole migration, and a WHERE guard is not enough because
--    nothing orders the cast after the filter. The CASE below short-circuits,
--    which is the only construct that guarantees it.
--
-- 2. "Formal summer" and "formal Summer" become TWO rows, on purpose. Merging
--    them is a judgement about what somebody meant, and a migration is the
--    worst possible place to make one. The planner merges them in an
--    afternoon; a migration that guessed wrong is permanent.
--
-- Draft blocks only (`site_blocks`), not revisions: a published revision is a
-- historical snapshot and rewriting what guests saw in March is not this
-- migration's business. The old payload field is left exactly where it is, so
-- a rollback still renders.
with entries as (
  select
    b.wedding_id,
    case
      when (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (e ->> 'id')::uuid
    end as event_id,
    btrim(e ->> 'dress_code') as name
  from public.site_blocks b
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(b.payload -> 'events') = 'array'
         then b.payload -> 'events'
         else '[]'::jsonb end
  ) e
  where b.type = 'schedule'
),
usable as (
  select wedding_id, event_id, name
  from entries
  where event_id is not null and name is not null and name <> ''
),
created as (
  insert into public.dress_codes (wedding_id, name, sort_order)
  select wedding_id, name, (row_number() over (partition by wedding_id order by name)) * 10
  from (select distinct wedding_id, name from usable) d
  returning id, wedding_id, name
)
update public.events ev
set dress_code_id = created.id
from usable
join created
  on created.wedding_id = usable.wedding_id and created.name = usable.name
where ev.id = usable.event_id
  and ev.wedding_id = usable.wedding_id
  and ev.dress_code_id is null;

-- A backfilled code has a name and no guidance — the old payload carried only
-- the label. The attire block renders a code with no notes as its name and the
-- events it covers, which is still more than existed before, and the planner
-- fills in the rest. New codes created through the app are pre-filled with
-- "For her" and "For him" (spec 25 Answered, question 1); that is an
-- application default, not a database one.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- 0002's rule: a tenant table without a policy is readable by anyone with a
-- session. The public read path reaches these through the service role, which
-- bypasses RLS and scopes itself by wedding — the same arrangement every other
-- public surface already uses.
do $$
declare
  t text;
begin
  foreach t in array array['dress_codes', 'dress_code_notes', 'arrival_points'] loop
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
