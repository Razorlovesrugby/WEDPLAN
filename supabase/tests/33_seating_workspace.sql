-- ===========================================================================
-- Seating workspace (spec 53, migration 0053): state, undo guard, snapshots
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set ev '''e2222222-2222-4222-8222-222222222222'''
\set g1 '''9a000000-0000-4000-8000-000000000001'''
\set t1 '''be000000-0000-4000-8000-0000000000a1'''
\set t2 '''be000000-0000-4000-8000-0000000000a2'''

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
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

insert into public.seating_tables (id, wedding_id, event_id, label, shape, capacity, sort_order)
values (:t1, :w1, :ev, 'Table 1', 'round', 8, 1), (:t2, :w1, :ev, 'Table 2', 'round', 8, 2);
insert into public.seat_assignments (wedding_id, event_id, guest_id, table_id, seat_index) values (:w1, :ev, :g1, :t1, 0);

-- The state is stable: the same plan hashes the same, and ignores timestamps
select pg_temp.expect_text(
  (select public.seating_state_hash(:ev) = public.seating_state_hash(:ev))::text, 'true', 'the same plan always hashes the same');
create temp table _before as select public.seating_state(:ev) as state, public.seating_state_hash(:ev) as hash;
update public.seating_tables set updated_at = now() + interval '1 hour' where id = :t1;
select pg_temp.expect_text(
  (select public.seating_state_hash(:ev) = (select hash from _before))::text, 'true', 'timestamps do not change the hash');

-- A change changes the hash; restoring the earlier state puts it back
update public.seat_assignments set table_id = :t2, seat_index = 3 where guest_id = :g1 and event_id = :ev;
select pg_temp.expect_text(
  (select public.seating_state_hash(:ev) <> (select hash from _before))::text, 'true', 'moving a guest changes the hash');
create temp table _after as select public.seating_state_hash(:ev) as hash;
select public.restore_seating_state(:ev, (select state from _before), (select hash from _after));
select pg_temp.expect_text(
  (select table_id::text from public.seat_assignments where guest_id = :g1 and event_id = :ev), 'be000000-0000-4000-8000-0000000000a1',
  'restoring a state puts the guest back');
select pg_temp.expect_text(
  (select (public.seating_state_hash(:ev) = (select hash from _before))::text), 'true', 'and the plan hashes as it did before');

-- Refused when someone changed the plan since
update public.seating_tables set label = 'Top table' where id = :t1;
select pg_temp.expect_error(
  $$select public.restore_seating_state('e2222222-2222-4222-8222-222222222222', (select state from _before), (select hash from _before))$$,
  '40001', 'a restore is refused when the plan changed since');
select pg_temp.expect_text(
  (select label from public.seating_tables where id = :t1), 'Top table', 'and nothing was touched');

-- Deleting a table and undoing it brings its guests back
create temp table _with as select public.seating_state(:ev) as state, public.seating_state_hash(:ev) as hash;
delete from public.seating_tables where id = :t1;
select pg_temp.expect_text(
  (select count(*)::text from public.seat_assignments where event_id = :ev), '0', 'deleting a table removes its seats');
create temp table _gone as select public.seating_state_hash(:ev) as hash;
select public.restore_seating_state(:ev, (select state from _with), (select hash from _gone));
select pg_temp.expect_text(
  (select count(*)::text from public.seat_assignments where event_id = :ev), '1', 'undoing the delete brings the seat back');

-- Blocked chairs are part of the state
insert into public.seating_chairs_blocked (wedding_id, event_id, table_id, seat_index) values (:w1, :ev, :t2, 2);
create temp table _blocked as select public.seating_state(:ev) as state;
delete from public.seating_chairs_blocked where table_id = :t2;
select public.restore_seating_state(:ev, (select state from _blocked), null);
select pg_temp.expect_text(
  (select count(*)::text from public.seating_chairs_blocked where table_id = :t2), '1', 'a blocked chair is restored with the plan');

-- Automatic snapshots keep only the newest 30
do $$
begin
  for i in 1..33 loop
    perform public.take_seating_snapshot('e2222222-2222-4222-8222-222222222222', 'auto ' || i, true, null);
  end loop;
end;
$$;
select pg_temp.expect_text(
  (select count(*)::text from public.seating_snapshots where event_id = :ev and automatic), '30', 'only the newest 30 automatic versions are kept');
select public.take_seating_snapshot(:ev, 'Named copy', false, null);
do $$
begin
  perform public.take_seating_snapshot('e2222222-2222-4222-8222-222222222222', 'auto more', true, null);
end;
$$;
select pg_temp.expect_text(
  (select count(*)::text from public.seating_snapshots where event_id = :ev and not automatic), '1', 'a named copy is kept when automatic ones are pruned');

-- Restoring a snapshot still works through the new functions
select public.restore_seating_snapshot((select id from public.seating_snapshots where event_id = :ev and name = 'Named copy'), null);
select pg_temp.expect_text(
  (select count(*)::text from public.seating_tables where event_id = :ev), '2', 'a snapshot restores through the state function');

-- Check-ins: one per guest per event
insert into public.seating_checkins (wedding_id, event_id, guest_id, by_label) values (:w1, :ev, :g1, 'Venue staff');
select pg_temp.expect_error(
  $$insert into public.seating_checkins (wedding_id, event_id, guest_id, by_label) values ('11111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', '9a000000-0000-4000-8000-000000000001', 'x')$$,
  '23505', 'a guest checks in once per event');

-- Cleanup
delete from public.seating_checkins where event_id = :ev;
delete from public.seating_snapshots where event_id = :ev;
delete from public.seating_tables where event_id = :ev;
