-- ===========================================================================
-- Blocks that know things (spec 25, migrations 0026 and 0027)
-- ===========================================================================
-- Three properties are worth asserting here, because each one is load-bearing
-- and each one fails silently:
--
--   1. The backfill lifts dress codes out of JSONB without guessing. A payload
--      written months ago by an older app is untrusted input, and a migration
--      that aborts on one malformed entry takes the whole deploy with it.
--
--   2. A vote cannot be anonymous. Spec 25's answer to question 4 is enforced
--      by `song_votes.household_id being NOT NULL` rather than by an if
--      statement somebody can later tidy away.
--
--   3. Deleting something a guest pointed at does not delete the guest's
--      contribution. A household leaving the list must not take their
--      guestbook note with it.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set ev1      '''e1111111-1111-4111-8111-111111111111'''
\set ev3      '''e3333333-3333-4333-8333-333333333333'''
\set hh1      '''d0000000-0000-4000-8000-000000000001'''
\set hh2      '''d0000000-0000-4000-8000-000000000002'''
\set song1    '''ba000000-0000-4000-8000-000000000001'''

create or replace function pg_temp.expect(actual int, wanted int, label text)
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

-- ---------------------------------------------------------------------------
-- 1. An event points at a dress code, and the code knows its events back
-- ---------------------------------------------------------------------------
-- The reverse lookup is what renders "FOR WELCOME DINNER, FAREWELL BRUNCH"
-- under a code. It is a query, never a typed list, so it cannot disagree with
-- the tags on the schedule.
begin;
select pg_temp.expect(
  (select count(*)::int from public.dress_codes where wedding_id = :w1),
  2,
  'the seeded wedding has two dress codes');

select pg_temp.expect(
  (select count(*)::int from public.events
    where wedding_id = :w1 and dress_code_id is not null),
  3,
  'and all three events carry one');

select pg_temp.expect(
  (select count(*)::int from public.events e
     join public.dress_codes d on d.id = e.dress_code_id
    where d.name = 'Lounge suits, summer dresses'),
  2,
  'the daytime code covers two events — the reverse lookup the attire block renders');

select pg_temp.expect(
  (select count(*)::int from public.dress_code_notes
    where dress_code_id = 'dc000000-0000-4000-8000-000000000001'),
  2,
  'and carries two labelled notes');

select pg_temp.expect_true(
  (select bool_and(label <> '') from public.dress_code_notes where wedding_id = :w1),
  'every note has a label — the schema takes no view on what it says');
rollback;

-- ---------------------------------------------------------------------------
-- 2. The backfill: two spellings are two codes, on purpose
-- ---------------------------------------------------------------------------
-- Merging "Formal summer" and "formal Summer" is a judgement about what
-- somebody meant. A migration is the worst place in the system to make one,
-- so it makes neither — the planner merges them in an afternoon.
begin;
insert into public.site_blocks (wedding_id, type, payload, sort_order) values
  (:w2, 'schedule',
   jsonb_build_object('events', jsonb_build_array(
     jsonb_build_object('id', '00000000-0000-4000-8000-0000000000aa', 'dress_code', 'Formal summer'),
     jsonb_build_object('id', '00000000-0000-4000-8000-0000000000bb', 'dress_code', 'formal Summer'),
     jsonb_build_object('id', '00000000-0000-4000-8000-0000000000cc', 'dress_code', '   ')
   )), 0);

-- Re-run the backfill's own shape against this block.
with entries as (
  select b.wedding_id,
         case when (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (e ->> 'id')::uuid end as event_id,
         btrim(e ->> 'dress_code') as name
    from public.site_blocks b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.payload -> 'events') = 'array' then b.payload -> 'events'
           else '[]'::jsonb end) e
   where b.type = 'schedule' and b.wedding_id = :w2
)
select pg_temp.expect(
  (select count(distinct name)::int from entries where name is not null and name <> ''),
  2,
  'two spellings of the same words are two codes, not one guess');
rollback;

-- ---------------------------------------------------------------------------
-- 3. The backfill survives a payload written by a different app
-- ---------------------------------------------------------------------------
-- `(e ->> 'id')::uuid` on "not-a-uuid" aborts the migration and therefore the
-- deploy. A WHERE guard is not enough — nothing orders the filter before the
-- cast — so the migration uses CASE, which short-circuits. This asserts that
-- the shape it uses actually survives rubbish.
begin;
insert into public.site_blocks (wedding_id, type, payload, sort_order) values
  (:w2, 'schedule',
   '{"events":[{"id":"not-a-uuid","dress_code":"Black tie"},
               {"id":null,"dress_code":"Black tie"},
               {"dress_code":"Black tie"}]}'::jsonb, 10),
  -- `events` as an object rather than an array: jsonb_array_elements would
  -- throw, which is why the migration type-checks it first.
  (:w2, 'schedule', '{"events":{"nope":true}}'::jsonb, 20);

with entries as (
  select case when (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (e ->> 'id')::uuid end as event_id
    from public.site_blocks b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.payload -> 'events') = 'array' then b.payload -> 'events'
           else '[]'::jsonb end) e
   where b.type = 'schedule' and b.wedding_id = :w2
)
select pg_temp.expect(
  (select count(*)::int from entries where event_id is not null),
  0,
  'a malformed payload yields no rows rather than aborting the migration');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Deleting a dress code does not delete the events wearing it
-- ---------------------------------------------------------------------------
-- The FK is composite, so a plain `set null` would null `wedding_id` too.
-- `set null (dress_code_id)` is the column-specific form.
begin;
delete from public.dress_codes where id = 'dc000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select count(*)::int from public.events where wedding_id = :w1),
  3,
  'deleting a dress code keeps every event');
select pg_temp.expect_true(
  (select bool_and(wedding_id = :w1) from public.events where wedding_id is not null
    and id in (:ev1, :ev3)),
  'and keeps their wedding_id, which a plain "set null" would have wiped');
select pg_temp.expect(
  (select count(*)::int from public.dress_code_notes
    where dress_code_id = 'dc000000-0000-4000-8000-000000000001'),
  0,
  'its notes go with it, though — they are part of the code');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Travel: nullable everywhere, and a cost range that cannot be backwards
-- ---------------------------------------------------------------------------
-- 0017 refused cost and duration because a wedding down the road would show
-- five empty columns. Every column added here is nullable for exactly that
-- reason, and the seed carries a row with none of them filled.
begin;
select pg_temp.expect(
  (select count(*)::int from public.transport_options
    where wedding_id = :w1 and duration_minutes is null and cost_low is null),
  1,
  'a transport option with no figures at all is still legal');

select pg_temp.expect(
  (select count(*)::int from public.arrival_points where wedding_id = :w1),
  2,
  'two arrival points');

select pg_temp.expect_fail(
  'insert into public.transport_options (wedding_id, kind, name, cost_low, cost_high)
   values (''11111111-1111-4111-8111-111111111111'', ''taxi'', ''Backwards'', 9000, 1000)',
  'a cost range whose high is below its low is refused');

select pg_temp.expect_fail(
  'insert into public.transport_options (wedding_id, kind, name, duration_minutes)
   values (''11111111-1111-4111-8111-111111111111'', ''taxi'', ''Time travel'', -30)',
  'a negative duration is refused');
rollback;

-- ---------------------------------------------------------------------------
-- 6. A coach run knows its event, or knows it serves the weekend
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect(
  (select count(*)::int from public.coach_runs where wedding_id = :w1 and event_id is not null),
  1,
  'one run serves a named event, so the schedule can render it inline');
select pg_temp.expect(
  (select count(*)::int from public.coach_runs where wedding_id = :w1 and event_id is null),
  1,
  'and one serves the weekend, which is how every run behaved before 0026');

delete from public.events where id = :ev3;
select pg_temp.expect(
  (select count(*)::int from public.coach_runs where wedding_id = :w1),
  2,
  'deleting the event keeps the coach run');
rollback;

-- ---------------------------------------------------------------------------
-- 7. A vote cannot be anonymous
-- ---------------------------------------------------------------------------
-- This is spec 25's answer to question 4, in the database rather than in a
-- code path. Without identity, "one vote each" is a cookie.
begin;
select pg_temp.expect_fail(
  'insert into public.song_votes (wedding_id, song_request_id, household_id)
   values (''11111111-1111-4111-8111-111111111111'',
           ''ba000000-0000-4000-8000-000000000001'', null)',
  'a vote with no household is refused by the schema, not by an if statement');

select pg_temp.expect_fail(
  'insert into public.song_votes (wedding_id, song_request_id, household_id)
   values (''11111111-1111-4111-8111-111111111111'',
           ''ba000000-0000-4000-8000-000000000001'',
           ''d0000000-0000-4000-8000-000000000002'')',
  'and a household cannot vote for the same song twice');

select pg_temp.expect(
  (select count(*)::int from public.song_votes where song_request_id = :song1),
  2,
  'the seeded song has two votes');
rollback;

-- ---------------------------------------------------------------------------
-- 8. The moderation rule, as the seed demonstrates it
-- ---------------------------------------------------------------------------
-- A note carrying a household was published on arrival; one from the shared
-- page is waiting. The rule itself lives in one application function, but the
-- two states have to be expressible here or it has nowhere to write its answer.
begin;
select pg_temp.expect(
  (select count(*)::int from public.guest_notes
    where wedding_id = :w1 and household_id is not null and status = 'approved'),
  1,
  'a note from a household link is published');
select pg_temp.expect(
  (select count(*)::int from public.guest_notes
    where wedding_id = :w1 and household_id is null and status = 'new'),
  1,
  'a note from the shared page waits');

select pg_temp.expect_fail(
  'insert into public.guest_notes (wedding_id, body, status)
   values (''11111111-1111-4111-8111-111111111111'', ''Hello'', ''played'')',
  'a note cannot be marked played — that rung belongs to a song');

select pg_temp.expect_fail(
  'insert into public.guest_notes (wedding_id, body)
   values (''11111111-1111-4111-8111-111111111111'', repeat(''x'', 501))',
  'and it cannot run past 500 characters, checked here rather than only in a form');
rollback;

-- ---------------------------------------------------------------------------
-- 9. A household leaving does not take its contributions with it
-- ---------------------------------------------------------------------------
-- Guest data is never hard-deleted (the platform rule), but a household CAN be
-- removed, and a guestbook note is the couple's to keep. The vote goes, because
-- a vote is an assertion by somebody who is no longer on the list.
begin;
delete from public.households where id = :hh1;
select pg_temp.expect(
  (select count(*)::int from public.guest_notes where wedding_id = :w1),
  2,
  'the note survives its household, without the attribution');
select pg_temp.expect_true(
  (select household_id is null from public.guest_notes
    where id = 'bd000000-0000-4000-8000-000000000001'),
  'and its household link is nulled rather than dangling');

delete from public.households where id = :hh2;
select pg_temp.expect(
  (select count(*)::int from public.song_votes where song_request_id = :song1),
  1,
  'a vote goes with the household that cast it');
rollback;

-- ---------------------------------------------------------------------------
-- 10. RLS on all five new tables, from another wedding's account
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect((select count(*)::int from public.dress_codes), 0,
  'the other wedding''s collaborator sees no dress codes');
select pg_temp.expect((select count(*)::int from public.dress_code_notes), 0,
  'nor their notes');
select pg_temp.expect((select count(*)::int from public.arrival_points), 0,
  'nor their arrival points');
select pg_temp.expect((select count(*)::int from public.song_votes), 0,
  'nor who voted for what');
select pg_temp.expect((select count(*)::int from public.guest_notes), 0,
  'nor a single guestbook note');
rollback;
