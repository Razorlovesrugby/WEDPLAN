-- ===========================================================================
-- Derived-value tests
-- ===========================================================================
-- tier and seats_cumulative are computed, never stored. If they are wrong the
-- cut line lies, and the cut line is the whole point of the ranking screen.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_num(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

-- The ranking screen compares ranks in JavaScript (UTF-16 code units) and
-- Postgres compares them here. They must agree, which they only do under C
-- collation. If this assertion fails, drag order and the cut line have
-- silently diverged.
select pg_temp.expect_text(
  (select collation_name from information_schema.columns
    where table_schema = 'public' and table_name = 'households' and column_name = 'rank'),
  'C', 'households.rank is pinned to C collation');
select pg_temp.expect_text((select ('B' < 'a' collate "C")::text), 'true',
  'C collation puts uppercase before lowercase, as JavaScript does');

-- Seed cut lines: A ends at 'a6', B ends at 'a8', C (no boundary) trailing.
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a1'), 'A', 'a0 is tier A');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a6'), 'A', 'a5 is tier A (on the line)');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a7'), 'B', 'a6 is tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a8'), 'B', 'a7 is tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a9'), 'C', 'a8 is tier C');
select pg_temp.expect_num((select tier_position from public.v_households where rank = 'a1'), 0, 'a0 is tier_position 0');
select pg_temp.expect_num((select tier_position from public.v_households where rank = 'a7'), 1, 'a6 is tier_position 1');
select pg_temp.expect_num((select tier_position from public.v_households where rank = 'a9'), 2, 'a8 is tier_position 2');

-- Infants do not occupy a seat; children do.
select pg_temp.expect_num((select head_count from public.v_households where rank = 'a1'), 4, 'Okonkwo head_count is 4');
select pg_temp.expect_num((select seat_count from public.v_households where rank = 'a1'), 3, 'Okonkwo seat_count is 3 (infant on a lap)');

-- Running seat total down the ranked list is what the cut line is drawn against.
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'a1'),  3, 'cumulative at a0 is 3');
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'a6'), 11, 'cumulative at a5 is 11');
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'b1'), 17, 'cumulative at a9 is 17');

-- Dashboard numbers
select pg_temp.expect_num((select household_count      from public.v_wedding_stats), 10, 'stats: 10 households');
select pg_temp.expect_num((select guest_count          from public.v_wedding_stats), 18, 'stats: 18 guests');
select pg_temp.expect_num((select adult_count          from public.v_wedding_stats), 16, 'stats: 16 adults');
select pg_temp.expect_num((select child_count          from public.v_wedding_stats),  1, 'stats: 1 child');
select pg_temp.expect_num((select infant_count         from public.v_wedding_stats),  1, 'stats: 1 infant');
select pg_temp.expect_num((select above_cut_households from public.v_wedding_stats),  6, 'stats: 6 households above the cut');
select pg_temp.expect_num((select above_cut_seats      from public.v_wedding_stats), 11, 'stats: 11 seats above the cut');
rollback;

-- ---------------------------------------------------------------------------
-- Moving the cut line re-tiers the list with no write to households
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
update public.cut_lines set boundary_rank = 'a3'
where wedding_id = '11111111-1111-4111-8111-111111111111' and label = 'A';
update public.cut_lines set boundary_rank = 'a5'
where wedding_id = '11111111-1111-4111-8111-111111111111' and label = 'B';

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a3'), 'A', 'after move: a2 is tier A');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a4'), 'B', 'after move: a3 dropped to tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a6'), 'C', 'after move: a5 dropped to tier C');
select pg_temp.expect_num((select above_cut_households from public.v_wedding_stats), 3, 'after move: 3 households above the cut');
rollback;

-- ---------------------------------------------------------------------------
-- 3+ lines, and deleting a middle line merges its tier into the one below
-- with no write to any household (spec 5, A6 decision 3)
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
-- Split the existing waitlist (today's B, ending a8) into two: "Maybe" ending
-- a7, "Long shot" ending a8, ahead of the existing trailing C.
update public.cut_lines set position = 3
where wedding_id = '11111111-1111-4111-8111-111111111111' and label = 'C';
update public.cut_lines set label = 'Long shot', position = 2, boundary_rank = 'a8'
where wedding_id = '11111111-1111-4111-8111-111111111111' and label = 'B';
insert into public.cut_lines (wedding_id, label, position, boundary_rank)
values ('11111111-1111-4111-8111-111111111111', 'Maybe', 1, 'a7');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a7'), 'Maybe', 'a6 sits in the new Maybe tier');
select pg_temp.expect_num((select tier_position from public.v_households where rank = 'a7'), 1, 'Maybe is tier_position 1');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a8'), 'Long shot', 'a7 sits in Long shot');
select pg_temp.expect_num((select above_cut_households from public.v_wedding_stats), 6, 'splitting the waitlist does not change who is above the cut');

-- Deleting "Maybe" (the middle line) absorbs its households into "Long
-- shot" below it — nothing about any household changes, since tier is
-- fully derived from cut_lines alone.
delete from public.cut_lines
where wedding_id = '11111111-1111-4111-8111-111111111111' and label = 'Maybe';
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a7'), 'Long shot', 'deleting Maybe merges a6 into Long shot');
-- Position itself is not renumbered by SQL alone — that's the action
-- layer's job (src/server/actions/rank.ts's removeCutLine); this only
-- proves tier resolution tolerates a gap in the sequence.
select pg_temp.expect_num((select tier_position from public.v_households where rank = 'a7'), 2, 'Long shot keeps its own position (2) — nothing renumbers it at the SQL level');
rollback;

-- ---------------------------------------------------------------------------
-- Constraints that protect the data model
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
do $$
begin
  -- Two households cannot share a rank, or the order is non-deterministic.
  begin
    insert into public.households (wedding_id, display_name, rank)
    values ('11111111-1111-4111-8111-111111111111', 'Duplicate rank', 'a1');
    raise exception 'FAIL — duplicate rank accepted';
  exception when unique_violation then
    raise notice '  ok  duplicate rank rejected';
  end;

  -- One RSVP per guest per event.
  begin
    insert into public.rsvps (wedding_id, guest_id, event_id, status)
    values ('11111111-1111-4111-8111-111111111111',
            '9a000000-0000-4000-8000-000000000001',
            'e1111111-1111-4111-8111-111111111111', 'yes');
    insert into public.rsvps (wedding_id, guest_id, event_id, status)
    values ('11111111-1111-4111-8111-111111111111',
            '9a000000-0000-4000-8000-000000000001',
            'e1111111-1111-4111-8111-111111111111', 'no');
    raise exception 'FAIL — duplicate RSVP accepted';
  exception when unique_violation then
    raise notice '  ok  duplicate RSVP rejected';
  end;

  -- An answer belongs to a guest or a household, never both and never neither.
  begin
    insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
    select '11111111-1111-4111-8111-111111111111', q.id,
           '9a000000-0000-4000-8000-000000000001',
           'd0000000-0000-4000-8000-000000000001', '"both"'::jsonb
    from public.rsvp_questions q
    where q.wedding_id = '11111111-1111-4111-8111-111111111111' limit 1;
    raise exception 'FAIL — answer with two subjects accepted';
  exception when check_violation then
    raise notice '  ok  answer with two subjects rejected';
  end;

  begin
    insert into public.rsvp_answers (wedding_id, question_id, value)
    select '11111111-1111-4111-8111-111111111111', q.id, '"orphan"'::jsonb
    from public.rsvp_questions q
    where q.wedding_id = '11111111-1111-4111-8111-111111111111' limit 1;
    raise exception 'FAIL — answer with no subject accepted';
  exception when check_violation then
    raise notice '  ok  answer with no subject rejected';
  end;

  -- One live invitation per household.
  begin
    insert into public.invitations (wedding_id, household_id, token_hash, token_encrypted)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000001', 'hash-one', 'enc-one');
    insert into public.invitations (wedding_id, household_id, token_hash, token_encrypted)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000001', 'hash-two', 'enc-two');
    raise exception 'FAIL — second live invitation accepted';
  exception when unique_violation then
    raise notice '  ok  second live invitation rejected';
  end;
end;
$$;
rollback;
