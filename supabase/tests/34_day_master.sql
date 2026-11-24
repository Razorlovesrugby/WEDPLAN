-- ===========================================================================
-- The on-the-day master (spec 55, migration 0054)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set p1 '''bf000000-0000-4000-8000-000000000001'''
\set p2 '''bf000000-0000-4000-8000-000000000002'''

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

insert into public.people (id, wedding_id, name) values (:p1, :w1, 'Mere (planner)'), (:p2, :w2, 'Someone else');

-- Alerts are on by default for collaborators and people
select pg_temp.expect_text(
  (select bool_and(day_alerts)::text from public.collaborators where wedding_id = :w1), 'true', 'collaborators get day alerts by default');
select pg_temp.expect_text(
  (select day_alerts::text from public.people where id = :p1), 'true', 'people get day alerts by default');

-- The day lead: a person or a collaborator, never both
update public.weddings set day_lead_person_id = :p1 where id = :w1;
select pg_temp.expect_text(
  (select day_lead_person_id::text from public.weddings where id = :w1), 'bf000000-0000-4000-8000-000000000001', 'a person can be the day lead');
select pg_temp.expect_error(
  $$update public.weddings set day_lead_user_id = 'aaaaaaaa-0000-4000-8000-000000000001' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', 'the day lead is one person, not two');
update public.weddings set day_lead_person_id = null, day_lead_user_id = :alex where id = :w1;
select pg_temp.expect_text(
  (select day_lead_user_id::text from public.weddings where id = :w1), 'aaaaaaaa-0000-4000-8000-000000000001', 'a collaborator can be the day lead');

-- Tenancy: another wedding's person can't be the lead
update public.weddings set day_lead_user_id = null where id = :w1;
select pg_temp.expect_error(
  $$update public.weddings set day_lead_person_id = 'bf000000-0000-4000-8000-000000000002' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23503', 'a person from another wedding cannot be the day lead');

-- Removing the person clears the lead (people are soft-deleted, but a hard delete must not strand it)
update public.weddings set day_lead_person_id = :p1 where id = :w1;
delete from public.people where id = :p1;
select pg_temp.expect_text(
  (select coalesce(day_lead_person_id::text, 'none') from public.weddings where id = :w1), 'none', 'deleting the lead person clears the day lead');

-- Master activity kinds are ordinary activity rows
insert into public.day_activity (wedding_id, kind, payload) values (:w1, 'help_answered', '{"by":"Mere"}');
select pg_temp.expect_text(
  (select count(*)::text from public.day_activity where wedding_id = :w1 and kind = 'help_answered'), '1', 'a master action writes an activity row');

delete from public.day_activity where wedding_id = :w1;
delete from public.people where id = :p2;
