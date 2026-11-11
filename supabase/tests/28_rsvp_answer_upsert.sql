-- ===========================================================================
-- RSVP answers save through ON CONFLICT (migration 0047, spec 49)
-- ===========================================================================
-- These are the statements PostgREST builds for the RSVP form's upserts
-- (src/server/actions/rsvp.ts). Before 0047 both raised 42P10.
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set g1 '''9a000000-0000-4000-8000-000000000001'''
\set h1 '''d0000000-0000-4000-8000-000000000001'''

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

insert into public.rsvp_questions (id, wedding_id, label, type, scope)
values ('a7000000-0000-4000-8000-000000000001', :w1, 'Need transport?', 'boolean', 'guest'),
       ('a7000000-0000-4000-8000-000000000002', :w1, 'Arriving by?', 'short_text', 'household');

-- Per guest: first answer inserts, second replaces it.
insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
values (:w1, 'a7000000-0000-4000-8000-000000000001', :g1, null, '"yes"')
on conflict (question_id, guest_id) do update set value = excluded.value;
insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
values (:w1, 'a7000000-0000-4000-8000-000000000001', :g1, null, '"no"')
on conflict (question_id, guest_id) do update set value = excluded.value;
select pg_temp.expect_text(
  (select count(*)::text || ' ' || max(value #>> '{}') from public.rsvp_answers
   where question_id = 'a7000000-0000-4000-8000-000000000001'),
  '1 no', 'a guest answer upserts: one row, latest value');

-- Per household, the same.
insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
values (:w1, 'a7000000-0000-4000-8000-000000000002', null, :h1, '"car"')
on conflict (question_id, household_id) do update set value = excluded.value;
insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
values (:w1, 'a7000000-0000-4000-8000-000000000002', null, :h1, '"bus"')
on conflict (question_id, household_id) do update set value = excluded.value;
select pg_temp.expect_text(
  (select count(*)::text || ' ' || max(value #>> '{}') from public.rsvp_answers
   where question_id = 'a7000000-0000-4000-8000-000000000002'),
  '1 bus', 'a household answer upserts: one row, latest value');

-- A left-blank answer (null value) is still a row.
insert into public.rsvp_answers (wedding_id, question_id, guest_id, household_id, value)
values (:w1, 'a7000000-0000-4000-8000-000000000001', :g1, null, null)
on conflict (question_id, guest_id) do update set value = excluded.value;
select pg_temp.expect_text(
  (select count(*)::text from public.rsvp_answers
   where question_id = 'a7000000-0000-4000-8000-000000000001' and value is null),
  '1', 'a blank answer is stored as a null value');

delete from public.rsvp_answers where question_id in
  ('a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002');
delete from public.rsvp_questions where id in
  ('a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002');
