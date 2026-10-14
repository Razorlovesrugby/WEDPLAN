-- ===========================================================================
-- The seating plan (spec 33, migration 0036)
-- ===========================================================================
-- What a mistake here would cost, and so what is asserted:
--   1. Tenancy — the second account sees and writes nothing of wedding 1's.
--   2. The schema-level rules: one place per guest per event, one guest per
--      chair, a table from the SAME event, rules naming what their kind needs.
--   3. Snapshots round-trip: restore puts tables back with their ids, skips a
--      guest deleted since, and saves the layout it replaced first.
--   4. The audit trigger fires on a move.
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
\set priya     '''9a000000-0000-4000-8000-000000000005'''
\set dev       '''9a000000-0000-4000-8000-000000000006'''
\set tom       '''9a000000-0000-4000-8000-000000000008'''
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

create or replace function pg_temp.expect_fail(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ok  %', label;
    return;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end;
$$;

-- Two reception tables and one ceremony table, built as alex.
create or replace function pg_temp.build() returns void language sql as $$
  insert into public.seating_tables (id, wedding_id, event_id, label, capacity, sort_order) values
    ('5ea70000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
     'e2222222-2222-4222-8222-222222222222', 'Table 1', 8, 1),
    ('5ea70000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
     'e2222222-2222-4222-8222-222222222222', 'Table 2', 10, 2),
    ('5ea70000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
     'e1111111-1111-4111-8111-111111111111', 'Front pew', 6, 1);
$$;

-- ---------------------------------------------------------------------------
-- 1. Tenancy
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.build();
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :reception, :chidi, :t1);
insert into public.seating_plans (wedding_id, event_id) values (:w1, :reception);
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:w1, :reception, 'dance_floor', 1000, 700, 500, 500);
insert into public.seating_rules (wedding_id, kind, guest_a) values (:w1, 'accessible', :tom);
select pg_temp.expect((select count(*) from public.seating_tables where wedding_id = :w1), 3,
  'a collaborator writes and reads their own tables');

select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect((select count(*) from public.seating_tables where wedding_id = :w1), 0,
  'the second account sees none of wedding 1''s tables');
select pg_temp.expect((select count(*) from public.seat_assignments where wedding_id = :w1), 0,
  '… none of its assignments');
select pg_temp.expect((select count(*) from public.seating_plans where wedding_id = :w1), 0,
  '… none of its plans');
select pg_temp.expect((select count(*) from public.seating_fixtures where wedding_id = :w1), 0,
  '… none of its fixtures');
select pg_temp.expect((select count(*) from public.seating_rules where wedding_id = :w1), 0,
  '… none of its rules');
select pg_temp.expect_fail(
  'insert into public.seating_tables (wedding_id, event_id, label, capacity) values '
  || '(''11111111-1111-4111-8111-111111111111'', ''e2222222-2222-4222-8222-222222222222'', ''Mine now'', 8)',
  'and cannot add a table to it');
update public.seating_tables set label = 'hijacked' where wedding_id = :w1;
select set_config('request.jwt.claim.sub', :alex, true);
select pg_temp.expect((select count(*) from public.seating_tables where label = 'hijacked'), 0,
  'and its update touched nothing');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail('select 1 from public.seating_tables', 'anon cannot read tables at all');
select pg_temp.expect_fail('select 1 from public.seating_snapshots', 'anon cannot read snapshots at all');
rollback;

-- ---------------------------------------------------------------------------
-- 2. Rules the schema enforces
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.build();

insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index)
values (:w1, :reception, :chidi, :t1, 0);

select pg_temp.expect_fail(format(
  'insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id) values (%L, %L, %L, %L)',
  :w1, :reception, :chidi, :t2),
  'one place per guest per event');

select pg_temp.expect_fail(format(
  'insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (%L, %L, %L, %L, 0)',
  :w1, :reception, :ngozi, :t1),
  'one guest per chair');

insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :reception, :ngozi, :t1);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :reception, :priya, :t1);
select pg_temp.expect((select count(*) from public.seat_assignments where table_id = :t1), 3,
  'any number of guests may sit at a table with no chair chosen');

select pg_temp.expect_fail(format(
  'insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id) values (%L, %L, %L, %L)',
  :w1, :reception, :dev, :tc),
  'a reception assignment cannot point at a ceremony table');

insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :ceremony, :chidi, :tc);
select pg_temp.expect((select count(*) from public.seat_assignments where guest_id = :chidi), 2,
  'the same guest has one place at each event');

select pg_temp.expect_fail(format(
  'insert into public.seating_tables (wedding_id, event_id, label, capacity, reserved_seats) values (%L, %L, ''x'', 4, 5)',
  :w1, :reception),
  'reserved seats cannot exceed the table''s seats');
select pg_temp.expect_fail(format(
  'insert into public.seating_tables (wedding_id, event_id, label, capacity) values (%L, %L, ''x'', 0)',
  :w1, :reception),
  'a table has at least one seat');
select pg_temp.expect_fail(format(
  'insert into public.seating_tables (wedding_id, event_id, label, capacity, pos_x_cm) values (%L, %L, ''x'', 8, 100)',
  :w1, :reception),
  'a position is both coordinates or neither');

-- Rules
select pg_temp.expect_fail(format(
  'insert into public.seating_rules (wedding_id, kind, guest_a, guest_b) values (%L, ''apart'', %L, %L)',
  :w1, :ngozi, :chidi),
  'a pair is stored smaller id first');
insert into public.seating_rules (wedding_id, kind, guest_a, guest_b) values (:w1, 'apart', :chidi, :ngozi);
select pg_temp.expect_fail(format(
  'insert into public.seating_rules (wedding_id, kind, guest_a, guest_b) values (%L, ''apart'', %L, %L)',
  :w1, :chidi, :ngozi),
  'the same pair rule is stored once');
insert into public.seating_rules (wedding_id, kind, guest_a, guest_b) values (:w1, 'together', :chidi, :ngozi);
select pg_temp.expect((select count(*) from public.seating_rules where guest_a = :chidi), 2,
  'but a different kind for the same pair is its own rule');
select pg_temp.expect_fail(format(
  'insert into public.seating_rules (wedding_id, kind, guest_a) values (%L, ''avoid_table'', %L)',
  :w1, :tom),
  'avoid_table needs a table');
select pg_temp.expect_fail(format(
  'insert into public.seating_rules (wedding_id, kind, guest_a, guest_b) values (%L, ''accessible'', %L, %L)',
  :w1, :chidi, :ngozi),
  'accessible names one guest only');
select pg_temp.expect_fail(format(
  'insert into public.seating_rules (wedding_id, kind, guest_a) values (%L, ''near'', %L)',
  :w1, :chidi),
  'near needs a second guest');
insert into public.seating_rules (wedding_id, kind, guest_a, table_id) values (:w1, 'avoid_table', :tom, :t2);

delete from public.seating_tables where id = :t2;
select pg_temp.expect((select count(*) from public.seating_rules where kind = 'avoid_table'), 0,
  'deleting a table takes its avoid_table rules with it');
delete from public.seating_tables where id = :t1;
select pg_temp.expect((select count(*) from public.seat_assignments where event_id = :reception), 0,
  'deleting a table returns its guests to the tray');
select pg_temp.expect((select count(*) from public.guests where id in (:chidi, :ngozi, :priya)), 3,
  'and never touches the guests themselves');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Snapshots
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.build();
insert into public.seating_plans (wedding_id, event_id, room_width_cm, room_depth_cm)
values (:w1, :reception, 2400, 1800);
update public.seating_tables set pos_x_cm = 300, pos_y_cm = 400, rotation_deg = 45 where id = :t1;
insert into public.seating_fixtures (wedding_id, event_id, kind, pos_x_cm, pos_y_cm, width_cm, depth_cm)
values (:w1, :reception, 'bar', 100, 100, 300, 80);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values
  (:w1, :reception, :chidi, :t1, 0),
  (:w1, :reception, :ngozi, :t1, 1),
  (:w1, :reception, :tom,   :t2, null);
insert into public.seating_rules (wedding_id, kind, guest_a, table_id) values (:w1, 'avoid_table', :priya, :t2);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :ceremony, :tom, :tc);

create temp table snap as select public.take_seating_snapshot(:reception, 'Draft A') as id;
select pg_temp.expect(
  (select jsonb_array_length(payload->'tables') from public.seating_snapshots where id = (select id from snap)), 2,
  'a snapshot holds only this event''s tables');
select pg_temp.expect(
  (select jsonb_array_length(payload->'assignments') from public.seating_snapshots where id = (select id from snap)), 3,
  '… and its assignments');

-- Change everything.
delete from public.seating_tables where id = :t1;
update public.seat_assignments set table_id = :t1 where false;
insert into public.seating_tables (wedding_id, event_id, label, capacity) values (:w1, :reception, 'New idea', 12);
update public.seating_plans set room_width_cm = 900 where event_id = :reception;
delete from public.seating_fixtures where event_id = :reception;
-- Ngozi is removed from the guest list since the snapshot.
update public.guests set deleted_at = now() where id = :ngozi;

create temp table result as select public.restore_seating_snapshot((select id from snap)) as r;
select pg_temp.expect(((select r from result)->>'tables')::int, 2, 'restore puts both tables back');
select pg_temp.expect(((select r from result)->>'seated')::int, 2, 'and seats everyone still on the list');
select pg_temp.expect(((select r from result)->>'skipped')::int, 1, 'skipping the guest deleted since');
select pg_temp.expect(((select r from result)->>'fixtures')::int, 1, 'the fixture comes back');
select pg_temp.expect_true(exists (select 1 from public.seating_tables where id = :t1 and label = 'Table 1'
                                   and pos_x_cm = 300 and rotation_deg = 45),
  'with the table''s original id and position');
select pg_temp.expect((select count(*) from public.seating_tables where label = 'New idea'), 0,
  'and the layout it replaced is gone');
select pg_temp.expect((select seat_index from public.seat_assignments where guest_id = :chidi and event_id = :reception), 0,
  'chairs come back');
select pg_temp.expect((select room_width_cm from public.seating_plans where event_id = :reception), 2400,
  'the room size comes back');
select pg_temp.expect((select count(*) from public.seating_rules where kind = 'avoid_table' and guest_a = :priya), 1,
  'an avoid_table rule comes back with its table');
select pg_temp.expect((select count(*) from public.seat_assignments where event_id = :ceremony), 1,
  'another event''s plan is untouched');
select pg_temp.expect_true(exists (
    select 1 from public.seating_snapshots
     where automatic and name = 'Before restoring "Draft A"'
       and jsonb_array_length(payload->'tables') = 2),
  'and the layout it replaced was saved first');
rollback;

begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.build();
create temp table snap as select public.take_seating_snapshot(:reception, 'Mine') as id;
select set_config('request.jwt.claim.sub', :stranger, true);
select pg_temp.expect_fail(format('select public.restore_seating_snapshot(%L)', (select id from snap)),
  'the second account cannot restore wedding 1''s snapshot');
select pg_temp.expect_fail(format('select public.take_seating_snapshot(%L, ''x'')', :reception),
  'or snapshot wedding 1''s event');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail(format('select public.take_seating_snapshot(%L, ''x'')', :reception),
  'anon cannot call the snapshot functions');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Audit
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.build();
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id)
values (:w1, :reception, :chidi, :t1);
update public.seat_assignments set table_id = :t2 where guest_id = :chidi and event_id = :reception;
select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'seat_assignments'
    and row_key = jsonb_build_object('guest_id', :chidi, 'event_id', :reception)), 2,
  'seating a guest and moving them are both in the audit log');
create temp table snap as select public.take_seating_snapshot(:reception, 'x') as id;
select pg_temp.expect((select count(*) from public.audit_log where table_name = 'seating_snapshots'), 0,
  'a snapshot is not copied into the audit log');
rollback;
