-- ===========================================================================
-- Draft layouts (spec 57 Part G, migration 0059)
-- ===========================================================================
-- Asserted: a guest holds one seat per layout, not per event; trying a layout
-- copies everything with fresh ids and leaves the live one alone; the live
-- views never show a draft; the state functions and snapshots are per layout;
-- making a draft live swaps it in, keeps the old one as a draft, and is
-- refused while the live layout is locked; a deleted draft can't be restored
-- into; and a stranger can do none of it.
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set alex      '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set ceremony  '''e1111111-1111-4111-8111-111111111111'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set chidi     '''9a000000-0000-4000-8000-000000000001'''
\set ngozi     '''9a000000-0000-4000-8000-000000000002'''
\set t1        '''5ea70000-0000-4000-8000-000000000001'''
\set t2        '''5ea70000-0000-4000-8000-000000000002'''

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
-- 1. Trying a layout
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order, pos_x_cm, pos_y_cm)
values (:t1, :w1, :reception, 'Table 1', 8, 1, 500, 500), (:t2, :w1, :reception, 'Table 2', 8, 2, 900, 500);
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:w1, :reception, 'dance_floor', 1000, 700, 500, 500);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index)
values (:w1, :reception, :chidi, :t1, 0), (:w1, :reception, :ngozi, :t2, 3);
insert into public.seating_chairs_blocked (wedding_id, event_id, table_id, seat_index) values (:w1, :reception, :t1, 5);
insert into public.seating_rules (wedding_id, kind, guest_a, table_id) values (:w1, 'avoid_table', :chidi, :t2);
insert into public.seating_item_counts (wedding_id, layout_id, item_key, final_count)
select :w1, id, 'utensil', 60 from public.seating_layouts where event_id = :reception and is_live;

create temp table ids as
  select (select id from public.seating_layouts where event_id = :reception and is_live) as live,
         (select s.id from public.seating_spaces s join public.seating_layouts l on l.id = s.layout_id
           where l.event_id = :reception and l.is_live) as live_space;
update public.seating_spaces set drawing = '{"walls":[]}'::jsonb, name = 'Hall'
 where id = (select live_space from ids);

create temp table draft as
  select public.seating_try_layout(:reception, (select live from ids), 'Long tables') as id;

select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception and not is_live and deleted_at is null), 1,
  'trying a layout makes one draft');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception and is_live), 1,
  '… and the live layout is still the only live one');
select pg_temp.expect((select count(*) from public.seating_tables where layout_id = (select id from draft)), 2, 'the draft has both tables');
select pg_temp.expect((select count(*) from public.seating_fixtures where layout_id = (select id from draft)), 1, '… the fixture');
select pg_temp.expect((select count(*) from public.seat_assignments where layout_id = (select id from draft)), 2, '… and both seats');
select pg_temp.expect((select count(*) from public.seating_chairs_blocked b join public.seating_tables t on t.id = b.table_id
                        where t.layout_id = (select id from draft)), 1, '… and the blocked chair');
select pg_temp.expect((select count(*) from public.seating_rules r join public.seating_tables t on t.id = r.table_id
                        where t.layout_id = (select id from draft)), 1, '… and the avoid-table rule');
select pg_temp.expect((select final_count from public.seating_item_counts where layout_id = (select id from draft) and item_key = 'utensil'), 60,
  '… and the final item counts');
select pg_temp.expect((select count(*) from public.seating_tables where layout_id = (select live from ids)), 2, 'the live layout kept its tables');
select pg_temp.expect_true(
  (select count(*) = 0 from public.seating_tables d join public.seating_tables l on l.id = d.id
    where d.layout_id = (select id from draft) and l.layout_id = (select live from ids)),
  'the copies have fresh ids');
select pg_temp.expect_true(
  (select s.drawing = '{"walls":[]}'::jsonb and s.name = 'Hall' and s.layout_id = (select id from draft)
     from public.seating_spaces s where s.layout_id = (select id from draft)),
  'the space came with its drawing and name');
select pg_temp.expect_true(
  (select bool_and(t.space_id in (select id from public.seating_spaces where layout_id = (select id from draft)))
     from public.seating_tables t where t.layout_id = (select id from draft)),
  'the copied tables lie in the copied space');
select pg_temp.expect((select count(*) from public.seat_assignments where guest_id = :chidi), 2,
  'a guest holds one seat in each layout');

-- One seat per guest per layout.
select pg_temp.expect_error(format(
  'insert into public.seat_assignments (wedding_id, event_id, layout_id, guest_id, table_id) values (%L, %L, %L, %L, %L)',
  :w1, :reception, (select id from draft), :chidi,
  (select id from public.seating_tables where layout_id = (select id from draft) order by sort_order limit 1)),
  '23505', 'but not two seats in one layout');

-- Moving in the draft never moves them in the live layout.
update public.seat_assignments set table_id = (select id from public.seating_tables where layout_id = (select id from draft) and label = 'Table 2'),
                                   seat_index = 1
 where guest_id = :chidi and layout_id = (select id from draft);
select pg_temp.expect_true(
  (select a.table_id = :t1 and a.seat_index = 0 from public.seat_assignments a
    where a.guest_id = :chidi and a.layout_id = (select live from ids)),
  'moving a guest in a draft leaves the live seat where it was');

-- What guests and day links read.
select pg_temp.expect((select count(*) from public.v_live_seat_assignments where event_id = :reception), 2, 'the live view shows two seats');
select pg_temp.expect_true(
  (select table_id = :t1 from public.v_live_seat_assignments where guest_id = :chidi),
  '… the live ones, not the draft''s');
select pg_temp.expect((select count(*) from public.v_live_seating_tables where event_id = :reception), 2, 'the live table view shows only the live tables');

-- A draft can be renamed and soft-deleted; the live one can't.
update public.seating_layouts set name = 'Round tables' where id = (select id from draft);
select pg_temp.expect_error(format(
  'update public.seating_layouts set deleted_at = now() where id = %L', (select live from ids)),
  '23514', 'the live layout can''t be deleted');
rollback;

-- ---------------------------------------------------------------------------
-- 2. State, hash and snapshots are per layout
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order) values (:t1, :w1, :reception, 'Table 1', 8, 1);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :reception, :chidi, :t1, 0);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;
create temp table draft as select public.seating_try_layout(:reception, (select live from ids), 'Draft') as id;

create temp table h0 as
  select public.seating_state_hash(:reception) as live_h, public.seating_state_hash(:reception, (select id from draft)) as draft_h;
select pg_temp.expect_true((select live_h <> draft_h from h0), 'the live layout and its copy hash differently (different ids)');

-- Change the draft: add a table.
insert into public.seating_tables (wedding_id, event_id, label, capacity, layout_id) values (:w1, :reception, 'Table 9', 6, (select id from draft));
select pg_temp.expect((select jsonb_array_length(public.seating_state(:reception, (select id from draft))->'tables')), 2, 'the draft''s state has its two tables');
select pg_temp.expect((select jsonb_array_length(public.seating_state(:reception)->'tables')), 1, 'the live state (no layout given) still has one');
select pg_temp.expect_true((select public.seating_state_hash(:reception) = live_h from h0), 'adding to a draft doesn''t change the live hash');

-- A snapshot of the draft, then wreck the draft, then restore it.
create temp table snap as select public.take_seating_snapshot(:reception, 'Draft v1', false, null, (select id from draft)) as id;
select pg_temp.expect_true((select layout_id = (select id from draft) from public.seating_snapshots where id = (select id from snap)),
  'a snapshot names the layout it was taken from');
delete from public.seating_tables where layout_id = (select id from draft) and label = 'Table 9';
select public.restore_seating_snapshot((select id from snap));
select pg_temp.expect((select count(*) from public.seating_tables where layout_id = (select id from draft)), 2, 'restoring a draft''s snapshot puts its tables back');
select pg_temp.expect((select count(*) from public.seating_tables where layout_id = (select live from ids)), 1, '… and leaves the live layout alone');

-- The undo guard still refuses a changed layout.
select pg_temp.expect_error(format(
  'select public.restore_seating_state(%L, public.seating_state(%L, %L), %L, %L)',
  :reception, :reception, (select id from draft), 'stale-hash', (select id from draft)), '40001', 'a stale hash is still refused for a draft');

-- Automatic snapshots are pruned per layout.
select public.take_seating_snapshot(:reception, 'auto ' || g, true, null, (select id from draft)) from generate_series(1, 32) g;
select pg_temp.expect((select count(*) from public.seating_snapshots where layout_id = (select id from draft) and automatic), 30,
  'only the newest 30 automatic snapshots of a layout are kept');

-- A deleted draft can't be restored into.
update public.seating_layouts set deleted_at = now() where id = (select id from draft);
select pg_temp.expect_error(format('select public.restore_seating_snapshot(%L)', (select id from snap)), 'P0002',
  'a snapshot of a deleted draft can''t be restored');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Making a draft live
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order) values (:t1, :w1, :reception, 'Table 1', 8, 1);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :reception, :chidi, :t1, 0);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;
create temp table draft as select public.seating_try_layout(:reception, (select live from ids), 'Long tables') as id;
update public.seating_tables set label = 'Long A' where layout_id = (select id from draft);

select public.seating_make_live(:reception, (select id from draft));
select pg_temp.expect_true((select is_live from public.seating_layouts where id = (select id from draft)), 'the draft is now live');
select pg_temp.expect_true((select not is_live and deleted_at is null from public.seating_layouts where id = (select live from ids)),
  'the old live layout is a draft');
select pg_temp.expect_true((select name like 'Main (before %)' from public.seating_layouts where id = (select live from ids)),
  '… named for what it was and when');
select pg_temp.expect((select count(*) from public.seating_layouts where event_id = :reception and is_live), 1, 'there is still exactly one live layout');
select pg_temp.expect_true((select t.label = 'Long A' from public.v_live_seating_tables t where t.event_id = :reception),
  'the live table view now shows the swapped-in tables');
select pg_temp.expect((select count(*) from public.v_live_seat_assignments where event_id = :reception and guest_id = :chidi), 1,
  'the guest has one live seat');

-- And back again, the same way.
select public.seating_make_live(:reception, (select live from ids));
select pg_temp.expect_true((select is_live from public.seating_layouts where id = (select live from ids)), 'the swap can be reversed');

-- Refusals.
select pg_temp.expect_error(format('select public.seating_make_live(%L, %L)', :reception, (select live from ids)), '22023',
  'a layout that is already live can''t be made live');
update public.seating_layouts set locked_at = now(), locked_by = :alex where id = (select live from ids);
select pg_temp.expect_error(format('select public.seating_make_live(%L, %L)', :reception, (select id from draft)), '55000',
  'a locked live layout can''t be swapped out');
select pg_temp.expect_error(format('select public.seating_make_live(%L, %L)', :ceremony, (select id from draft)), 'P0002',
  'a layout of another event isn''t found');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Limits and tenancy
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order) values (:t1, :w1, :reception, 'Table 1', 8, 1);
create temp table ids as select (select id from public.seating_layouts where event_id = :reception and is_live) as live;

select pg_temp.expect_error(format('select public.seating_try_layout(%L, %L, %L)', :reception, (select live from ids), '   '), '22023',
  'a draft needs a name');
select public.seating_try_layout(:reception, (select live from ids), 'Draft ' || g) from generate_series(1, 20) g;
select pg_temp.expect_error(format('select public.seating_try_layout(%L, %L, %L)', :reception, (select live from ids), 'One too many'), '54000',
  'twenty drafts is the most');

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect_error(format('select public.seating_try_layout(%L, %L, %L)', :reception, (select live from ids), 'Mine'), 'P0002',
  'a stranger can''t copy another wedding''s layout');
select pg_temp.expect((select count(*) from public.v_live_seat_assignments), 0, 'a stranger sees no live seats');
select pg_temp.expect((select count(*) from public.v_live_seating_tables), 0, '… and no live tables');
rollback;

begin;
set local role anon;
select pg_temp.expect_error('select 1 from public.v_live_seat_assignments', '42501', 'anon cannot read the live seat view');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Big blocks (migration 0060)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, shape, capacity) values (%L, %L, ''Big'', ''round'', 61)', :w1, :reception),
  '23514', 'a dinner table still holds sixty at most');
insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, rows_count)
values (:w1, :reception, 'Ceremony', 'rows', 240, 12);
insert into public.seating_tables (wedding_id, event_id, label, shape, capacity)
values (:w1, :reception, 'Long run', 'banquet', 120);
select pg_temp.expect((select count(*) from public.seating_tables where capacity > 60), 2, 'ceremony rows and a banquet run can be bigger');
select pg_temp.expect_error(format(
  'insert into public.seating_tables (wedding_id, event_id, label, shape, capacity, rows_count) values (%L, %L, ''Too big'', ''rows'', 401, 10)', :w1, :reception),
  '23514', 'but not past four hundred');
rollback;
