-- ===========================================================================
-- The shot list (spec 52, migration 0052)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set g1 '''9a000000-0000-4000-8000-000000000001'''
\set sec '''bd000000-0000-4000-8000-0000000000a1'''
\set shot '''bd000000-0000-4000-8000-0000000000b1'''

create or replace function pg_temp.expect(actual int, wanted int, label text)
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

insert into public.shot_sections (id, wedding_id, name) values (:sec, :w1, 'Family formals');
insert into public.shots (id, wedding_id, section_id, title, must_have) values (:shot, :w1, :sec, 'Everyone', true);

-- A shot's people are exactly one of guest, person or role
insert into public.shot_people (wedding_id, shot_id, guest_id) values (:w1, :shot, :g1);
insert into public.shot_people (wedding_id, shot_id, role) values (:w1, :shot, 'Best man');
select pg_temp.expect(
  (select count(*)::int from public.shot_people where shot_id = :shot), 2, 'a shot holds a guest and a role');
select pg_temp.expect_error(
  $$insert into public.shot_people (wedding_id, shot_id) values ('11111111-1111-4111-8111-111111111111', 'bd000000-0000-4000-8000-0000000000b1')$$,
  '23514', 'a shot person must be one of guest, person or role');
select pg_temp.expect_error(
  $$insert into public.shot_people (wedding_id, shot_id, guest_id, role) values ('11111111-1111-4111-8111-111111111111', 'bd000000-0000-4000-8000-0000000000b1', '9a000000-0000-4000-8000-000000000001', 'x')$$,
  '23514', 'a shot person cannot be two of them');
select pg_temp.expect_error(
  $$insert into public.shot_people (wedding_id, shot_id, guest_id) values ('11111111-1111-4111-8111-111111111111', 'bd000000-0000-4000-8000-0000000000b1', '9a000000-0000-4000-8000-000000000001')$$,
  '23505', 'the same guest is in a shot once');

-- Tenancy: a shot cannot sit in another wedding's section
select pg_temp.expect_error(
  $$insert into public.shots (wedding_id, section_id, title) values ('22222222-2222-4222-8222-222222222222', 'bd000000-0000-4000-8000-0000000000a1', 'Cross')$$,
  '23503', 'a shot cannot name another wedding''s section');

-- Status and shooter checks
select pg_temp.expect_error(
  $$update public.shots set shooter = 'third' where id = 'bd000000-0000-4000-8000-0000000000b1'$$,
  '23514', 'a shooter is lead or second');
select pg_temp.expect_error(
  $$update public.shots set status = 'done' where id = 'bd000000-0000-4000-8000-0000000000b1'$$,
  '22P02', 'a status is one of four');
update public.shots set status = 'taken', status_at = now(), status_by = 'Lens & Light' where id = :shot;
select pg_temp.expect(
  (select count(*)::int from public.shots where status = 'taken'), 1, 'a shot can be marked taken');

-- Deleting a shot clears its people; the audit log records the shot
delete from public.shots where id = :shot;
select pg_temp.expect(
  (select count(*)::int from public.shot_people where wedding_id = :w1), 0, 'deleting a shot removes its people');
select pg_temp.expect(
  (select least(count(*), 1)::int from public.audit_log where table_name = 'shots'), 1, 'shots are audited');

-- A section keeps existing when its run sheet item goes
insert into public.run_sheet_items (id, wedding_id, title, starts_at, ends_at)
values ('bd000000-0000-4000-8000-0000000000c1', :w1, 'Family photos', '2027-06-12 15:00+01', '2027-06-12 15:45+01');
update public.shot_sections set run_sheet_item_id = 'bd000000-0000-4000-8000-0000000000c1' where id = :sec;
delete from public.run_sheet_items where id = 'bd000000-0000-4000-8000-0000000000c1';
select pg_temp.expect(
  (select count(*)::int from public.shot_sections where id = :sec and run_sheet_item_id is null), 1,
  'a section survives its run sheet item being deleted');

delete from public.shot_sections where id = :sec;
