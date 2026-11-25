-- 0059_seating_drafts.sql  (spec 57 Part G)
--
-- Layouts can now have drafts. An event's live layout is the one guests,
-- day links and the master read; a draft is an alternative the couple is
-- trying, edited exactly like the live one, with its own seating.
--
--   * a guest holds one seat per LAYOUT (the primary key becomes
--     (guest_id, layout_id)); the old (guest_id, event_id) key goes;
--   * the room is now authoritative on the space: the trigger that copied
--     seating_plans' room columns to the first space is dropped (the plan's
--     own room columns stay, unused, until a later migration drops them
--     after live is checked);
--   * seating_state / hash / restore / snapshots take a layout, and
--     History is per layout;
--   * seating_try_layout() copies a layout into a draft, and
--     seating_make_live() swaps a draft in, in one transaction;
--   * v_live_seat_assignments / v_live_seating_tables are what everything
--     outside the designer reads, so a draft can never reach a guest.
--
-- Not edited: 0036, 0053, 0056, 0057.

-- ---------------------------------------------------------------------------
-- 1. One seat per guest per layout
-- ---------------------------------------------------------------------------
alter table public.seat_assignments drop constraint seat_assignments_pkey;
alter table public.seat_assignments add constraint seat_assignments_pkey primary key (guest_id, layout_id);
drop index public.seat_assignments_layout_guest_uq;

-- ---------------------------------------------------------------------------
-- 2. The room lives on the space; a plan still always has a layout
-- ---------------------------------------------------------------------------
drop trigger seating_plans_follow on public.seating_plans;
drop function public.seating_plans_follow();

create or replace function public.seating_plans_layout()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.seating_live_layout(new.event_id);
  return null;
end;
$$;
create trigger seating_plans_layout after insert on public.seating_plans
  for each row execute function public.seating_plans_layout();

-- An item inserted with a layout but no space lands in THAT layout's first
-- space (0056's version always used the live layout).
create or replace function public.seating_item_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.space_id is null then
    if new.layout_id is null then
      new.layout_id := public.seating_live_layout(new.event_id);
    end if;
    new.space_id := public.seating_first_space(new.layout_id);
  elsif new.layout_id is null then
    select s.layout_id into new.layout_id from public.seating_spaces s where s.id = new.space_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. What guests, day links and the master read: the live layout only
-- ---------------------------------------------------------------------------
create view public.v_live_seat_assignments
with (security_invoker = true) as
select a.*
  from public.seat_assignments a
  join public.seating_layouts l on l.id = a.layout_id and l.is_live and l.deleted_at is null;

create view public.v_live_seating_tables
with (security_invoker = true) as
select t.*
  from public.seating_tables t
  join public.seating_layouts l on l.id = t.layout_id and l.is_live and l.deleted_at is null;

revoke all on public.v_live_seat_assignments, public.v_live_seating_tables from anon;
grant select on public.v_live_seat_assignments, public.v_live_seating_tables to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Snapshots belong to a layout
-- ---------------------------------------------------------------------------
-- An event that has a snapshot but never had seating data has no layout yet:
-- give it one, as 0056 did for the others, so every snapshot can name one.
insert into public.seating_layouts (wedding_id, event_id, name, is_live)
select distinct s.wedding_id, s.event_id, 'Main', true
  from public.seating_snapshots s
 where not exists (select 1 from public.seating_layouts l where l.event_id = s.event_id and l.is_live and l.deleted_at is null);

insert into public.seating_spaces (wedding_id, layout_id, name, room_width_cm, room_depth_cm,
                                   background_path, background_w_px, background_h_px, calibrated)
select l.wedding_id, l.id, left(coalesce(nullif(e.name, ''), 'Room'), 60),
       coalesce(p.room_width_cm, 2000), coalesce(p.room_depth_cm, 1500),
       p.background_path, p.background_w_px, p.background_h_px, coalesce(p.calibrated, false)
  from public.seating_layouts l
  join public.events e on e.id = l.event_id
  left join public.seating_plans p on p.event_id = l.event_id
 where not exists (select 1 from public.seating_spaces sp where sp.layout_id = l.id);

alter table public.seating_snapshots add column layout_id uuid;
update public.seating_snapshots s
   set layout_id = l.id
  from public.seating_layouts l
 where l.event_id = s.event_id and l.is_live and l.deleted_at is null;
alter table public.seating_snapshots alter column layout_id set not null;
alter table public.seating_snapshots
  add constraint seating_snapshots_layout_fk foreign key (layout_id, wedding_id)
    references public.seating_layouts (id, wedding_id) on delete cascade;
create index seating_snapshots_layout_idx on public.seating_snapshots (wedding_id, layout_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. The state functions, per layout
-- ---------------------------------------------------------------------------
-- A null layout means the event's live one, which is what every caller before
-- this migration meant. The old one-argument versions go (a second overload
-- with a defaulted argument would make `rpc('seating_state', { p_event_id })`
-- ambiguous), and so do the snapshot functions built on them.
drop function public.restore_seating_snapshot(uuid, uuid);
drop function public.take_seating_snapshot(uuid, text, boolean, uuid);
drop function public.restore_seating_state(uuid, jsonb, text);
drop function public.seating_state_hash(uuid);
drop function public.seating_state(uuid);

create or replace function public.seating_state(p_event_id uuid, p_layout_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with l as (
    select y.id from public.seating_layouts y
     where y.event_id = p_event_id and y.deleted_at is null
       and ((p_layout_id is null and y.is_live) or y.id = p_layout_id)
  )
  select jsonb_build_object(
    'version', 2,
    'plan', (select jsonb_build_object('room_width_cm', p.room_width_cm, 'room_depth_cm', p.room_depth_cm,
                                       'colour_by', p.colour_by, 'service_style', p.service_style,
                                       'menu', p.menu, 'settings', p.settings)
               from public.seating_plans p where p.event_id = p_event_id),
    'spaces', coalesce((select jsonb_agg(to_jsonb(s) - 'created_at' - 'updated_at' order by s.sort_order, s.id)
                          from public.seating_spaces s where s.layout_id in (select id from l)), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(to_jsonb(t) - 'created_at' - 'updated_at' order by t.sort_order, t.label, t.id)
                          from public.seating_tables t
                         where t.event_id = p_event_id and t.layout_id in (select id from l)), '[]'::jsonb),
    'fixtures', coalesce((select jsonb_agg(to_jsonb(f) - 'created_at' - 'updated_at' order by f.id)
                            from public.seating_fixtures f
                           where f.event_id = p_event_id and f.layout_id in (select id from l)), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at' order by a.guest_id)
                               from public.seat_assignments a
                              where a.event_id = p_event_id and a.layout_id in (select id from l)), '[]'::jsonb),
    'avoid_rules', coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' - 'updated_at' order by r.id)
                               from public.seating_rules r
                               join public.seating_tables t on t.id = r.table_id
                              where t.event_id = p_event_id and t.layout_id in (select id from l)), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(to_jsonb(b) - 'created_at' order by b.table_id, b.seat_index)
                           from public.seating_chairs_blocked b
                           join public.seating_tables t on t.id = b.table_id
                          where b.event_id = p_event_id and t.layout_id in (select id from l)), '[]'::jsonb)
  );
$$;
revoke all on function public.seating_state(uuid, uuid) from public, anon;
grant execute on function public.seating_state(uuid, uuid) to authenticated;

create or replace function public.seating_state_hash(p_event_id uuid, p_layout_id uuid default null)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select md5(public.seating_state(p_event_id, p_layout_id)::text);
$$;
revoke all on function public.seating_state_hash(uuid, uuid) from public, anon;
grant execute on function public.seating_state_hash(uuid, uuid) to authenticated;

-- Same contract as 0057's, into the named layout (null = live). A layout that
-- was deleted can't be restored into.
create or replace function public.restore_seating_state(
  p_event_id uuid,
  p_payload jsonb,
  p_expected_hash text default null,
  p_layout_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_layout uuid;
  v_tables int;
  v_fixtures int;
  v_seated int;
  v_total int;
  v_has_spaces boolean;
begin
  select e.wedding_id into v_wedding from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or (p_payload->>'version')::int is null or (p_payload->>'version')::int not in (1, 2) then
    raise exception 'unsupported seating state';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  if p_layout_id is null then
    v_layout := public.seating_live_layout(p_event_id);
  else
    select y.id into v_layout from public.seating_layouts y
     where y.id = p_layout_id and y.event_id = p_event_id and y.deleted_at is null;
    if v_layout is null then
      raise exception 'layout not found' using errcode = 'P0002';
    end if;
  end if;

  if p_expected_hash is not null and public.seating_state_hash(p_event_id, v_layout) <> p_expected_hash then
    raise exception 'the seating plan changed' using errcode = '40001';
  end if;

  delete from public.seating_tables where event_id = p_event_id and layout_id = v_layout;   -- cascades chairs, blocked, rules
  delete from public.seating_fixtures where event_id = p_event_id and layout_id = v_layout;

  v_has_spaces := jsonb_typeof(p_payload->'spaces') = 'array' and jsonb_array_length(p_payload->'spaces') > 0;
  if v_has_spaces then
    insert into public.seating_spaces
      (id, wedding_id, layout_id, name, sort_order, room_width_cm, room_depth_cm,
       background_path, background_w_px, background_h_px, calibrated, background_opacity, drawing)
    select sp.id, v_wedding, v_layout, sp.name, coalesce(sp.sort_order, 0), sp.room_width_cm, sp.room_depth_cm,
           sp.background_path, sp.background_w_px, sp.background_h_px, coalesce(sp.calibrated, false),
           coalesce(sp.background_opacity, 45), coalesce(sp.drawing, '{}'::jsonb)
      from jsonb_populate_recordset(null::public.seating_spaces, p_payload->'spaces') sp
    on conflict (id) do update
      set name = excluded.name, sort_order = excluded.sort_order,
          room_width_cm = excluded.room_width_cm, room_depth_cm = excluded.room_depth_cm,
          background_opacity = excluded.background_opacity, drawing = excluded.drawing
      where public.seating_spaces.layout_id = v_layout;
    delete from public.seating_spaces s
     where s.layout_id = v_layout
       and s.id not in (select (x->>'id')::uuid from jsonb_array_elements(p_payload->'spaces') x);
  end if;

  insert into public.seating_tables
    (id, wedding_id, event_id, layout_id, space_id, label, shape, capacity, reserved_seats, reserved_note,
     ends_seated, accessible, sort_order, notes, pos_x_cm, pos_y_cm, rotation_deg,
     width_cm, length_cm, rows_count, aisle_cm, segments, style_id, style_changes, platter_counts)
  select t.id, v_wedding, p_event_id, v_layout,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = t.space_id and s.layout_id = v_layout)
              then t.space_id end,
         t.label, t.shape, t.capacity,
         coalesce(t.reserved_seats, 0), t.reserved_note, coalesce(t.ends_seated, false),
         coalesce(t.accessible, false), coalesce(t.sort_order, 0), t.notes,
         t.pos_x_cm, t.pos_y_cm, coalesce(t.rotation_deg, 0), t.width_cm, t.length_cm,
         t.rows_count, t.aisle_cm, t.segments,
         case when exists (select 1 from public.seating_table_styles st where st.id = t.style_id and st.wedding_id = v_wedding)
              then t.style_id end,
         t.style_changes, t.platter_counts
    from jsonb_populate_recordset(null::public.seating_tables, p_payload->'tables') t;
  get diagnostics v_tables = row_count;

  insert into public.seating_fixtures
    (id, wedding_id, event_id, layout_id, space_id, kind, label, pos_x_cm, pos_y_cm, width_cm, depth_cm, rotation_deg,
     quantity, vendor_id, custom_item_id, marquee_id)
  select f.id, v_wedding, p_event_id, v_layout,
         case when v_has_spaces and exists (select 1 from public.seating_spaces s where s.id = f.space_id and s.layout_id = v_layout)
              then f.space_id end,
         f.kind, f.label, f.pos_x_cm, f.pos_y_cm,
         f.width_cm, f.depth_cm, coalesce(f.rotation_deg, 0), coalesce(f.quantity, 1),
         case when exists (select 1 from public.vendors v where v.id = f.vendor_id and v.wedding_id = v_wedding)
              then f.vendor_id end,
         f.custom_item_id, f.marquee_id
    from jsonb_populate_recordset(null::public.seating_fixtures, p_payload->'fixtures') f;
  get diagnostics v_fixtures = row_count;

  insert into public.seat_assignments
    (wedding_id, event_id, layout_id, guest_id, table_id, seat_index, decline_kept_at, own_plate, kids_meal)
  select v_wedding, p_event_id, v_layout, a.guest_id, a.table_id, a.seat_index, a.decline_kept_at,
         coalesce(a.own_plate, '{}'::jsonb), coalesce(a.kids_meal, '{}'::jsonb)
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
    insert into public.seating_plans
      (wedding_id, event_id, room_width_cm, room_depth_cm, colour_by, service_style, menu, settings)
    values (v_wedding, p_event_id,
            (p_payload->'plan'->>'room_width_cm')::int,
            (p_payload->'plan'->>'room_depth_cm')::int,
            p_payload->'plan'->>'colour_by',
            coalesce(p_payload->'plan'->>'service_style', 'plated'),
            coalesce(p_payload->'plan'->'menu', '[]'::jsonb),
            coalesce(p_payload->'plan'->'settings', '{}'::jsonb))
    on conflict (event_id) do update
      set room_width_cm = excluded.room_width_cm,
          room_depth_cm = excluded.room_depth_cm,
          colour_by = excluded.colour_by,
          service_style = excluded.service_style,
          menu = excluded.menu,
          settings = excluded.settings;
  end if;

  v_total := jsonb_array_length(coalesce(p_payload->'assignments', '[]'::jsonb));
  return jsonb_build_object(
    'tables', v_tables, 'fixtures', v_fixtures, 'seated', v_seated, 'skipped', v_total - v_seated,
    'hash', public.seating_state_hash(p_event_id, v_layout));
end;
$$;
revoke all on function public.restore_seating_state(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.restore_seating_state(uuid, jsonb, text, uuid) to authenticated;

-- A named or automatic copy of one layout. Automatic ones beyond the newest 30
-- for that LAYOUT are pruned; named ones are kept until deleted.
create or replace function public.take_seating_snapshot(
  p_event_id uuid,
  p_name text,
  p_automatic boolean default false,
  p_created_by uuid default null,
  p_layout_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_layout uuid;
  v_id uuid;
begin
  select e.wedding_id into v_wedding from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if p_layout_id is null then
    v_layout := public.seating_live_layout(p_event_id);
  else
    select y.id into v_layout from public.seating_layouts y
     where y.id = p_layout_id and y.event_id = p_event_id and y.deleted_at is null;
    if v_layout is null then
      raise exception 'layout not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.seating_snapshots (wedding_id, event_id, layout_id, name, automatic, created_by, payload)
  values (v_wedding, p_event_id, v_layout, p_name, p_automatic, p_created_by, public.seating_state(p_event_id, v_layout))
  returning id into v_id;

  if p_automatic then
    delete from public.seating_snapshots s
     where s.layout_id = v_layout
       and s.automatic
       and s.id not in (
         select k.id from public.seating_snapshots k
          where k.layout_id = v_layout and k.automatic
          order by k.created_at desc, k.id desc
          limit 30);
  end if;
  return v_id;
end;
$$;
revoke all on function public.take_seating_snapshot(uuid, text, boolean, uuid, uuid) from public, anon;
grant execute on function public.take_seating_snapshot(uuid, text, boolean, uuid, uuid) to authenticated;

-- Puts a copy back into the layout it was taken from, saving what it replaces
-- first. Refused when that layout has since been deleted.
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
  if (s.payload->>'version')::int is null or (s.payload->>'version')::int not in (1, 2) then
    raise exception 'unsupported snapshot version %', s.payload->>'version';
  end if;

  perform public.take_seating_snapshot(
    s.event_id, left(format('Before restoring "%s"', s.name), 120), true, p_created_by, s.layout_id);

  v_result := public.restore_seating_state(s.event_id, s.payload, null, s.layout_id);
  return v_result - 'hash';
end;
$$;
revoke all on function public.restore_seating_snapshot(uuid, uuid) from public, anon;
grant execute on function public.restore_seating_snapshot(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Try a layout; make it live
-- ---------------------------------------------------------------------------
-- Copies spaces (drawings, background), tables (styles, per-table changes),
-- fixtures, seating, avoid-table rules, blocked chairs and final item counts
-- into a new draft, with fresh ids. One statement, so the composite foreign
-- keys between the copies are checked once, at the end.
create or replace function public.seating_try_layout(p_event_id uuid, p_source_layout_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_wedding uuid;
  v_new uuid := gen_random_uuid();
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_drafts int;
begin
  select y.wedding_id into v_wedding from public.seating_layouts y
   where y.id = p_source_layout_id and y.event_id = p_event_id and y.deleted_at is null;
  if v_wedding is null then
    raise exception 'layout not found' using errcode = 'P0002';
  end if;
  if v_name = '' then
    raise exception 'give the layout a name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  select count(*) into v_drafts from public.seating_layouts y
   where y.event_id = p_event_id and not y.is_live and y.deleted_at is null;
  if v_drafts >= 20 then
    raise exception 'twenty drafts is the most; delete one first' using errcode = '54000';
  end if;

  insert into public.seating_layouts (id, wedding_id, event_id, name, is_live)
  values (v_new, v_wedding, p_event_id, v_name, false);

  with sp as (
    select s.id as old_id, gen_random_uuid() as new_id, to_jsonb(s) as j
      from public.seating_spaces s where s.layout_id = p_source_layout_id
  ), ins_sp as (
    insert into public.seating_spaces
    select (jsonb_populate_record(null::public.seating_spaces,
              sp.j || jsonb_build_object('id', sp.new_id, 'layout_id', v_new,
                                         'created_at', now(), 'updated_at', now()))).*
      from sp
    returning id
  ), tb as (
    select t.id as old_id, gen_random_uuid() as new_id, to_jsonb(t) as j
      from public.seating_tables t where t.layout_id = p_source_layout_id
  ), ins_tb as (
    insert into public.seating_tables
    select (jsonb_populate_record(null::public.seating_tables,
              tb.j || jsonb_build_object('id', tb.new_id, 'layout_id', v_new,
                                         'space_id', (select sp.new_id from sp where sp.old_id = (tb.j->>'space_id')::uuid),
                                         'created_at', now(), 'updated_at', now()))).*
      from tb
    returning id
  ), ins_fx as (
    insert into public.seating_fixtures
    select (jsonb_populate_record(null::public.seating_fixtures,
              to_jsonb(f) || jsonb_build_object('id', gen_random_uuid(), 'layout_id', v_new,
                                                'space_id', (select sp.new_id from sp where sp.old_id = f.space_id),
                                                'created_at', now(), 'updated_at', now()))).*
      from public.seating_fixtures f where f.layout_id = p_source_layout_id
    returning id
  ), ins_a as (
    insert into public.seat_assignments
    select (jsonb_populate_record(null::public.seat_assignments,
              to_jsonb(a) || jsonb_build_object('layout_id', v_new,
                                                'table_id', (select tb.new_id from tb where tb.old_id = a.table_id),
                                                'created_at', now(), 'updated_at', now()))).*
      from public.seat_assignments a where a.layout_id = p_source_layout_id
    returning guest_id
  ), ins_r as (
    insert into public.seating_rules
    select (jsonb_populate_record(null::public.seating_rules,
              to_jsonb(r) || jsonb_build_object('id', gen_random_uuid(),
                                                'table_id', (select tb.new_id from tb where tb.old_id = r.table_id),
                                                'created_at', now(), 'updated_at', now()))).*
      from public.seating_rules r
     where r.kind = 'avoid_table' and r.table_id in (select old_id from tb)
    returning id
  ), ins_b as (
    insert into public.seating_chairs_blocked
    select (jsonb_populate_record(null::public.seating_chairs_blocked,
              to_jsonb(b) || jsonb_build_object('table_id', (select tb.new_id from tb where tb.old_id = b.table_id),
                                                'created_at', now()))).*
      from public.seating_chairs_blocked b where b.table_id in (select old_id from tb)
    returning table_id
  )
  insert into public.seating_item_counts
  select (jsonb_populate_record(null::public.seating_item_counts,
            to_jsonb(c) || jsonb_build_object('layout_id', v_new, 'created_at', now(), 'updated_at', now()))).*
    from public.seating_item_counts c where c.layout_id = p_source_layout_id;

  return v_new;
end;
$$;
revoke all on function public.seating_try_layout(uuid, uuid, text) from public, anon;
grant execute on function public.seating_try_layout(uuid, uuid, text) to authenticated;

-- Swaps a draft in. The layout that was live becomes a draft named
-- "<name> (before <date>)", so the swap can be reversed the same way. Refused
-- while the live layout is locked (Part D): unlock it first.
create or replace function public.seating_make_live(p_event_id uuid, p_layout_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old public.seating_layouts;
  v_new public.seating_layouts;
  v_tz text;
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtext(p_event_id::text));

  select * into v_new from public.seating_layouts y
   where y.id = p_layout_id and y.event_id = p_event_id and y.deleted_at is null;
  if v_new.id is null then
    raise exception 'layout not found' using errcode = 'P0002';
  end if;
  if v_new.is_live then
    raise exception 'that layout is already live' using errcode = '22023';
  end if;

  select * into v_old from public.seating_layouts y
   where y.event_id = p_event_id and y.is_live and y.deleted_at is null;
  if v_old.id is not null and v_old.locked_at is not null then
    raise exception 'the live layout is locked' using errcode = '55000';
  end if;

  select w.timezone into v_tz from public.weddings w where w.id = v_new.wedding_id;
  if v_old.id is not null then
    v_name := left(v_old.name, 44) || ' (before ' || to_char(now() at time zone coalesce(v_tz, 'UTC'), 'FMDD Mon') || ')';
    update public.seating_layouts set is_live = false, name = v_name where id = v_old.id;
  end if;
  update public.seating_layouts set is_live = true where id = v_new.id;

  return jsonb_build_object('live', v_new.id, 'previous', v_old.id, 'previous_name', v_name);
end;
$$;
revoke all on function public.seating_make_live(uuid, uuid) from public, anon;
grant execute on function public.seating_make_live(uuid, uuid) to authenticated;
