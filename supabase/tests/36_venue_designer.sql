-- ===========================================================================
-- The venue designer's storage (spec 57, migrations 0057 and 0058)
-- ===========================================================================
-- Asserted: the shape rules on tables and fixtures; state version 2 round-trips
-- spaces, drawings, styles, seat flags, the menu and settings; a version 1
-- payload still restores; a restore drops ids that no longer exist instead of
-- failing; the undo guard still refuses; every new table is tenant-scoped;
-- dietary needs follow their rules.
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set alex      '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set chidi     '''9a000000-0000-4000-8000-000000000001'''
\set ngozi     '''9a000000-0000-4000-8000-000000000002'''
\set t1        '''5ea70000-0000-4000-8000-000000000001'''
\set t2        '''5ea70000-0000-4000-8000-000000000002'''
\set sp2       '''5b200000-0000-4000-8000-000000000002'''
\set style1    '''57100000-0000-4000-8000-000000000001'''
\set vendor    '''e0000000-0000-4000-8000-000000000002'''

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
-- 1. Shape rules
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, shape, capacity) values (%L, %L, ''Pews'', ''rows'', 40)',
  :w1, :reception), '23514', 'ceremony rows need a row length');
insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, rows_count, aisle_cm)
values (:w1, :reception, 'Pews', 'rows', 40, 8, 120);
select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, rows_count) values (%L, %L, ''Round'', ''round'', 8, 4)',
  :w1, :reception), '23514', 'only rows tables carry a row length');
select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, segments) values (%L, %L, ''Run'', ''round'', 8, ''[]'')',
  :w1, :reception), '23514', 'only banquet runs carry segments');
insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, segments)
values (:w1, :reception, 'U', 'banquet', 24, '[{"len":300,"turn":0},{"len":600,"turn":90}]');

select pg_temp.expect_error(format(
  'insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm) values (%L, %L, ''custom'', 0, 0, 100, 100)',
  :w1, :reception), '23514', 'a custom item names which one');
select pg_temp.expect_error(format(
  'insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm, quantity) values (%L, %L, ''plant'', 0, 0, 60, 60, 0)',
  :w1, :reception), '23514', 'a quantity is at least 1');
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm, quantity)
values (:w1, :reception, 'aisle_flowers', 500, 500, 40, 40, 12);
select pg_temp.expect((select quantity from public.seating_fixtures where kind = 'aisle_flowers'), 12, 'a décor item holds a quantity');

insert into public.seating_custom_items (id, wedding_id, name, width_cm, depth_cm)
values ('c1000000-0000-4000-8000-000000000001', :w1, 'Neon sign', 120, 20);
insert into public.seating_fixtures (wedding_id, event_id, kind, custom_item_id, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:w1, :reception, 'custom', 'c1000000-0000-4000-8000-000000000001', 100, 100, 120, 20);
select pg_temp.expect_error(format(
  'update public.seating_spaces set drawing = ''[]'' where id = (select s.id from public.seating_spaces s limit 1)'),
  '23514', 'a space''s drawing is an object');
select pg_temp.expect_error(format(
  'insert into public.seating_table_styles (wedding_id, name) values (%L, '''')', :w1),
  '23514', 'a style needs a name');
insert into public.seating_table_styles (id, wedding_id, name) values (:style1, :w1, 'Garden round');
select pg_temp.expect_error(format(
  'insert into public.seating_table_styles (wedding_id, name) values (%L, ''garden ROUND'')', :w1),
  '23505', 'style names are unique per wedding, ignoring case');
update public.seating_table_styles set deleted_at = now() where id = :style1;
insert into public.seating_table_styles (wedding_id, name) values (:w1, 'Garden round');
select pg_temp.expect((select count(*) from public.seating_table_styles where wedding_id = :w1), 2,
  'a deleted style frees its name');
select pg_temp.expect_error(format(
  'insert into public.seating_plans (wedding_id, event_id, service_style) values (%L, %L, ''banquet'')', :w1, :reception),
  '23514', 'a service style is one of the four');

-- The upsert the colour-by action makes (an unchecked always-failing upsert once lost every RSVP answer).
insert into public.seating_plans (wedding_id, event_id, colour_by) values (:w1, :reception, 'dietary')
  on conflict (event_id) do update set colour_by = excluded.colour_by;
insert into public.seating_plans (wedding_id, event_id, colour_by) values (:w1, :reception, 'q:abc')
  on conflict (event_id) do update set colour_by = excluded.colour_by;
select pg_temp.expect((select count(*) from public.seating_plans where event_id = :reception and colour_by = 'q:abc'), 1,
  'the colour-by upsert inserts, then updates');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception), 1, '… and makes one layout');
rollback;

-- ---------------------------------------------------------------------------
-- 2. State version 2 round-trips
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

insert into public.seating_plans (wedding_id, event_id, room_width_cm, room_depth_cm, colour_by, service_style, menu, settings)
values (:w1, :reception, 2400, 1800, 'q:abc', 'shared',
        '[{"id":"c1","name":"Mains","style":"shared","dishes":[{"id":"d1","name":"Lamb","serves":6}]}]',
        '{"longTableCm":240}');
insert into public.seating_table_styles (id, wedding_id, name, place) values (:style1, :w1, 'Garden round', '{"charger":true}');
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order, style_id, style_changes, platter_counts)
values (:t1, :w1, :reception, 'Table 1', 8, 1, :style1, '{"add":["bud vases"]}', '{"d1":3}');
-- a second space, with a drawing and a table in it
insert into public.seating_spaces (id, wedding_id, layout_id, name, sort_order, drawing)
values (:sp2, :w1, (select id from public.seating_layouts where event_id = :reception and is_live), 'Terrace', 1,
        '{"walls":[{"a":[0,0],"b":[500,0]}]}');
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order, space_id)
values (:t2, :w1, :reception, 'Terrace 1', 6, 2, :sp2);
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm, quantity, vendor_id, space_id)
values (:w1, :reception, 'floral_arch', 200, 100, 200, 60, 2, :vendor, :sp2);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index, own_plate, kids_meal, decline_kept_at)
values (:w1, :reception, :chidi, :t1, 0, '{"c1":true}', '{"c1":false}', '2026-11-20T00:00:00Z');

create temp table saved as select public.seating_state(:reception) as s, public.seating_state_hash(:reception) as h;
select pg_temp.expect((select (s->>'version')::int from saved), 2, 'the state is version 2');
select pg_temp.expect((select jsonb_array_length(s->'spaces') from saved), 2, '… with both spaces');

-- change everything, then put it back
update public.seating_tables set label = 'Renamed', style_id = null, style_changes = null, platter_counts = null;
update public.seating_spaces set drawing = '{}' where id = :sp2;
update public.seating_plans set service_style = 'plated', menu = '[]', settings = '{}', colour_by = null where event_id = :reception;
update public.seat_assignments set own_plate = '{}', kids_meal = '{}', decline_kept_at = null;
delete from public.seating_fixtures;

-- the guard: the plan no longer hashes to the saved hash, so a restore that expects it is refused
select pg_temp.expect_error(format(
  'select public.restore_seating_state(%L, (select s from saved), %L)', :reception, (select h from saved)),
  '40001', 'a restore refuses when the plan changed since the hash it expected');

select public.restore_seating_state(:reception, (select s from saved), null);

select pg_temp.expect_true(
  (select t.label = 'Table 1' and t.style_id = :style1 and t.style_changes = '{"add":["bud vases"]}' and t.platter_counts = '{"d1":3}'
     from public.seating_tables t where t.id = :t1),
  'a restored table has its style, per-table changes and platter counts');
select pg_temp.expect_true(
  (select t.space_id = :sp2 from public.seating_tables t where t.id = :t2),
  'a table in the second space is back in the second space');
select pg_temp.expect_true(
  (select s.drawing = '{"walls":[{"a":[0,0],"b":[500,0]}]}' from public.seating_spaces s where s.id = :sp2),
  'the second space''s drawing is back');
select pg_temp.expect_true(
  (select f.quantity = 2 and f.vendor_id = :vendor and f.space_id = :sp2 from public.seating_fixtures f where f.kind = 'floral_arch'),
  'a décor item has its quantity, supplier and space');
select pg_temp.expect_true(
  (select a.own_plate = '{"c1":true}' and a.kids_meal = '{"c1":false}' and a.decline_kept_at is not null
     from public.seat_assignments a where a.guest_id = :chidi),
  'a seat has its own-plate flags and kept-decline mark');
select pg_temp.expect_true(
  (select p.service_style = 'shared' and p.colour_by = 'q:abc' and p.settings = '{"longTableCm":240}'
          and p.menu->0->'dishes'->0->>'name' = 'Lamb'
     from public.seating_plans p where p.event_id = :reception),
  'the plan has its service style, colour-by, settings and menu');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception), 1, 'and no extra layout was made');
select pg_temp.expect_true((select public.seating_state_hash(:reception) = (select h from saved)), 'the restored plan hashes to the saved hash');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Older and stale payloads
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity) values (:t1, :w1, :reception, 'Table 1', 8);
insert into public.seating_spaces (id, wedding_id, layout_id, name, sort_order)
values (:sp2, :w1, (select id from public.seating_layouts where event_id = :reception and is_live), 'Terrace', 1);

-- version 1, as an older History entry has it
select public.restore_seating_state(:reception, jsonb_build_object(
  'version', 1,
  'plan', jsonb_build_object('room_width_cm', 2200, 'room_depth_cm', 1600),
  'tables', jsonb_build_array(jsonb_build_object('id', :t2::text, 'label', 'Old table', 'shape', 'round', 'capacity', 6)),
  'fixtures', '[]'::jsonb, 'assignments', '[]'::jsonb, 'avoid_rules', '[]'::jsonb), null);
select pg_temp.expect_true(
  (select t.label = 'Old table' and t.space_id is not null and t.style_id is null from public.seating_tables t where t.id = :t2),
  'a version 1 payload restores, into a space, with defaults');
select pg_temp.expect((select count(*) from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id where l.event_id = :reception), 2,
  'and it leaves the spaces alone');
select pg_temp.expect_true(
  (select p.service_style = 'plated' and p.menu = '[]' from public.seating_plans p where p.event_id = :reception),
  'and the plan takes the default service style and menu');

-- a payload naming a style and a vendor that don't exist
select public.restore_seating_state(:reception, jsonb_build_object(
  'version', 2,
  'plan', jsonb_build_object('room_width_cm', 2200, 'room_depth_cm', 1600),
  'tables', jsonb_build_array(jsonb_build_object('id', :t1::text, 'label', 'T', 'shape', 'round', 'capacity', 4,
                                                 'style_id', '57100000-0000-4000-8000-0000000000ff')),
  'fixtures', jsonb_build_array(jsonb_build_object('id', 'f1000000-0000-4000-8000-000000000001', 'kind', 'plant',
                                'pos_x_cm', 0, 'pos_y_cm', 0, 'width_cm', 60, 'depth_cm', 60,
                                'vendor_id', 'e0000000-0000-4000-8000-0000000000ee')),
  'assignments', '[]'::jsonb, 'avoid_rules', '[]'::jsonb), null);
select pg_temp.expect_true(
  (select t.style_id is null from public.seating_tables t where t.id = :t1) and
  (select f.vendor_id is null from public.seating_fixtures f where f.kind = 'plant'),
  'a style or vendor that is gone is dropped, not failed on');
select pg_temp.expect_error(format(
  'select public.restore_seating_state(%L, ''{"version":3}''::jsonb, null)', :reception),
  'P0001', 'a version 3 payload is refused');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Tenancy of the new tables
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_table_styles (id, wedding_id, name) values (:style1, :w1, 'Garden round');
insert into public.seating_custom_items (wedding_id, name) values (:w1, 'Neon sign');
insert into public.seating_marquees (wedding_id, name, width_cm, length_cm) values (:w1, 'Our marquee', 900, 1500);
insert into public.seating_tables (id, wedding_id, event_id, label, capacity) values (:t1, :w1, :reception, 'Table 1', 8);
insert into public.seating_item_counts (wedding_id, layout_id, item_key, final_count)
values (:w1, (select id from public.seating_layouts where event_id = :reception and is_live), 'utensil', 12);
insert into public.seating_share_links (wedding_id, event_id, token_hash) values (:w1, :reception, 'hash1');
select pg_temp.expect((select count(*) from public.seating_table_styles), 1, 'a collaborator sees their style');

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect((select count(*) from public.seating_table_styles where wedding_id = :w1), 0, 'the second account sees none of its styles');
select pg_temp.expect((select count(*) from public.seating_custom_items where wedding_id = :w1), 0, '… none of its custom items');
select pg_temp.expect((select count(*) from public.seating_marquees where wedding_id = :w1), 0, '… none of its marquees');
select pg_temp.expect((select count(*) from public.seating_item_counts where wedding_id = :w1), 0, '… none of its counts');
select pg_temp.expect((select count(*) from public.seating_share_links where wedding_id = :w1), 0, '… none of its share links');
select pg_temp.expect_error(format(
  'insert into public.seating_table_styles (wedding_id, name) values (%L, ''Mine'')', :w1), '42501', 'and cannot add a style to it');
rollback;

begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_error(format(
  'insert into public.seating_item_counts (wedding_id, layout_id, item_key) values (%L, %L, ''x'')',
  :w1, '00000000-0000-4000-8000-000000000000'), '23503', 'a count needs a real layout');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Dietary needs
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.guest_dietary_needs (wedding_id, guest_id, tag, is_allergy) values (:w1, :chidi, 'shellfish', true);
insert into public.guest_dietary_needs (wedding_id, guest_id, tag, other_text) values (:w1, :chidi, 'other', 'no onion');
select pg_temp.expect((select count(*) from public.guest_dietary_needs where guest_id = :chidi), 2, 'a guest has several needs');
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag) values (%L, %L, ''shellfish'')', :w1, :chidi),
  '23505', 'one row per guest and tag');
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag) values (%L, %L, ''other'')', :w1, :ngozi),
  '23514', '"other" needs its text');
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag, other_text) values (%L, %L, ''vegan'', ''x'')', :w1, :ngozi),
  '23514', 'text belongs to "other" only');
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag) values (%L, %L, ''pizza'')', :w1, :ngozi),
  '23514', 'the tag is from the list');
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag) values (%L, %L, ''vegan'')',
  '22222222-2222-4222-8222-222222222222', :ngozi), '42501', 'a need can''t be filed under another wedding');

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect((select count(*) from public.guest_dietary_needs where wedding_id = :w1), 0, 'the second account sees none of them');
rollback;
