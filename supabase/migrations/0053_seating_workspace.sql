-- 0053_seating_workspace.sql  (spec 53; it called this 0052, but spec 52 took that number)
--
-- Undo and version history (Part C), considerations (Part F), and the
-- day-of tables (Part I).
--
--   seating_state(event)            the plan as one jsonb: the shape a snapshot holds
--   restore_seating_state(...)      puts a state back, refusing if the plan has
--                                   changed since the state the caller expects
--   take_seating_snapshot()         replaced in full: built on seating_state(),
--                                   and keeps only the newest 30 automatic ones
--   restore_seating_snapshot()      replaced in full: built on restore_seating_state()
--
-- Not edited: 0036.

-- ---------------------------------------------------------------------------
-- 1. Guests: highchair and wheelchair (Part F)
-- ---------------------------------------------------------------------------
alter table public.guests
  add column needs_highchair  boolean not null default false,
  add column uses_wheelchair  boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Blocked chairs and check-ins (Part I)
-- ---------------------------------------------------------------------------
create table public.seating_chairs_blocked (
  wedding_id  uuid not null,
  event_id    uuid not null,
  table_id    uuid not null,
  seat_index  integer not null check (seat_index >= 0),
  created_at  timestamptz not null default now(),
  primary key (table_id, seat_index),
  foreign key (table_id, event_id, wedding_id)
    references public.seating_tables (id, event_id, wedding_id) on delete cascade
);
create index seating_chairs_blocked_event_idx on public.seating_chairs_blocked (wedding_id, event_id);

create table public.seating_checkins (
  wedding_id  uuid not null,
  event_id    uuid not null,
  guest_id    uuid not null,
  arrived_at  timestamptz not null default now(),
  -- The day link's label ("Venue staff"), or "The couple".
  by_label    text not null check (char_length(by_label) between 1 and 120),
  primary key (event_id, guest_id),
  foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  foreign key (event_id, wedding_id) references public.events (id, wedding_id) on delete cascade
);

do $$
declare
  t text;
begin
  foreach t in array array['seating_chairs_blocked', 'seating_checkins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_collaborator(wedding_id)) with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('insert into public.planner_table_access (table_name, access, note) values (%L, %L, null)', t, 'write');
    execute format('create policy %I on public.%I for select to authenticated using (public.can_plan(wedding_id))', t || '_planner_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_plan(wedding_id))', t || '_planner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id))', t || '_planner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_plan(wedding_id))', t || '_planner_delete', t);
  end loop;
end;
$$;

create trigger audit_row after insert or update or delete on public.seating_chairs_blocked
  for each row execute function public.audit_row('table_id,seat_index', '', '');
create trigger audit_row after insert or update or delete on public.seating_checkins
  for each row execute function public.audit_row('guest_id,event_id', '', 'by_label');

-- ---------------------------------------------------------------------------
-- 3. The plan as one jsonb
-- ---------------------------------------------------------------------------
-- The same shape a snapshot's payload has (version 1), with `blocked` added
-- (older snapshots lack it and restore as "none blocked"). Timestamps are left
-- out and every list has an explicit order, so the same plan always gives the
-- same text, and the same md5.
create or replace function public.seating_state(p_event_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'version', 1,
    'plan', (select jsonb_build_object('room_width_cm', p.room_width_cm, 'room_depth_cm', p.room_depth_cm)
               from public.seating_plans p where p.event_id = p_event_id),
    'tables', coalesce((select jsonb_agg(to_jsonb(t) - 'created_at' - 'updated_at' order by t.sort_order, t.label, t.id)
                          from public.seating_tables t where t.event_id = p_event_id), '[]'::jsonb),
    'fixtures', coalesce((select jsonb_agg(to_jsonb(f) - 'created_at' - 'updated_at' order by f.id)
                            from public.seating_fixtures f where f.event_id = p_event_id), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' order by a.guest_id)
                               from public.seat_assignments a where a.event_id = p_event_id), '[]'::jsonb),
    'avoid_rules', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' order by r.id)
                               from public.seating_rules r
                               join public.seating_tables t on t.id = r.table_id
                              where t.event_id = p_event_id), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(to_jsonb(b) - 'created_at' order by b.table_id, b.seat_index)
                           from public.seating_chairs_blocked b where b.event_id = p_event_id), '[]'::jsonb)
  );
$$;
revoke all on function public.seating_state(uuid) from public, anon;
grant execute on function public.seating_state(uuid) to authenticated;

create or replace function public.seating_state_hash(p_event_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select md5(public.seating_state(p_event_id)::text);
$$;
revoke all on function public.seating_state_hash(uuid) from public, anon;
grant execute on function public.seating_state_hash(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Putting a state back
-- ---------------------------------------------------------------------------
-- Replaces the event's tables, fixtures, chairs, avoid-table rules, blocked
-- chairs and room size with `p_payload`, in this transaction. When
-- `p_expected_hash` is given and the plan no longer hashes to it, somebody
-- changed the plan since: nothing is touched and the call fails with SQLSTATE
-- 40001, which the app shows as "changed since, not undone".
create or replace function public.restore_seating_state(
  p_event_id uuid,
  p_payload jsonb,
  p_expected_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_tables int;
  v_fixtures int;
  v_seated int;
  v_total int;
begin
  select e.wedding_id into v_wedding from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or (p_payload->>'version')::int is distinct from 1 then
    raise exception 'unsupported seating state';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  if p_expected_hash is not null and public.seating_state_hash(p_event_id) <> p_expected_hash then
    raise exception 'the seating plan changed' using errcode = '40001';
  end if;

  delete from public.seating_tables where event_id = p_event_id;   -- cascades chairs, blocked, rules
  delete from public.seating_fixtures where event_id = p_event_id;

  insert into public.seating_tables
    (id, wedding_id, event_id, label, shape, capacity, reserved_seats, reserved_note,
     ends_seated, accessible, sort_order, notes, pos_x_cm, pos_y_cm, rotation_deg,
     width_cm, length_cm)
  select t.id, v_wedding, p_event_id, t.label, t.shape, t.capacity,
         coalesce(t.reserved_seats, 0), t.reserved_note, coalesce(t.ends_seated, false),
         coalesce(t.accessible, false), coalesce(t.sort_order, 0), t.notes,
         t.pos_x_cm, t.pos_y_cm, coalesce(t.rotation_deg, 0), t.width_cm, t.length_cm
    from jsonb_populate_recordset(null::public.seating_tables, p_payload->'tables') t;
  get diagnostics v_tables = row_count;

  insert into public.seating_fixtures
    (id, wedding_id, event_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm, rotation_deg)
  select f.id, v_wedding, p_event_id, f.kind, f.label, f.pos_x_cm, f.pos_y_cm,
         f.width_cm, f.depth_cm, coalesce(f.rotation_deg, 0)
    from jsonb_populate_recordset(null::public.seating_fixtures, p_payload->'fixtures') f;
  get diagnostics v_fixtures = row_count;

  insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index)
  select v_wedding, p_event_id, a.guest_id, a.table_id, a.seat_index
    from jsonb_populate_recordset(null::public.seat_assignments, p_payload->'assignments') a
    join public.guests g on g.id = a.guest_id and g.wedding_id = v_wedding
   where g.deleted_at is null;
  get diagnostics v_seated = row_count;

  insert into public.seating_rules (id, wedding_id, kind, guest_a, table_id, note)
  select r.id, v_wedding, 'avoid_table', r.guest_a, r.table_id, r.note
    from jsonb_populate_recordset(null::public.seating_rules, p_payload->'avoid_rules') r
    join public.guests g on g.id = r.guest_a and g.wedding_id = v_wedding
   where g.deleted_at is null
  on conflict do nothing;

  insert into public.seating_chairs_blocked (wedding_id, event_id, table_id, seat_index)
  select v_wedding, p_event_id, b.table_id, b.seat_index
    from jsonb_populate_recordset(null::public.seating_chairs_blocked, coalesce(p_payload->'blocked', '[]'::jsonb)) b
  on conflict do nothing;

  if p_payload->'plan' is not null and jsonb_typeof(p_payload->'plan') = 'object' then
    insert into public.seating_plans (wedding_id, event_id, room_width_cm, room_depth_cm)
    values (v_wedding, p_event_id,
            (p_payload->'plan'->>'room_width_cm')::int,
            (p_payload->'plan'->>'room_depth_cm')::int)
    on conflict (event_id) do update
      set room_width_cm = excluded.room_width_cm,
          room_depth_cm = excluded.room_depth_cm;
  end if;

  v_total := jsonb_array_length(coalesce(p_payload->'assignments', '[]'::jsonb));
  return jsonb_build_object(
    'tables', v_tables, 'fixtures', v_fixtures, 'seated', v_seated, 'skipped', v_total - v_seated,
    'hash', public.seating_state_hash(p_event_id));
end;
$$;
revoke all on function public.restore_seating_state(uuid, jsonb, text) from public, anon;
grant execute on function public.restore_seating_state(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Snapshots, rebuilt on the state functions
-- ---------------------------------------------------------------------------
-- Same signature and result as 0036's. New: the payload is seating_state(), and
-- taking an automatic snapshot deletes the automatic ones beyond the newest 30
-- for that event (named ones are kept until deleted).
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
  values (v_wedding, p_event_id, p_name, p_automatic, p_created_by, public.seating_state(p_event_id))
  returning id into v_id;

  if p_automatic then
    delete from public.seating_snapshots s
     where s.event_id = p_event_id
       and s.automatic
       and s.id not in (
         select k.id from public.seating_snapshots k
          where k.event_id = p_event_id and k.automatic
          order by k.created_at desc, k.id desc
          limit 30);
  end if;
  return v_id;
end;
$$;

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
  v_result jsonb;
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

  v_result := public.restore_seating_state(s.event_id, s.payload, null);
  return v_result - 'hash';
end;
$$;
