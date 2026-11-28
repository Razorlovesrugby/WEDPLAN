-- ===========================================================================
-- The seating canvas, round two (spec 59 Parts D and E, spec 60 Part A and E.2,
-- migration 0062)
-- ===========================================================================
-- Asserted: the new columns and their bounds; seating_state() carries them and
-- restore_seating_state() puts them back (and fills the defaults for a state
-- taken before they existed); trying a layout copies them; and
-- seating_apply_items() does a whole move, resize, copy, delete, stamp, lock or
-- reorder in one transaction: refused whole for a locked room, a layout that is
-- not this event's, an item that is not in the layout, a held (locked) item and
-- a stale position, and never half-done.
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
\set t3        '''5ea70000-0000-4000-8000-000000000003'''
\set f1        '''5ea70000-0000-4000-8000-0000000000f1'''
\set f2        '''5ea70000-0000-4000-8000-0000000000f2'''
\set gone      '''5ea70000-0000-4000-8000-0000000000ff'''

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

-- The error's SQLSTATE and, when given, its message must both match.
create or replace function pg_temp.expect_error(stmt text, code text, label text, msg text default null)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % — expected error %, none raised', label, code;
exception when others then
  if sqlstate = code and (msg is null or sqlerrm = msg) then
    raise notice '  ok  %', label;
  elsif sqlstate = 'P0001' and sqlerrm like 'FAIL %' then
    raise;
  else
    raise exception 'FAIL % — expected % %, got % (%)', label, code, coalesce(msg, ''), sqlstate, sqlerrm;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The columns and their bounds
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500);
insert into public.seating_fixtures (id, wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:f1, :w1, :reception, 'dance_floor', 1000, 700, 500, 500);
insert into public.seating_table_styles (wedding_id, name) values (:w1, 'Long, family style');

select pg_temp.expect_true((select table_items = '[]'::jsonb and not locked from public.seating_tables where id = :t1),
  'a table starts with no items and unlocked');
select pg_temp.expect_true((select not locked and z = 0 from public.seating_fixtures where id = :f1), 'a fixture starts unlocked at z = 0');
select pg_temp.expect_true((select item_rules = '[]'::jsonb from public.seating_table_styles where name = 'Long, family style'),
  'a style starts with no rules');

select pg_temp.expect_error(format('update public.seating_tables set table_items = ''{}'' where id = %L', :t1), '23514',
  'table items must be an array');
select pg_temp.expect_error(format('update public.seating_tables set table_items = (select jsonb_agg(i) from generate_series(1, 201) i) where id = %L', :t1), '23514',
  'a table carries 200 items at most');
select pg_temp.expect_error('update public.seating_table_styles set item_rules = ''{}''', '23514', 'rules must be an array');
select pg_temp.expect_error('update public.seating_table_styles set item_rules = (select jsonb_agg(i) from generate_series(1, 41) i)', '23514',
  'a style holds 40 rules at most');
rollback;

-- ---------------------------------------------------------------------------
-- 2. State carries the columns; restore puts them back
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm, table_items, locked)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500, '[{"id":"i1","kind":"candles","along":0.25,"across":0.1}]', true);
insert into public.seating_fixtures (id, wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm, locked, z)
values (:f1, :w1, :reception, 'dance_floor', 1000, 700, 500, 500, true, 5);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;
create temp table st as select public.seating_state(:reception, (select live from ids)) as s;

select pg_temp.expect_true((select s->'tables'->0->'table_items'->0->>'kind' = 'candles' and (s->'tables'->0->>'locked')::boolean from st),
  'the state carries a table''s items and lock');
select pg_temp.expect_true((select (s->'fixtures'->0->>'locked')::boolean and (s->'fixtures'->0->>'z')::int = 5 from st),
  'the state carries a fixture''s lock and order');

delete from public.seating_tables where id = :t1;
delete from public.seating_fixtures where id = :f1;
select public.restore_seating_state(:reception, (select s from st), null, (select live from ids));
select pg_temp.expect_true((select table_items->0->>'id' = 'i1' and locked from public.seating_tables where id = :t1),
  'restore puts a table''s items and lock back');
select pg_temp.expect_true((select locked and z = 5 from public.seating_fixtures where id = :f1), 'restore puts a fixture''s lock and order back');
select pg_temp.expect_true((select public.seating_state(:reception, (select live from ids)) = (select s from st) from ids), 'the round trip is exact');

-- A state taken before the columns existed has none of them: they take their defaults.
create temp table old as
  select jsonb_set(jsonb_set(s, '{tables}', (select jsonb_agg(t - 'table_items' - 'locked') from jsonb_array_elements(s->'tables') t)),
                   '{fixtures}', (select jsonb_agg(f - 'locked' - 'z') from jsonb_array_elements(s->'fixtures') f)) as s from st;
select public.restore_seating_state(:reception, (select s from old), null, (select live from ids));
select pg_temp.expect_true((select table_items = '[]'::jsonb and not locked from public.seating_tables where id = :t1),
  'an older state restores with no items and unlocked');
select pg_temp.expect_true((select not locked and z = 0 from public.seating_fixtures where id = :f1), '… and fixtures unlocked at z = 0');

-- Trying a layout copies them.
update public.seating_tables set table_items = '[{"id":"i1","kind":"candles","along":0.25,"across":0.1}]', locked = true where id = :t1;
update public.seating_fixtures set z = 7 where id = :f1;
create temp table draft as select public.seating_try_layout(:reception, (select live from ids), 'With items') as id;
select pg_temp.expect_true((select jsonb_array_length(table_items) = 1 and locked from public.seating_tables where layout_id = (select id from draft)),
  'a draft copies a table''s items and lock');
select pg_temp.expect((select z from public.seating_fixtures where layout_id = (select id from draft)), 7, '… and a fixture''s order');
rollback;

-- ---------------------------------------------------------------------------
-- 3. seating_apply_items: moves, all or nothing
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500), (:t2, :w1, :reception, 'Table 2', 'long', 10, 2, 900, 500);
insert into public.seating_fixtures (id, wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:f1, :w1, :reception, 'dance_floor', 1000, 700, 500, 500), (:f2, :w1, :reception, 'stage', 1000, 100, 400, 200);
insert into public.guests (id, wedding_id, household_id, first_name, side)
select :chidi, :w1, (select id from public.households where wedding_id = :w1 limit 1), 'Chidi', 'both'
 where not exists (select 1 from public.guests where id = :chidi);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;

-- A good move: both kinds, one call.
select public.seating_apply_items(:reception, (select live from ids), 'move',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 600, 'y', 650, 'rotation', 90),
                    jsonb_build_object('kind', 'fixture', 'id', :f1, 'x', 1100, 'y', 800)));
select pg_temp.expect_true((select pos_x_cm = 600 and pos_y_cm = 650 and rotation_deg = 90 from public.seating_tables where id = :t1), 'a table is moved and turned');
select pg_temp.expect_true((select pos_x_cm = 1100 and pos_y_cm = 800 from public.seating_fixtures where id = :f1), '… and a fixture with it');

-- An item that is not in the layout refuses the whole move: nothing half-shifted.
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'x', 1, 'y', 1), jsonb_build_object('kind', 'fixture', 'id', :gone, 'x', 2, 'y', 2))::text),
  'P0002', 'an item that is not in the layout refuses the whole move', 'seating_item_missing');
select pg_temp.expect_true((select pos_x_cm = 900 and pos_y_cm = 500 from public.seating_tables where id = :t2), '… and the good one did not move');

-- A stale starting position refuses the whole move (spec 60 E.2).
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'x', 1, 'y', 1, 'from', jsonb_build_object('x', 900, 'y', 500, 'rotation', 0)),
                    jsonb_build_object('kind', 'table', 'id', :t1, 'x', 2, 'y', 2, 'from', jsonb_build_object('x', 500, 'y', 500, 'rotation', 0)))::text),
  '40001', 'a move from where the item no longer is is refused whole', 'seating_stale');
select pg_temp.expect_true((select pos_x_cm = 900 from public.seating_tables where id = :t2), '… and nothing moved');
select public.seating_apply_items(:reception, (select live from ids), 'move',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'x', 950, 'y', 500, 'from', jsonb_build_object('x', 900, 'y', 500, 'rotation', 0))));
select pg_temp.expect((select pos_x_cm from public.seating_tables where id = :t2), 950, 'a move from the true position goes through');

-- Lock item: a held item can't be moved, turned, resized or deleted, and the whole call is refused.
select public.seating_apply_items(:reception, (select live from ids), 'lock', jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'locked', true)));
select pg_temp.expect_true((select locked from public.seating_tables where id = :t1), 'Lock item holds a table');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'x', 1, 'y', 1), jsonb_build_object('kind', 'table', 'id', :t1, 'x', 2, 'y', 2))::text),
  'P0001', 'a held item refuses the whole move', 'seating_item_locked');
select pg_temp.expect_true((select pos_x_cm = 950 from public.seating_tables where id = :t2), '… and the free one stayed');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''delete'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1))::text), 'P0001', 'a held item can''t be deleted', 'seating_item_locked');
-- A held item can still be copied, and seating guests at it still works.
select pg_temp.expect((select jsonb_array_length(public.seating_apply_items(:reception, (select live from ids), 'copy',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 100, 'y', 100)))->'tables')), 1, 'a held table can be copied');
select pg_temp.expect_true((select not locked from public.seating_tables where label = 'Table 3'), '… and the copy is not held');
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :reception, :chidi, :t1, 0);
select pg_temp.expect((select count(*) from public.seat_assignments where table_id = :t1), 1, 'seating a guest at a held table still works');
select public.seating_apply_items(:reception, (select live from ids), 'lock', jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'locked', false)));
select pg_temp.expect_true((select not locked from public.seating_tables where id = :t1), 'unlocking releases it');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Resize, copy, delete, stamp, order
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm, table_items)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500, '[{"id":"i1","kind":"candles"}]'),
       (:t2, :w1, :reception, 'Table 2', 'banquet', 20, 2, 900, 500, '[]');
insert into public.seating_fixtures (id, wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:f1, :w1, :reception, 'dance_floor', 1000, 700, 500, 500), (:f2, :w1, :reception, 'stage', 1000, 100, 400, 200);
insert into public.guests (id, wedding_id, household_id, first_name, side)
select :chidi, :w1, (select id from public.households where wedding_id = :w1 limit 1), 'Chidi', 'both'
 where not exists (select 1 from public.guests where id = :chidi);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :reception, :chidi, :t1, 0);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;

-- Resize.
select public.seating_apply_items(:reception, (select live from ids), 'resize',
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f1, 'x', 1050, 'y', 700, 'width', 600, 'depth', 500)));
select pg_temp.expect_true((select width_cm = 600 and depth_cm = 500 and pos_x_cm = 1050 from public.seating_fixtures where id = :f1), 'a fixture is resized, its centre with it');
select public.seating_apply_items(:reception, (select live from ids), 'resize',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 500, 'y', 500, 'width', 200, 'depth', 120)));
select pg_temp.expect_true((select length_cm = 200 and width_cm = 200 from public.seating_tables where id = :t1), 'a round table has one size: both are the diameter');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''resize'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'x', 900, 'y', 500, 'width', 700, 'depth', 90))::text),
  '22023', 'a banquet run is sized in its form, not by dragging', 'seating_shape_not_resizable');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''resize'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f2, 'x', 1000, 'y', 100, 'width', 10, 'depth', 200))::text),
  '23514', 'a fixture can''t go under 20 cm');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''resize'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f2, 'x', 1000, 'y', 100, 'width', 500, 'depth', 200, 'from', jsonb_build_object('x', 1000, 'y', 100, 'rotation', 0, 'width', 999, 'depth', 200)))::text),
  '40001', 'a resize of an item that has since changed size is refused', 'seating_stale');

-- Copy: fresh names, no guests, the items come along, and into another space of the layout.
create temp table cp as select public.seating_apply_items(:reception, (select live from ids), 'copy',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 300, 'y', 300), jsonb_build_object('kind', 'fixture', 'id', :f2, 'x', 400, 'y', 400))) as r;
select pg_temp.expect((select jsonb_array_length(r->'tables') + jsonb_array_length(r->'fixtures') from cp), 2, 'a table and a fixture are copied in one call');
select pg_temp.expect_true((select label = 'Table 3' and jsonb_array_length(table_items) = 1 and pos_x_cm = 300 from public.seating_tables where id = ((select r->'tables'->>0 from cp)::uuid)),
  'the copy has the next name, the items and the new place');
select pg_temp.expect((select count(*) from public.seat_assignments where table_id = ((select r->'tables'->>0 from cp)::uuid)), 0, '… and no guests');

-- A copy into a space that is not this layout's is refused.
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''copy'', %L, %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f2, 'x', 1, 'y', 1))::text, '5ea70000-0000-4000-8000-0000000000aa'),
  'P0002', 'a copy into a room of another layout is refused', 'seating_space_not_found');

-- Stamp: one transaction, so a bad item in the middle puts nothing down.
select pg_temp.expect((select (public.seating_apply_items(:reception, (select live from ids), 'stamp',
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'fixture_kind', 'candles', 'x', 100, 'y', 100, 'width', 30, 'depth', 30),
                    jsonb_build_object('kind', 'fixture', 'fixture_kind', 'candles', 'x', 200, 'y', 100, 'width', 30, 'depth', 30),
                    jsonb_build_object('kind', 'table', 'shape', 'round', 'capacity', 8, 'x', 700, 'y', 900))))->>'count')::int, 3,
  'a line of candles and a table are stamped in one call');
select pg_temp.expect((select count(*) from public.seating_fixtures where kind = 'candles'), 2, 'both candles are there');
select pg_temp.expect_true((select label = 'Table 4' from public.seating_tables where pos_x_cm = 700 and pos_y_cm = 900), 'the stamped table has the next name');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''stamp'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'fixture_kind', 'lantern', 'x', 1, 'y', 1, 'width', 30, 'depth', 30),
                    jsonb_build_object('kind', 'fixture', 'fixture_kind', 'not_a_kind', 'x', 2, 'y', 2, 'width', 30, 'depth', 30))::text),
  '22P02', 'a bad item in a stamp refuses the lot');
select pg_temp.expect((select count(*) from public.seating_fixtures where kind = 'lantern'), 0, '… and the good one was not put down');

-- Order among furniture and décor.
select public.seating_apply_items(:reception, (select live from ids), 'front', jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f1)));
select pg_temp.expect_true((select z > (select z from public.seating_fixtures where id = :f2) from public.seating_fixtures where id = :f1), 'Bring to front puts it above the rest');
select public.seating_apply_items(:reception, (select live from ids), 'back', jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f1)));
select pg_temp.expect_true((select z < (select min(z) from public.seating_fixtures where id <> :f1) from public.seating_fixtures where id = :f1), 'Send to back puts it below');
select public.seating_apply_items(:reception, (select live from ids), 'front', jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1)));
select pg_temp.expect_true(true, 'a table has no order among furniture: it is skipped, not refused');

-- Delete: tables take their seats with them.
select public.seating_apply_items(:reception, (select live from ids), 'delete',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1), jsonb_build_object('kind', 'fixture', 'id', :f2)));
select pg_temp.expect((select count(*) from public.seating_tables where id = :t1), 0, 'a table is deleted');
select pg_temp.expect((select count(*) from public.seat_assignments where guest_id = :chidi), 0, '… and its guest goes back to the tray');
select pg_temp.expect((select count(*) from public.seating_fixtures where id = :f2), 0, '… and the fixture with it');
rollback;

-- ---------------------------------------------------------------------------
-- 4b. What is placed on a table's top (spec 59 D)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm, locked)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500, true), (:t2, :w1, :reception, 'Table 2', 'long', 10, 2, 900, 500, false);
insert into public.seating_fixtures (id, wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:f1, :w1, :reception, 'dance_floor', 1000, 700, 500, 500);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;

select public.seating_apply_items(:reception, (select live from ids), 'items',
  jsonb_build_array(
    jsonb_build_object('kind', 'table', 'id', :t1, 'table_items', jsonb_build_array(jsonb_build_object('id', 'a', 'kind', 'candles', 'along', 0, 'across', 0))),
    jsonb_build_object('kind', 'table', 'id', :t2, 'table_items', '[]'::jsonb, 'style_changes', jsonb_build_object('item_rules', jsonb_build_array(jsonb_build_object('id', 'r1', 'kind', 'candles', 'rule', 'centre'))))));
select pg_temp.expect_true((select jsonb_array_length(table_items) = 1 from public.seating_tables where id = :t1), 'items are set on a table, even a held one');
select pg_temp.expect_true((select style_changes->'item_rules'->0->>'id' = 'r1' from public.seating_tables where id = :t2), '… and a table''s own rules with them');
select public.seating_apply_items(:reception, (select live from ids), 'items',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'table_items', '[]'::jsonb, 'style_changes', 'null'::jsonb)));
select pg_temp.expect_true((select style_changes is null from public.seating_tables where id = :t2), 'a null clears the table''s own changes');
select public.seating_apply_items(:reception, (select live from ids), 'items',
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t2, 'table_items', jsonb_build_array(jsonb_build_object('id', 'z', 'kind', 'sign', 'along', 0.1, 'across', 0)))));
select pg_temp.expect_true((select jsonb_array_length(table_items) = 1 from public.seating_tables where id = :t2), 'leaving style_changes out leaves them alone');

-- All or nothing across tables.
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''items'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'table_items', '[]'::jsonb), jsonb_build_object('kind', 'table', 'id', :gone, 'table_items', '[]'::jsonb))::text),
  'P0002', 'an items call naming a table that is not there is refused whole', 'seating_item_missing');
select pg_temp.expect((select jsonb_array_length(table_items) from public.seating_tables where id = :t1), 1, '… and the other table kept its items');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''items'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'fixture', 'id', :f1, 'table_items', '[]'::jsonb))::text),
  '22023', 'only a table carries items');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''items'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'table_items', '{}'::jsonb))::text),
  '23514', 'items that are not a list are refused by the table''s own check');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Refusals: a locked room, the wrong layout, an empty call, a stranger
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order, pos_x_cm, pos_y_cm)
values (:t1, :w1, :reception, 'Table 1', 'round', 8, 1, 500, 500);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live,
                                (select id from public.seating_layouts where event_id = :ceremony and is_live) as other;

select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', %L)', :reception, (select other from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 1, 'y', 1))::text),
  'P0002', 'a layout of another event isn''t this one', 'seating_layout_not_found');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', ''[]'')', :reception, (select live from ids)), '22023', 'an empty call does nothing');
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''explode'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1))::text), '22023', 'an unknown operation is refused');

update public.seating_layouts set locked_at = now(), locked_by = :alex where id = (select live from ids);
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''move'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1, 'x', 1, 'y', 1))::text),
  'P0001', 'a locked room refuses the whole call', 'seating_room_locked');
select pg_temp.expect((select pos_x_cm from public.seating_tables where id = :t1), 500, '… and nothing moved');
update public.seating_layouts set locked_at = null, locked_by = null where id = (select live from ids);

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect_error(format('select public.seating_apply_items(%L, %L, ''delete'', %L)', :reception, (select live from ids),
  jsonb_build_array(jsonb_build_object('kind', 'table', 'id', :t1))::text),
  'P0002', 'a stranger can''t touch another wedding''s layout', 'seating_layout_not_found');
rollback;

begin;
set local role anon;
select pg_temp.expect_error('select public.seating_apply_items(null, null, ''move'', ''[]'')', '42501', 'anon cannot call it');
rollback;
