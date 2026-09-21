-- ===========================================================================
-- Per-event invites, views and open logging (spec 22, migration 0023)
-- ===========================================================================
-- The assertions that matter are about disagreement: what happens when the
-- household says one thing and a person says another, and what a count does
-- when somebody is un-invited from an event they already answered.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1        '''11111111-1111-4111-8111-111111111111'''
\set stranger  '''cccccccc-0000-4000-8000-000000000003'''
\set okonkwo   '''d0000000-0000-4000-8000-000000000001'''
\set ceremony  '''e1111111-1111-4111-8111-111111111111'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set evening   '''e3333333-3333-4333-8333-333333333333'''

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

-- ---------------------------------------------------------------------------
-- The fixture
-- ---------------------------------------------------------------------------
-- The seed carries households, guests and events but no invitations at all —
-- inviting is something the app does, not something a fresh database has. So
-- each transaction below builds the same small fixture and rolls it back: one
-- live invitation for the Okonkwo household, covering all three events, with a
-- pending rsvp per guest per event, which is exactly what createInvitations()
-- produces.
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
-- 1. With no overrides, the view is the household's invitation
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

select pg_temp.expect_true(
  (select bool_and(invited) from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :ceremony),
  'everyone in an invited household is invited to that event');

select pg_temp.expect_true(
  (select bool_and(invited = household_invited) from public.v_guest_event_invites
    where wedding_id = :w1),
  'with no overrides anywhere, effective and household agree for every pair');

select pg_temp.expect_true(
  (select count(*) = 0 from public.v_guest_event_invites
    where wedding_id = :w1 and override is not null),
  'and no pair carries an override');
rollback;

-- ---------------------------------------------------------------------------
-- 2. An override removes one person without touching the household
-- ---------------------------------------------------------------------------
-- The kids are not at the evening do.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false
  from public.guests
 where household_id = :okonkwo and age_band = 'child';

select pg_temp.expect_true(
  (select count(*) > 0 from public.guests
    where household_id = :okonkwo and age_band = 'child'),
  'the fixture household does have a child in it');

select pg_temp.expect_true(
  (select bool_and(not invited) from public.v_guest_event_invites vi
     join public.guests g on g.id = vi.guest_id
    where vi.household_id = :okonkwo and vi.event_id = :evening
      and g.age_band = 'child'),
  'the child is not invited to the evening party');

select pg_temp.expect_true(
  (select bool_and(invited) from public.v_guest_event_invites vi
     join public.guests g on g.id = vi.guest_id
    where vi.household_id = :okonkwo and vi.event_id = :evening
      and g.age_band = 'adult'),
  'and the adults in the same household still are');

select pg_temp.expect_true(
  (select bool_and(household_invited) from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :evening),
  'the household-level invitation is untouched by the override');
rollback;

-- ---------------------------------------------------------------------------
-- 3. An override adds one person to an event the household is not invited to
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

-- Take the whole household off the evening party first.
delete from public.invitation_events
 where event_id = :evening
   and invitation_id in (select id from public.invitations where household_id = :okonkwo);

select pg_temp.expect_true(
  (select bool_and(not invited) from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :evening),
  'nobody in the household is invited once the household is not');

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, true
  from public.guests
 where household_id = :okonkwo
 order by sort_order limit 1;

select pg_temp.expect(
  (select count(*)::int from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :evening and invited),
  1,
  'exactly the one person added by an override is invited');
rollback;

-- ---------------------------------------------------------------------------
-- 4. THE POINT OF THE EXCEPTIONS TABLE
-- ---------------------------------------------------------------------------
-- A bulk household change must not silently re-invite somebody who was
-- deliberately removed. This is the assertion the whole shape exists for.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false
  from public.guests
 where household_id = :okonkwo and age_band = 'child';

-- "Re-invite the household to the evening do" — remove and re-add the
-- household-level row, which is what the planner's tick does.
delete from public.invitation_events
 where event_id = :evening
   and invitation_id in (select id from public.invitations where household_id = :okonkwo);
insert into public.invitation_events (wedding_id, invitation_id, event_id)
select wedding_id, id, :evening from public.invitations where household_id = :okonkwo;

select pg_temp.expect_true(
  (select bool_and(not invited) from public.v_guest_event_invites vi
     join public.guests g on g.id = vi.guest_id
    where vi.household_id = :okonkwo and vi.event_id = :evening
      and g.age_band = 'child'),
  'the deliberate removal survives a household-level re-invite');
rollback;

-- ---------------------------------------------------------------------------
-- 5. v_household_rsvp counts what is invited now, not what has a row
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

-- Baseline: the seed's household, whatever it is.
create temp table baseline as
  select rsvp_total, rsvp_answered from public.v_household_rsvp
   where household_id = :okonkwo;

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false
  from public.guests
 where household_id = :okonkwo and age_band = 'child';

select pg_temp.expect(
  (select rsvp_total from public.v_household_rsvp where household_id = :okonkwo),
  (select rsvp_total - 1 from baseline),
  'un-inviting one person from one event drops the total by exactly one');
rollback;

-- ---------------------------------------------------------------------------
-- 6. An answer given before an un-invite survives, and stops counting
-- ---------------------------------------------------------------------------
-- Spec 22 §7: guest data is never destroyed, and the numbers still have to be
-- right afterwards.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

-- One adult says yes to the evening party.
update public.rsvps set status = 'yes', responded_at = now()
 where event_id = :evening
   and guest_id = (select id from public.guests
                    where household_id = :okonkwo and age_band = 'adult'
                    order by sort_order limit 1);

create temp table before_uninvite as
  select rsvp_yes, rsvp_total from public.v_household_rsvp where household_id = :okonkwo;

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false
  from public.guests
 where household_id = :okonkwo and age_band = 'adult'
 order by sort_order limit 1;

select pg_temp.expect(
  (select rsvp_yes from public.v_household_rsvp where household_id = :okonkwo),
  (select rsvp_yes - 1 from before_uninvite),
  'their yes stops being counted');

select pg_temp.expect_true(
  (select count(*) = 1 from public.rsvps
    where event_id = :evening and status = 'yes'
      and guest_id in (select id from public.guests where household_id = :okonkwo)),
  'and the answer itself is still there, exactly as they left it');
rollback;

-- ---------------------------------------------------------------------------
-- 7. The dashboard counts the same way
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

update public.rsvps set status = 'yes', responded_at = now()
 where event_id = :evening
   and guest_id = (select id from public.guests
                    where household_id = :okonkwo and age_band = 'adult'
                    order by sort_order limit 1);

create temp table stats_before as
  select attending_guests from public.v_wedding_stats where wedding_id = :w1;

-- Un-invite them from every event: they should leave the attending count.
insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select g.wedding_id, g.id, e.id, false
  from public.guests g
  join public.events e on e.wedding_id = g.wedding_id
 where g.id = (select id from public.guests
                where household_id = :okonkwo and age_band = 'adult'
                order by sort_order limit 1);

select pg_temp.expect(
  (select attending_guests from public.v_wedding_stats where wedding_id = :w1),
  (select attending_guests - 1 from stats_before),
  'a guest un-invited from everything leaves the attending count');
rollback;

-- ---------------------------------------------------------------------------
-- 8. invitation_views
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.invitation_views (wedding_id, household_id, viewed_at, source) values
  (:w1, :okonkwo, now() - interval '3 days', 'address'),
  (:w1, :okonkwo, now() - interval '2 days', 'address'),
  (:w1, :okonkwo, now(),                     'token');

select pg_temp.expect(
  (select view_count from public.v_household_rsvp where household_id = :okonkwo),
  3,
  'the view count is on the row every screen already reads');

select pg_temp.expect_true(
  (select last_viewed_at > now() - interval '1 minute'
     from public.v_household_rsvp where household_id = :okonkwo),
  'and so is the last-viewed time');

select pg_temp.expect(
  (select view_count from public.v_household_rsvp
    where household_id = 'd0000000-0000-4000-8000-000000000002'),
  0,
  'a household nobody has opened reads zero, not null');

do $$
begin
  begin
    insert into public.invitation_views (wedding_id, household_id, source)
    values ('11111111-1111-4111-8111-111111111111',
            'd0000000-0000-4000-8000-000000000001', 'carrier-pigeon');
    raise exception 'FAIL — an unknown view source was accepted';
  exception
    when check_violation then raise notice '  ok  an unknown view source is rejected';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 9. RLS on both new tables, from another wedding's account
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.invitation_views (wedding_id, household_id) values (:w1, :okonkwo);
insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false from public.guests
 where household_id = :okonkwo order by sort_order limit 1;
reset role;

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*)::int from public.invitation_views), 0,
  'the other wedding''s collaborator sees no opens');
select pg_temp.expect(
  (select count(*)::int from public.guest_event_overrides), 0,
  'nor any overrides');
select pg_temp.expect(
  (select count(*)::int from public.v_guest_event_invites), 0,
  'nor any invitations, through the view');
rollback;

-- ---------------------------------------------------------------------------
-- 10. The built-in decline-note question
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect(
  (select count(*)::int from public.rsvp_questions
    where wedding_id = :w1 and builtin_key = 'decline_note'),
  1,
  'every wedding has exactly one decline-note question');

select pg_temp.expect_true(
  (select not active and scope = 'household' from public.rsvp_questions
    where wedding_id = :w1 and builtin_key = 'decline_note'),
  'it is household-scope and inactive, so the RSVP form never renders it');

set local role service_role;
do $$
begin
  begin
    insert into public.rsvp_questions (wedding_id, label, scope, builtin_key)
    values ('11111111-1111-4111-8111-111111111111', 'Another one', 'household', 'decline_note');
    raise exception 'FAIL — a second decline_note question was allowed';
  exception
    when unique_violation then raise notice '  ok  a wedding cannot have two of the same built-in question';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 11. The caterer's number follows the same rule
-- ---------------------------------------------------------------------------
-- budget_guest_population used to ask `invitation_events` directly, which is
-- the one thing spec 22 §4 forbids: with per-guest overrides it would count a
-- child taken off the evening do, and the per-head cost would disagree with
-- the guest list screen.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

-- Everybody says yes to the evening party, so the count is about invitations
-- rather than about answers.
update public.rsvps set status = 'yes', responded_at = now()
 where event_id = :evening
   and guest_id in (select id from public.guests where household_id = :okonkwo);

create temp table heads_before as
  select seat from public.budget_guest_counts(:w1, :evening, false);

insert into public.guest_event_overrides (wedding_id, guest_id, event_id, invited)
select wedding_id, id, :evening, false
  from public.guests
 where household_id = :okonkwo and age_band in ('adult', 'child')
 order by sort_order limit 1;

select pg_temp.expect(
  (select seat::int from public.budget_guest_counts(:w1, :evening, false)),
  (select seat::int - 1 from heads_before),
  'a guest removed from one event drops that event''s head count by one');
rollback;

-- ---------------------------------------------------------------------------
-- 12. A household's invitation is reported even for events it does not cover
-- ---------------------------------------------------------------------------
-- The bug this pins: if `invitation_id` were only populated for events the
-- invitation already covers, the grid would say "no invitation yet" and
-- refuse to let the planner invite them — on precisely the cell they clicked
-- because they wanted to.
begin;
set local role service_role;
select pg_temp.invite_household(:okonkwo);

delete from public.invitation_events
 where event_id = :evening
   and invitation_id in (select id from public.invitations where household_id = :okonkwo);

select pg_temp.expect_true(
  (select bool_and(invitation_id is not null) from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :evening),
  'the household still reports an invitation for an event it is not invited to');

select pg_temp.expect_true(
  (select bool_and(not invited and not household_invited) from public.v_guest_event_invites
    where household_id = :okonkwo and event_id = :evening),
  'while still reading as not invited to it');

-- And sent_at is the invitation's, not the event's.
update public.invitations set sent_at = now() where household_id = :okonkwo;
select pg_temp.expect_true(
  (select bool_and(sent_at is not null) from public.v_guest_event_invites
    where household_id = :okonkwo),
  'sent_at is a fact about the invitation, so it shows on every one of their events');

select pg_temp.expect(
  (select count(*)::int from public.v_guest_event_invites
    where household_id = 'd0000000-0000-4000-8000-000000000002' and invitation_id is not null),
  0,
  'a household with no invitation at all reports none');
rollback;
