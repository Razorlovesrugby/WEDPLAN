-- ===========================================================================
-- Save-the-date opens (migration 0031)
-- ===========================================================================
-- One thing matters: a save-the-date open is counted on its own columns and
-- never as an invitation open. A household that looked at the save-the-date
-- has not seen the invitation, and "read, no reply" must not say they have.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set okonkwo  '''d0000000-0000-4000-8000-000000000001'''
\set other    '''d0000000-0000-4000-8000-000000000002'''

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

begin;
set local role service_role;

insert into public.invitation_views (wedding_id, household_id, viewed_at, source) values
  (:w1, :okonkwo, now() - interval '5 days', 'save_the_date'),
  (:w1, :okonkwo, now() - interval '1 day',  'save_the_date');

select pg_temp.expect(
  (select std_view_count from public.v_household_rsvp where household_id = :okonkwo),
  2,
  'save-the-date opens are counted on their own column');

select pg_temp.expect_true(
  (select std_last_viewed_at between now() - interval '25 hours' and now() - interval '23 hours'
     from public.v_household_rsvp where household_id = :okonkwo),
  'and the last one is the most recent save-the-date open');

select pg_temp.expect(
  (select view_count from public.v_household_rsvp where household_id = :okonkwo),
  0,
  'a save-the-date open is not an invitation open');

select pg_temp.expect_true(
  (select last_viewed_at is null from public.v_household_rsvp where household_id = :okonkwo),
  'so the invitation still reads as never opened');

insert into public.invitation_views (wedding_id, household_id, source)
values (:w1, :okonkwo, 'address');

select pg_temp.expect(
  (select view_count from public.v_household_rsvp where household_id = :okonkwo),
  1,
  'opening the invitation afterwards counts once');

select pg_temp.expect(
  (select std_view_count from public.v_household_rsvp where household_id = :okonkwo),
  2,
  'and leaves the save-the-date count alone');

select pg_temp.expect(
  (select std_view_count from public.v_household_rsvp where household_id = :other),
  0,
  'a household nobody has opened reads zero, not null');

rollback;
