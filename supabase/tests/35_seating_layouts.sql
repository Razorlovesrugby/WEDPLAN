-- ===========================================================================
-- Seating layouts and spaces (spec 57, migration 0056)
-- ===========================================================================
-- Asserted: an event's seating always has one live layout with a space; the
-- old callers, who know only event_id, still land in it; a seat lies in the
-- layout of its table; an item lies in a space of its own layout and event;
-- the room columns still on seating_plans reach the first space; and the new
-- tables are tenant-scoped.
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set alex      '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set ceremony  '''e1111111-1111-4111-8111-111111111111'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set chidi     '''9a000000-0000-4000-8000-000000000001'''
\set t1        '''5ea70000-0000-4000-8000-000000000001'''
\set t2        '''5ea70000-0000-4000-8000-000000000002'''
\set tc        '''5ea70000-0000-4000-8000-0000000000c1'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_true(actual boolean, label text)
returns void language plpgsql as $$
begin
  if actual is not true then
    raise exception 'FAIL % — expected true', label;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_error(stmt text, code text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % — expected error %, none raised', label, code;
exception when others then
  if sqlstate = code then
    raise notice '  ok  %', label;
  elsif sqlstate = 'P0001' and sqlerrm like 'FAIL %' then
    raise;
  else
    raise exception 'FAIL % — expected %, got % (%)', label, code, sqlstate, sqlerrm;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Callers who know only event_id
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order)
values (:t1, :w1, :reception, 'Table 1', 8, 1), (:t2, :w1, :reception, 'Table 2', 8, 2),
       (:tc, :w1, :ceremony, 'Front pew', 6, 1);
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:w1, :reception, 'dance_floor', 1000, 700, 500, 500);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index)
values (:w1, :reception, :chidi, :t1, 0);

select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception and is_live), 1,
  'a table insert made the event''s one live layout');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :ceremony and is_live), 1,
  '… and the other event got its own');
select pg_temp.expect((select count(*) from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id
                        where l.event_id = :reception), 1, 'the layout has one space');
select pg_temp.expect_true(
  (select count(distinct t.space_id) = 1 and bool_and(t.space_id is not null) from public.seating_tables t where t.event_id = :reception),
  'both reception tables are in that space');
select pg_temp.expect_true(
  (select f.space_id = (select t.space_id from public.seating_tables t where t.id = :t1) from public.seating_fixtures f where f.event_id = :reception),
  'a fixture lands in the same space');
select pg_temp.expect_true(
  (select a.layout_id = (select t.layout_id from public.seating_tables t where t.id = :t1) from public.seat_assignments a where a.guest_id = :chidi),
  'a seat takes the layout of its table');
select pg_temp.expect_true(
  (select l.name = 'Main' from public.seating_layouts l where l.event_id = :reception and l.is_live),
  'the live layout is called Main');

-- Exactly one live layout per event.
select pg_temp.expect_error(format(
  'insert into public.seating_layouts (wedding_id, event_id, name, is_live) values (%L, %L, ''Second'', true)',
  :w1, :reception), '23505', 'a second live layout is refused');
-- A draft is allowed.
insert into public.seating_layouts (wedding_id, event_id, name) values (:w1, :reception, 'Long tables');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception), 2, 'a draft layout is allowed beside it');
select pg_temp.expect_error(format(
  'update public.seating_layouts set deleted_at = now() where event_id = %L and is_live', :reception),
  '23514', 'the live layout can''t be deleted');
select pg_temp.expect_error(format(
  'update public.seating_layouts set locked_at = now() where event_id = %L and is_live', :reception),
  '23514', 'a lock names who locked it');
rollback;

-- ---------------------------------------------------------------------------
-- 2. Consistency the schema enforces
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity)
values (:t1, :w1, :reception, 'Table 1', 8), (:tc, :w1, :ceremony, 'Front pew', 6);

-- A table can't sit in a space of another event's layout.
select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, capacity, space_id) values (%L, %L, ''Stray'', 8, %L)',
  :w1, :reception,
  (select s.id from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id where l.event_id = :ceremony)),
  '23503', 'a table can''t be put in another event''s space');

-- A seat can't claim a layout other than its table's.
insert into public.seating_layouts (id, wedding_id, event_id, name)
values ('1a100000-0000-4000-8000-000000000001', :w1, :reception, 'Draft');
select pg_temp.expect_error(format(
  'insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, layout_id) values (%L, %L, %L, %L, %L)',
  :w1, :reception, :chidi, :t1, '1a100000-0000-4000-8000-000000000001'),
  '23503', 'a seat can''t be in a different layout from its table');

-- Deleting a layout takes its spaces, tables and seats with it.
insert into public.seating_spaces (id, wedding_id, layout_id, name)
values ('5b100000-0000-4000-8000-000000000001', :w1, '1a100000-0000-4000-8000-000000000001', 'Terrace');
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, space_id)
values ('5ea70000-0000-4000-8000-0000000000d1', :w1, :reception, 'Draft table', 6, '5b100000-0000-4000-8000-000000000001');
select pg_temp.expect_true(
  (select layout_id = '1a100000-0000-4000-8000-000000000001' from public.seating_tables where id = '5ea70000-0000-4000-8000-0000000000d1'),
  'a table given a space takes that space''s layout');
delete from public.seating_layouts where id = '1a100000-0000-4000-8000-000000000001';
select pg_temp.expect((select count(*) from public.seating_tables where label = 'Draft table'), 0,
  'deleting a layout deletes its tables');
rollback;

-- ---------------------------------------------------------------------------
-- 3. A plan starts the layout; the room is then the space's (0059)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_plans (wedding_id, event_id, room_width_cm, room_depth_cm)
values (:w1, :reception, 3000, 1800);
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception and is_live), 1,
  'a new plan leaves the event with one live layout');
select pg_temp.expect((select count(*) from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id where l.event_id = :reception), 1,
  '… with one space');
create temp table room_before as
  select s.room_width_cm w, s.calibrated c from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id where l.event_id = :reception;
update public.seating_plans set room_width_cm = 2500, calibrated = true where event_id = :reception;
select pg_temp.expect_true(
  (select s.room_width_cm = r.w and s.calibrated = r.c
     from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id, room_before r where l.event_id = :reception),
  'editing the plan''s room columns no longer moves the space (the room lives on the space)');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception), 1,
  'and made no second layout');

-- The state functions still round-trip through the triggers.
insert into public.seating_tables (id, wedding_id, event_id, label, capacity) values (:t1, :w1, :reception, 'Table 1', 8);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :reception, :chidi, :t1, 2);
create temp table saved as select public.seating_state(:reception) as s;
update public.seating_tables set label = 'Renamed' where id = :t1;
select public.restore_seating_state(:reception, (select s from saved));
select pg_temp.expect_true(
  (select t.label = 'Table 1' and t.space_id is not null and t.layout_id is not null from public.seating_tables t where t.id = :t1),
  'a restored table is back in a space of the live layout');
select pg_temp.expect_true(
  (select a.layout_id = t.layout_id and a.seat_index = 2 from public.seat_assignments a join public.seating_tables t on t.id = a.table_id where a.guest_id = :chidi),
  'a restored seat is back in that layout');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception), 1,
  'a restore makes no new layout');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Tenancy
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity) values (:t1, :w1, :reception, 'Table 1', 8);
select pg_temp.expect((select count(*) from public.seating_layouts where wedding_id = :w1), 1, 'a collaborator sees their layout');

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect((select count(*) from public.seating_layouts where wedding_id = :w1), 0, 'the second account sees none of its layouts');
select pg_temp.expect((select count(*) from public.seating_spaces where wedding_id = :w1), 0, '… none of its spaces');
select pg_temp.expect_error(format(
  'insert into public.seating_layouts (wedding_id, event_id, name) values (%L, %L, ''Mine'')', :w1, :reception),
  '42501', 'and cannot add a layout to it');
rollback;

begin;
set local role anon;
select pg_temp.expect_error('select 1 from public.seating_layouts', '42501', 'anon cannot read layouts at all');
rollback;
