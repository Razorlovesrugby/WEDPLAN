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

-- Seed cut lines: cut_rank = 'a5', tier_b_rank = 'a7'.
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a0'), 'A', 'a0 is tier A');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a5'), 'A', 'a5 is tier A (on the line)');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a6'), 'B', 'a6 is tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a7'), 'B', 'a7 is tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a8'), 'C', 'a8 is tier C');

-- Infants do not occupy a seat; children do.
select pg_temp.expect_num((select head_count from public.v_households where rank = 'a0'), 4, 'Okonkwo head_count is 4');
select pg_temp.expect_num((select seat_count from public.v_households where rank = 'a0'), 3, 'Okonkwo seat_count is 3 (infant on a lap)');

-- Running seat total down the ranked list is what the cut line is drawn against.
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'a0'),  3, 'cumulative at a0 is 3');
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'a5'), 11, 'cumulative at a5 is 11');
select pg_temp.expect_num((select seats_cumulative from public.v_households where rank = 'a9'), 17, 'cumulative at a9 is 17');

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
update public.weddings set cut_rank = 'a2', tier_b_rank = 'a4'
where id = '11111111-1111-4111-8111-111111111111';

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a2'), 'A', 'after move: a2 is tier A');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a3'), 'B', 'after move: a3 dropped to tier B');
select pg_temp.expect_text((select tier::text from public.v_households where rank = 'a5'), 'C', 'after move: a5 dropped to tier C');
select pg_temp.expect_num((select above_cut_households from public.v_wedding_stats), 3, 'after move: 3 households above the cut');
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
    values ('11111111-1111-4111-8111-111111111111', 'Duplicate rank', 'a0');
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
    insert into public.invitations (wedding_id, household_id, token_hash)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000001', 'hash-one');
    insert into public.invitations (wedding_id, household_id, token_hash)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000001', 'hash-two');
    raise exception 'FAIL — second live invitation accepted';
  exception when unique_violation then
    raise notice '  ok  second live invitation rejected';
  end;
end;
$$;
rollback;
