-- ===========================================================================
-- Run sheet tests (spec 5, part B)
-- ===========================================================================
-- starts_at/ends_at/conflict are computed, never stored — same "duplicated
-- deliberately, tested against both suites" pattern src/lib/run-sheet.ts's
-- own header describes. Mirrors run-sheet.test.ts one for one where the
-- cases overlap.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set wedding '''11111111-1111-4111-8111-111111111111'''
\set event '''e1111111-1111-4111-8111-111111111111'''

create or replace function pg_temp.expect_ts(actual timestamptz, wanted timestamptz, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_bool(actual boolean, wanted boolean, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

begin;
set local role service_role;

insert into public.run_sheet_items
  (id, wedding_id, event_id, title, pinned, pinned_at, duration_minutes, predecessor_id, offset_minutes) values
  ('f0000000-0000-4000-8000-000000000001', :wedding, :event, 'Ceremony', true, '2027-06-12 13:00:00+01', 30, null, 0),
  ('f0000000-0000-4000-8000-000000000002', :wedding, :event, 'Photos', false, null, 90,
    'f0000000-0000-4000-8000-000000000001', 0),
  ('f0000000-0000-4000-8000-000000000003', :wedding, :event, 'Reception', true, '2027-06-12 14:30:00+01', 60, null, 0),
  ('f0000000-0000-4000-8000-000000000004', :wedding, :event, 'Evening party', false, null, 60, null, 0);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect_ts(
  (select starts_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000001'),
  '2027-06-12 13:00:00+01', 'ceremony starts at its own pin');
select pg_temp.expect_ts(
  (select ends_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000001'),
  '2027-06-12 13:30:00+01', 'ceremony ends 30 minutes later');

select pg_temp.expect_ts(
  (select starts_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000002'),
  '2027-06-12 13:30:00+01', 'photos start when the ceremony ends');
select pg_temp.expect_ts(
  (select ends_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000002'),
  '2027-06-12 15:00:00+01', 'photos run 90 minutes');

-- Photos (ends 15:00) run past reception's fixed 14:30 start — conflict.
select pg_temp.expect_bool(
  (select conflict from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000002'),
  true, 'photos conflict with the reception pin');
select pg_temp.expect_bool(
  (select conflict from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000001'),
  false, 'the ceremony itself has no conflict');
select pg_temp.expect_bool(
  (select conflict from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000003'),
  false, 'the reception pin itself has no conflict');

-- An unpinned item with no predecessor is "time TBD", not an error, and
-- never flagged as a conflict.
select pg_temp.expect_ts(
  (select starts_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000004'),
  null, 'evening party with no predecessor is time TBD');
select pg_temp.expect_bool(
  (select conflict from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000004'),
  false, 'a time-TBD item is never a conflict');
rollback;

-- ---------------------------------------------------------------------------
-- Moving a pinned anchor recomputes every downstream time with no write to
-- the downstream rows themselves.
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.run_sheet_items
  (id, wedding_id, event_id, title, pinned, pinned_at, duration_minutes, predecessor_id, offset_minutes) values
  ('f0000000-0000-4000-8000-000000000005', :wedding, :event, 'Reception start', true, '2027-06-12 17:00:00+01', 30, null, 0),
  ('f0000000-0000-4000-8000-000000000006', :wedding, :event, 'Mains served', false, null, 60,
    'f0000000-0000-4000-8000-000000000005', 15),
  ('f0000000-0000-4000-8000-000000000007', :wedding, :event, 'Speeches', false, null, 20,
    'f0000000-0000-4000-8000-000000000006', 0);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_ts(
  (select starts_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000007'),
  '2027-06-12 18:45:00+01', 'speeches start after mains, before the anchor moves');

set local role service_role;
update public.run_sheet_items set pinned_at = '2027-06-12 17:15:00+01'
where id = 'f0000000-0000-4000-8000-000000000005';

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_ts(
  (select starts_at from public.v_run_sheet_items where id = 'f0000000-0000-4000-8000-000000000007'),
  '2027-06-12 19:00:00+01', 'speeches shift 15 minutes when the anchor moves, with no write to speeches itself');
rollback;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
-- Literal ids rather than psql :variables — variable interpolation does not
-- reach inside a dollar-quoted plpgsql body, same reason 02_derived.sql's
-- own constraint-test block hard-codes them.
do $$
begin
  begin
    insert into public.run_sheet_items (wedding_id, event_id, title, pinned, pinned_at, duration_minutes)
    values ('11111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111',
      'Bad pin', true, null, 30);
    raise exception 'FAIL — pinned item with no pinned_at accepted';
  exception when check_violation then
    raise notice '  ok  pinned item without pinned_at rejected';
  end;

  begin
    insert into public.run_sheet_items (wedding_id, event_id, title, pinned, duration_minutes)
    values ('11111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111',
      'Bad unpin', false, 30);
    update public.run_sheet_items set pinned_at = now()
    where wedding_id = '11111111-1111-4111-8111-111111111111'
      and event_id = 'e1111111-1111-4111-8111-111111111111'
      and title = 'Bad unpin';
    raise exception 'FAIL — unpinned item with a pinned_at accepted';
  exception when check_violation then
    raise notice '  ok  unpinned item with a pinned_at rejected';
  end;
end;
$$;
rollback;
