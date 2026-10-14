-- ===========================================================================
-- 0036: the seating plan (spec 33)
-- ===========================================================================
-- Six tables and two functions, all of spec 33 §5 in one file so the build
-- steps that use them don't each need a migration:
--
--   seating_plans      one per event: the room's size, the venue image, and
--                      the date guests may see their table
--   seating_tables     tables, with an optional position in the room
--   seating_fixtures   dance floor, bar, band... — things in the room nobody sits at
--   seat_assignments   a guest at a table (and optionally a chair), per event
--   seating_rules      keep together / apart / near, not at this table,
--                      needs an accessible table
--   seating_snapshots  a named copy of an event's layout
--
--   take_seating_snapshot()     writes one
--   restore_seating_snapshot()  puts one back, in a single transaction
--
-- THE RULES THAT LIVE IN THE SCHEMA, so no action has to remember them:
--   * one place per guest per event       (seat_assignments primary key)
--   * one guest per chair                 (partial unique index)
--   * a guest's table belongs to the SAME event as the assignment
--                                         (three-column foreign key)
--   * a rule names exactly the people / table its kind needs (a check)
--
-- WHAT IS NOT A CONSTRAINT: `seat_index < capacity` (a cross-table check a
-- trigger would have to do). shrinkSeatingTable clears out-of-range chairs in
-- the same request and the warnings flag any that slip through. And whether a
-- seated guest is still invited / still coming — that changes as RSVPs land,
-- and spec 33 §B.2 makes it a warning, never a silent removal.
--
-- DELETES. Tables, fixtures, rules and snapshots are planner layout data and
-- are hard-deleted (the audit log keeps what was where). Guests are never
-- touched: an assignment for a soft-deleted guest stays, and every read joins
-- through `guests.deleted_at is null`.
-- ===========================================================================

create type public.seating_table_shape as enum ('round', 'long', 'square', 'head');

create type public.seating_fixture_kind as enum (
  'dance_floor', 'bar', 'band', 'dj', 'stage', 'cake', 'gifts', 'entrance',
  'photo_booth', 'buffet', 'other'
);

create type public.seating_rule_kind as enum (
  'together', 'apart', 'near', 'avoid_table', 'accessible'
);

-- ---------------------------------------------------------------------------
-- seating_plans — one per event, created the first time anything needs it
-- ---------------------------------------------------------------------------
create table public.seating_plans (
  wedding_id        uuid not null,
  event_id          uuid not null,
  -- The room in centimetres. A generic 20 m × 15 m marquee until the planner
  -- types the real size or calibrates against the venue image.
  room_width_cm     integer not null default 2000 check (room_width_cm between 300 and 20000),
  room_depth_cm     integer not null default 1500 check (room_depth_cm between 300 and 20000),
  -- An object in the private bucket, `seating/<wedding>/<event>/<uuid>.<ext>`.
  background_path   text,
  background_w_px   integer check (background_w_px > 0),
  background_h_px   integer check (background_h_px > 0),
  calibrated        boolean not null default false,
  -- Spec 33 Part F. Null = guests are never shown their table.
  reveal_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  check ((background_path is null) = (background_w_px is null)
     and (background_path is null) = (background_h_px is null))
);
create index seating_plans_wedding_idx on public.seating_plans (wedding_id);
create trigger seating_plans_touch before update on public.seating_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- seating_tables
-- ---------------------------------------------------------------------------
create table public.seating_tables (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null,
  event_id        uuid not null,
  label           text not null check (label <> '' and length(label) <= 60),
  shape           public.seating_table_shape not null default 'round',
  capacity        integer not null check (capacity between 1 and 60),
  -- Chairs taken by people who are not guest records: the couple if they are
  -- not entered as guests, the celebrant, a supplier's meal.
  reserved_seats  integer not null default 0 check (reserved_seats >= 0),
  reserved_note   text,
  -- Long tables only: a chair at each end as well as along both sides.
  ends_seated     boolean not null default false,
  -- What the `accessible` rule checks.
  accessible      boolean not null default false,
  sort_order      integer not null default 0,
  notes           text,
  -- Centre of the table in room centimetres. Null = not placed in the room yet.
  pos_x_cm        integer,
  pos_y_cm        integer,
  rotation_deg    integer not null default 0 check (rotation_deg between 0 and 359),
  -- Physical size. Null = derived from shape and capacity (src/lib/seating/geometry.ts).
  width_cm        integer check (width_cm between 40 and 2000),
  length_cm       integer check (length_cm between 40 and 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, wedding_id),
  -- The target of seat_assignments' three-column foreign key.
  unique (id, event_id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  check (reserved_seats <= capacity),
  check ((pos_x_cm is null) = (pos_y_cm is null))
);
create index seating_tables_event_idx on public.seating_tables (wedding_id, event_id, sort_order);
create trigger seating_tables_touch before update on public.seating_tables
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- seating_fixtures
-- ---------------------------------------------------------------------------
create table public.seating_fixtures (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  event_id      uuid not null,
  kind          public.seating_fixture_kind not null,
  -- Null = the kind's own name ("Dance floor").
  label         text check (label is null or (label <> '' and length(label) <= 60)),
  pos_x_cm      integer not null,
  pos_y_cm      integer not null,
  width_cm      integer not null check (width_cm between 20 and 5000),
  depth_cm      integer not null check (depth_cm between 20 and 5000),
  rotation_deg  integer not null default 0 check (rotation_deg between 0 and 359),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
create index seating_fixtures_event_idx on public.seating_fixtures (wedding_id, event_id);
create trigger seating_fixtures_touch before update on public.seating_fixtures
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- seat_assignments
-- ---------------------------------------------------------------------------
create table public.seat_assignments (
  wedding_id  uuid not null,
  event_id    uuid not null,
  guest_id    uuid not null,
  table_id    uuid not null,
  -- Null = at this table, chair not chosen. 0-based, clockwise from the top.
  seat_index  integer check (seat_index >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Nobody sits in two places at one event.
  primary key (guest_id, event_id),
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  -- The table must belong to THIS event: a reception assignment can't point
  -- at a ceremony table, whatever the action forgets to check.
  foreign key (table_id, event_id, wedding_id)
    references public.seating_tables (id, event_id, wedding_id) on delete cascade
);
create index seat_assignments_table_idx on public.seat_assignments (table_id);
create index seat_assignments_event_idx on public.seat_assignments (wedding_id, event_id);
-- Nobody shares a chair.
create unique index seat_assignments_chair_uq
  on public.seat_assignments (table_id, seat_index) where seat_index is not null;
create trigger seat_assignments_touch before update on public.seat_assignments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- seating_rules
-- ---------------------------------------------------------------------------
-- Pair rules and `accessible` are wedding-wide ("keep Rose away from Bill" is
-- as true at the brunch as at the dinner). `avoid_table` is event-specific by
-- being tied to a table, and goes when the table does.
create table public.seating_rules (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  kind        public.seating_rule_kind not null,
  guest_a     uuid not null,
  guest_b     uuid,
  table_id    uuid,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (guest_a, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (guest_b, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (table_id, wedding_id)
    references public.seating_tables (id, wedding_id) on delete cascade,
  -- Each kind names exactly what it needs. Pairs are stored once, smaller
  -- uuid first, whichever order they were entered in.
  check (case kind
    when 'avoid_table' then guest_b is null and table_id is not null
    when 'accessible'  then guest_b is null and table_id is null
    else guest_b is not null and table_id is null and guest_a < guest_b
  end)
);
create unique index seating_rules_pair_uq
  on public.seating_rules (kind, guest_a, guest_b) where guest_b is not null;
create unique index seating_rules_table_uq
  on public.seating_rules (guest_a, table_id) where table_id is not null;
create unique index seating_rules_accessible_uq
  on public.seating_rules (guest_a) where kind = 'accessible';
create index seating_rules_wedding_idx on public.seating_rules (wedding_id);
create trigger seating_rules_touch before update on public.seating_rules
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- seating_snapshots
-- ---------------------------------------------------------------------------
-- NOT audited (see supabase/tests/18_audit_log.sql's exception list): a
-- snapshot is itself a record of a layout, and auditing one would copy the
-- whole payload into audit_log. Restoring one IS audited — it is ordinary
-- deletes and inserts on the audited tables.
create table public.seating_snapshots (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  event_id    uuid not null,
  name        text not null check (name <> '' and length(name) <= 120),
  -- "Before restoring …", written by restore_seating_snapshot itself.
  automatic   boolean not null default false,
  created_by  uuid,
  payload     jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
create index seating_snapshots_event_idx on public.seating_snapshots (wedding_id, event_id, created_at desc);

-- ---------------------------------------------------------------------------
-- take_seating_snapshot(event, name, automatic) → snapshot id
-- ---------------------------------------------------------------------------
-- The payload is whole rows (to_jsonb), so a column a later migration adds is
-- carried without touching this function. Pair and `accessible` rules are NOT
-- included: they are facts about people, not about a layout (spec 33 Q9).
-- `avoid_table` rules are, because they belong to a table and a restore
-- re-creates the table.
--
-- SECURITY INVOKER: it reads and writes under the caller's RLS, exactly as
-- the app would, so a stranger gets an empty plan and a refused insert.
-- `p_created_by` is passed by the app (as vendor_notes.author_id is) rather
-- than read from auth.uid() here, which an invoker-rights function can only
-- call where the role has usage on the auth schema.
create or replace function public.take_seating_snapshot(
  p_event_id uuid,
  p_name text,
  p_automatic boolean default false,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_id uuid;
begin
  select e.wedding_id into v_wedding from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  insert into public.seating_snapshots (wedding_id, event_id, name, automatic, created_by, payload)
  values (
    v_wedding, p_event_id, p_name, p_automatic, p_created_by,
    jsonb_build_object(
      'version', 1,
      'plan', (select jsonb_build_object('room_width_cm', p.room_width_cm,
                                         'room_depth_cm', p.room_depth_cm)
                 from public.seating_plans p where p.event_id = p_event_id),
      'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.label)
                            from public.seating_tables t where t.event_id = p_event_id), '[]'::jsonb),
      'fixtures', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at)
                              from public.seating_fixtures f where f.event_id = p_event_id), '[]'::jsonb),
      'assignments', coalesce((select jsonb_agg(to_jsonb(a))
                                 from public.seat_assignments a where a.event_id = p_event_id), '[]'::jsonb),
      'avoid_rules', coalesce((select jsonb_agg(to_jsonb(r))
                                 from public.seating_rules r
                                 join public.seating_tables t on t.id = r.table_id
                                where t.event_id = p_event_id), '[]'::jsonb)
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- restore_seating_snapshot(snapshot) → counts
-- ---------------------------------------------------------------------------
-- One transaction (a half-restored plan is the failure worth a function):
--   1. snapshot the current layout as `Before restoring "<name>"`
--   2. delete the event's tables and fixtures (assignments and avoid_table
--      rules cascade)
--   3. re-insert tables and fixtures with their ORIGINAL ids
--   4. re-insert assignments, skipping guests that no longer exist or are
--      soft-deleted; re-insert avoid_table rules the same way
--   5. put the room size back (never the image or the reveal date)
-- A guest who is no longer invited is restored anyway; the warnings say so.
create or replace function public.restore_seating_snapshot(
  p_snapshot_id uuid,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  s public.seating_snapshots;
  v_tables int;
  v_fixtures int;
  v_seated int;
  v_total int;
begin
  select * into s from public.seating_snapshots where id = p_snapshot_id;
  if s.id is null then
    raise exception 'snapshot not found' using errcode = 'P0002';
  end if;
  if (s.payload->>'version')::int is distinct from 1 then
    raise exception 'unsupported snapshot version %', s.payload->>'version';
  end if;

  perform public.take_seating_snapshot(
    s.event_id, left(format('Before restoring "%s"', s.name), 120), true, p_created_by);

  delete from public.seating_tables where event_id = s.event_id;
  delete from public.seating_fixtures where event_id = s.event_id;

  insert into public.seating_tables
    (id, wedding_id, event_id, label, shape, capacity, reserved_seats, reserved_note,
     ends_seated, accessible, sort_order, notes, pos_x_cm, pos_y_cm, rotation_deg,
     width_cm, length_cm)
  select t.id, s.wedding_id, s.event_id, t.label, t.shape, t.capacity,
         coalesce(t.reserved_seats, 0), t.reserved_note, coalesce(t.ends_seated, false),
         coalesce(t.accessible, false), coalesce(t.sort_order, 0), t.notes,
         t.pos_x_cm, t.pos_y_cm, coalesce(t.rotation_deg, 0), t.width_cm, t.length_cm
    from jsonb_populate_recordset(null::public.seating_tables, s.payload->'tables') t;
  get diagnostics v_tables = row_count;

  insert into public.seating_fixtures
    (id, wedding_id, event_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm, rotation_deg)
  select f.id, s.wedding_id, s.event_id, f.kind, f.label, f.pos_x_cm, f.pos_y_cm,
         f.width_cm, f.depth_cm, coalesce(f.rotation_deg, 0)
    from jsonb_populate_recordset(null::public.seating_fixtures, s.payload->'fixtures') f;
  get diagnostics v_fixtures = row_count;

  insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index)
  select s.wedding_id, s.event_id, a.guest_id, a.table_id, a.seat_index
    from jsonb_populate_recordset(null::public.seat_assignments, s.payload->'assignments') a
    join public.guests g on g.id = a.guest_id and g.wedding_id = s.wedding_id
   where g.deleted_at is null;
  get diagnostics v_seated = row_count;

  insert into public.seating_rules (id, wedding_id, kind, guest_a, table_id, note)
  select r.id, s.wedding_id, 'avoid_table', r.guest_a, r.table_id, r.note
    from jsonb_populate_recordset(null::public.seating_rules, s.payload->'avoid_rules') r
    join public.guests g on g.id = r.guest_a and g.wedding_id = s.wedding_id
   where g.deleted_at is null
  on conflict do nothing;

  if s.payload->'plan' is not null and jsonb_typeof(s.payload->'plan') = 'object' then
    insert into public.seating_plans (wedding_id, event_id, room_width_cm, room_depth_cm)
    values (s.wedding_id, s.event_id,
            (s.payload->'plan'->>'room_width_cm')::int,
            (s.payload->'plan'->>'room_depth_cm')::int)
    on conflict (event_id) do update
      set room_width_cm = excluded.room_width_cm,
          room_depth_cm = excluded.room_depth_cm;
  end if;

  v_total := jsonb_array_length(coalesce(s.payload->'assignments', '[]'::jsonb));
  return jsonb_build_object(
    'tables', v_tables,
    'fixtures', v_fixtures,
    'seated', v_seated,
    'skipped', v_total - v_seated
  );
end;
$$;

revoke all on function public.take_seating_snapshot(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.take_seating_snapshot(uuid, text, boolean, uuid) to authenticated;
revoke all on function public.restore_seating_snapshot(uuid, uuid) from public, anon;
grant execute on function public.restore_seating_snapshot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — all six join the tenant set
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'seating_plans', 'seating_tables', 'seating_fixtures',
    'seat_assignments', 'seating_rules', 'seating_snapshots'
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
-- Audit (spec 32) — every table but the snapshots
-- ---------------------------------------------------------------------------
create trigger audit_row after insert or update or delete on public.seating_plans
  for each row execute function public.audit_row('event_id', '', '');
create trigger audit_row after insert or update or delete on public.seating_tables
  for each row execute function public.audit_row('id', '', 'label');
create trigger audit_row after insert or update or delete on public.seating_fixtures
  for each row execute function public.audit_row('id', '', 'label');
create trigger audit_row after insert or update or delete on public.seat_assignments
  for each row execute function public.audit_row('guest_id,event_id', '', '');
create trigger audit_row after insert or update or delete on public.seating_rules
  for each row execute function public.audit_row('id', '', '');
