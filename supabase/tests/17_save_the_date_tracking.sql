-- ===========================================================================
-- Save-the-date tracking and "I already know I can't come"
-- (spec 29, migration 0034)
-- ===========================================================================
-- The assertions that matter:
--   * the flag is NOT an RSVP — response_state, rsvp_* and the invited cell
--     are identical before and after (spec 29 §4.1);
--   * a flagged guest stops being COUNTED, and nobody else's number moves
--     (spec 29 §4.6);
--   * a Yes outranks the flag (§4.3.5);
--   * the flag can't be half-set.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set okonkwo   '''d0000000-0000-4000-8000-000000000001'''
\set raman     '''d0000000-0000-4000-8000-000000000002'''
\set chidi     '''9a000000-0000-4000-8000-000000000001'''
\set ngozi     '''9a000000-0000-4000-8000-000000000002'''
\set ceremony  '''e1111111-1111-4111-8111-111111111111'''

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

-- The seed has no invitations; build the one createInvitations() would.
create or replace function pg_temp.invite_household(p_household uuid)
returns void language plpgsql as $$
declare
  v_wedding uuid;
  v_invitation uuid;
begin
  select wedding_id into v_wedding from public.households where id = p_household;

  insert into public.invitations (wedding_id, household_id, token_hash, token_encrypted)
  values (v_wedding, p_household, 'hash-' || p_household::text, 'enc-' || p_household::text)
  returning id into v_invitation;

  insert into public.invitation_events (wedding_id, invitation_id, event_id)
  select v_wedding, v_invitation, e.id from public.events e where e.wedding_id = v_wedding;

  insert into public.rsvps (wedding_id, guest_id, event_id, status)
  select v_wedding, g.id, e.id, 'pending'
    from public.guests g
    cross join public.events e
   where g.household_id = p_household
     and g.deleted_at is null
     and e.wedding_id = v_wedding;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The flag can't be half-set, or set to something unknown
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

create or replace function pg_temp.rejects(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when check_violation then
    raise notice '  ok  %', p_label;
    return;
  end;
  raise exception 'FAIL % — the statement was accepted', p_label;
end;
$$;

select pg_temp.rejects(
  format('update public.guests set unable_to_attend_at = now() where id = %L', :chidi),
  'a timestamp with no source is refused');
select pg_temp.rejects(
  format('update public.guests set unable_to_attend_via = %L where id = %L', 'planner', :chidi),
  'a source with no timestamp is refused');
select pg_temp.rejects(
  format('update public.guests set unable_to_attend_at = now(), unable_to_attend_via = %L where id = %L',
         'carrier pigeon', :chidi),
  'an unknown source is refused');

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;
select pg_temp.expect_true(
  (select unable_to_attend_at is not null from public.guests where id = :chidi),
  'both set together is accepted');

update public.guests set unable_to_attend_at = null, unable_to_attend_via = null where id = :chidi;
select pg_temp.expect_true(
  (select unable_to_attend_at is null and unable_to_attend_via is null
     from public.guests where id = :chidi),
  'and both cleared together is accepted (undo)');
rollback;

-- ---------------------------------------------------------------------------
-- 2. It is not an RSVP: nothing the RSVP views report moves
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

create temp table before_rsvp as
  select rsvp_total, rsvp_answered, rsvp_yes, rsvp_no, rsvp_maybe, response_state
    from public.v_household_rsvp where household_id = :okonkwo;
create temp table before_invited as
  select guest_id, event_id, invited from public.v_guest_event_invites
   where household_id = :okonkwo;
create temp table before_rsvp_rows as
  select count(*)::int as n from public.rsvps where wedding_id = :w1;

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;

select pg_temp.expect_true(
  (select row(a.*) is not distinct from row(b.*)
     from before_rsvp a,
          (select rsvp_total, rsvp_answered, rsvp_yes, rsvp_no, rsvp_maybe, response_state
             from public.v_household_rsvp where household_id = :okonkwo) b),
  'flagging a guest leaves rsvp_total, rsvp_answered, rsvp_yes/no/maybe and response_state untouched');

select pg_temp.expect_true(
  (select response_state = 'none' from public.v_household_rsvp where household_id = :okonkwo),
  'so a household that has only said "can''t come" still reads as having answered nothing');

select pg_temp.expect(
  (select count(*)::int from (
     select guest_id, event_id, invited from public.v_guest_event_invites
      where household_id = :okonkwo
     except
     select guest_id, event_id, invited from before_invited) d),
  0,
  'the invited cell is unchanged for every guest and event: the guest stays invited');

select pg_temp.expect(
  (select count(*)::int from public.rsvps where wedding_id = :w1),
  (select n from before_rsvp_rows),
  'and no rsvps row was written or removed');
rollback;

-- ---------------------------------------------------------------------------
-- 3. What /invitations reads
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

select pg_temp.expect(
  (select guest_total from public.v_household_rsvp where household_id = :okonkwo),
  4, 'guest_total counts the household''s active guests');
select pg_temp.expect(
  (select unable_count from public.v_household_rsvp where household_id = :okonkwo),
  0, 'unable_count starts at zero, not null');
select pg_temp.expect_true(
  (select std_sent_at is null from public.v_household_rsvp where household_id = :okonkwo),
  'a household nobody has ticked reads std_sent_at null');

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'planner'
 where id in (:chidi, :ngozi);
select pg_temp.expect(
  (select unable_count from public.v_household_rsvp where household_id = :okonkwo),
  2, 'unable_count follows the flags');
select pg_temp.expect(
  (select guest_total from public.v_household_rsvp where household_id = :okonkwo),
  4, 'and guest_total does not');

-- A soft-deleted guest is on neither side of the count.
update public.guests set deleted_at = now() where id = :ngozi;
select pg_temp.expect(
  (select guest_total from public.v_household_rsvp where household_id = :okonkwo),
  3, 'a cut guest leaves guest_total');
select pg_temp.expect(
  (select unable_count from public.v_household_rsvp where household_id = :okonkwo),
  1, 'and leaves unable_count');

-- "Save the Date Sent" works with no invitation at all.
update public.households set save_the_date_sent_at = now() where id = :raman;
select pg_temp.expect_true(
  (select std_sent_at is not null from public.v_household_rsvp where household_id = :raman),
  'the save-the-date tick works for a household with no invitation');
select pg_temp.expect_true(
  (select invitation_id is null and sent_at is null
     from public.v_household_rsvp where household_id = :raman),
  'and does not touch the invitation''s own sent_at');
rollback;

-- ---------------------------------------------------------------------------
-- 4a. Headcount before any invitation exists — the stage a save-the-date
--     decline actually happens at
-- ---------------------------------------------------------------------------
-- With no rsvps rows at all, budget_guest_population assumes everyone comes,
-- so this is where the exclusion has to bite.
begin;
set local role service_role;

create temp table before_counts as
  select
    (select seat_count from public.v_households where id = :okonkwo)            as okonkwo_seats,
    (select sum(seat_count) from public.v_households
      where wedding_id = :w1 and id <> :okonkwo)::int                           as others_seats,
    (select above_cut_seats from public.v_wedding_stats where wedding_id = :w1) as above_cut,
    (select seat from public.budget_guest_counts(:w1, null, false))::int        as seats_all,
    (select seat from public.budget_guest_counts(:w1, null, true))::int         as seats_forced;

select pg_temp.expect_true(
  (select okonkwo_seats = 3 from before_counts),
  'the fixture household is two adults and a child: three seats');
select pg_temp.expect_true(
  (select seats_all > 0 from before_counts),
  'and with no RSVPs yet the per-head population assumes everyone comes');

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;

select pg_temp.expect(
  (select seat_count from public.v_households where id = :okonkwo),
  (select okonkwo_seats - 1 from before_counts),
  'v_households.seat_count drops by exactly the flagged adult');
select pg_temp.expect(
  (select head_count from public.v_households where id = :okonkwo),
  4, 'but head_count is still the household''s composition');
select pg_temp.expect(
  (select sum(seat_count)::int from public.v_households
    where wedding_id = :w1 and id <> :okonkwo),
  (select others_seats from before_counts),
  'no other household''s seat count moves');
select pg_temp.expect(
  (select above_cut_seats from public.v_wedding_stats where wedding_id = :w1),
  (select above_cut - 1 from before_counts),
  'the dashboard''s seats-above-the-line follows');
select pg_temp.expect(
  (select seat from public.budget_guest_counts(:w1, null, false))::int,
  (select seats_all - 1 from before_counts),
  'per-head costing: one fewer seat');
select pg_temp.expect(
  (select seat from public.budget_guest_counts(:w1, null, true))::int,
  (select seats_forced - 1 from before_counts),
  'and in the rank screen''s always-invited figure');
rollback;

-- ---------------------------------------------------------------------------
-- 4b. Headcount once an invitation exists
-- ---------------------------------------------------------------------------
-- An invitation brings pending rsvps rows with it, which flips the per-head
-- population to "yes only" (budget_wedding_has_rsvps) — so the event-scoped
-- check uses the forced-invited path, which ignores RSVPs and so isolates the
-- flag.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

create temp table before_counts as
  select
    (select outstanding_guests from public.v_wedding_stats where wedding_id = :w1) as outstanding,
    (select declined_guests from public.v_wedding_stats where wedding_id = :w1)    as declined,
    (select seat from public.budget_guest_counts(:w1, :ceremony, true))::int        as seats_ceremony;

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;

select pg_temp.expect(
  (select seat from public.budget_guest_counts(:w1, :ceremony, true))::int,
  (select seats_ceremony - 1 from before_counts),
  'a single event''s population loses the flagged guest too');
select pg_temp.expect(
  (select outstanding_guests from public.v_wedding_stats where wedding_id = :w1),
  (select outstanding - 1 from before_counts),
  'a guest who has said they can''t come is no longer outstanding');
select pg_temp.expect(
  (select declined_guests from public.v_wedding_stats where wedding_id = :w1),
  (select declined from before_counts),
  'but is not added to declined: that is the RSVP "No", and this is not an RSVP');
select pg_temp.expect_true(
  (select bool_and(invited) from public.v_guest_event_invites where guest_id = :chidi),
  'and they remain invited to everything');
rollback;

-- ---------------------------------------------------------------------------
-- 5. A Yes outranks the flag
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;
select pg_temp.expect_true(
  (select bool_and(excluded_from_counts) from public.v_guest_event_invites where guest_id = :chidi),
  'flagged with no answer: excluded from counts');
select pg_temp.expect(
  (select seat_count from public.v_households where id = :okonkwo),
  2, 'and the household has two seats');

update public.rsvps set status = 'yes', responded_at = now()
 where guest_id = :chidi and event_id = :ceremony;
select pg_temp.expect_true(
  (select not bool_or(excluded_from_counts) from public.v_guest_event_invites where guest_id = :chidi),
  'flagged, then answered Yes: counted again');
select pg_temp.expect(
  (select seat_count from public.v_households where id = :okonkwo),
  3, 'and the seat is back');

-- A flagged guest who answered No is still excluded and still declined once.
update public.rsvps set status = 'no', responded_at = now()
 where guest_id = :chidi and event_id = :ceremony;
select pg_temp.expect_true(
  (select bool_and(excluded_from_counts) from public.v_guest_event_invites where guest_id = :chidi),
  'flagged and answered No: still excluded');
rollback;

-- ---------------------------------------------------------------------------
-- 6. Another wedding's collaborator sees none of it
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
update public.guests
   set unable_to_attend_at = now(), unable_to_attend_via = 'save_the_date'
 where id = :chidi;
update public.households set save_the_date_sent_at = now() where id = :okonkwo;
reset role;

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*)::int from public.guests where unable_to_attend_at is not null),
  0, 'the other wedding''s collaborator sees no flagged guests');
select pg_temp.expect(
  (select count(*)::int from public.v_household_rsvp where unable_count > 0 or std_sent_at is not null),
  0, 'nor any household''s tick or chip, through the view');
rollback;
