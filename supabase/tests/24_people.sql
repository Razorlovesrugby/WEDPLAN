-- ===========================================================================
-- People (migration 0043, spec 39 part B)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set item1 '''b3111111-1111-4111-8111-111111111111'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_fails(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL % — it was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise notice '  ok  %', p_label;
end;
$$;

insert into public.people (id, wedding_id, name)
values ('a9000000-0000-4000-8000-000000000001', :w1, 'Planner Pat');
-- A person in the other wedding, for the cross-tenant checks.
insert into public.people (id, wedding_id, name)
values ('a9000000-0000-4000-8000-0000000000ff', :w2, 'Their planner');

select pg_temp.expect((select count(*) from public.people where wedding_id = :w1), 1,
  'a person is stored');
select pg_temp.expect((select count(*) from public.people where access <> 'none'), 0,
  'a person is born with no access');

select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', '   ')$$,
  'a blank name is refused');
select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', repeat('x', 81))$$,
  'a name over 80 characters is refused');
select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name, access) values ('11111111-1111-4111-8111-111111111111', 'X', 'admin')$$,
  'there is no admin access level');
select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name, access) values ('11111111-1111-4111-8111-111111111111', 'X', 'planner')$$,
  'planner access without a login is refused');

-- Assignment --------------------------------------------------------------
update public.list_items set assigned_person_id = 'a9000000-0000-4000-8000-000000000001'
 where id = :item1;
select pg_temp.expect(
  (select count(*) from public.list_items
    where id = :item1 and assigned_person_id is not null), 1,
  'a task can be assigned to a person');

select pg_temp.expect_fails(
  $$update public.list_items set assigned_to = 'aaaaaaaa-0000-4000-8000-000000000001'
     where id = 'b3111111-1111-4111-8111-111111111111'$$,
  'a task cannot have a collaborator AND a person');

update public.list_items set assigned_person_id = null where id = :item1;
update public.list_items set assigned_to = 'aaaaaaaa-0000-4000-8000-000000000001' where id = :item1;
select pg_temp.expect(
  (select count(*) from public.list_items where id = :item1 and assigned_to is not null), 1,
  'a task can still be assigned to a collaborator');
select pg_temp.expect_fails(
  $$update public.list_items set assigned_person_id = 'a9000000-0000-4000-8000-000000000001'
     where id = 'b3111111-1111-4111-8111-111111111111'$$,
  'and then not also to a person');
update public.list_items set assigned_to = null where id = :item1;

select pg_temp.expect_fails(
  $$update public.list_items set assigned_person_id = 'a9000000-0000-4000-8000-0000000000ff'
     where id = 'b3111111-1111-4111-8111-111111111111'$$,
  'a task cannot be assigned to another wedding''s person');

-- Removing a person (hard, as an operator would) frees their tasks; the
-- app only ever soft-deletes.
update public.list_items set assigned_person_id = 'a9000000-0000-4000-8000-000000000001'
 where id = :item1;
delete from public.people where id = 'a9000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select count(*) from public.list_items where id = :item1 and assigned_person_id is null), 1,
  'deleting a person unassigns their tasks, it does not delete them');
insert into public.people (id, wedding_id, name)
values ('a9000000-0000-4000-8000-000000000001', :w1, 'Planner Pat');

-- Audit -------------------------------------------------------------------
select pg_temp.expect(
  (select count(*) from public.audit_log
    where table_name = 'people' and action = 'insert' and label = 'Planner Pat'), 2,
  'adding a person is audited (first insert and the re-insert)');

-- Tenancy -----------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :stranger, false);
select pg_temp.expect((select count(*) from public.people where wedding_id = :w1), 0,
  'a stranger sees none of this wedding''s people');
select pg_temp.expect((select count(*) from public.people), 1,
  'a stranger sees only their own wedding''s person');
select set_config('request.jwt.claim.sub', :alex, false);
select pg_temp.expect((select count(*) from public.people), 1,
  'a collaborator sees their wedding''s people');
select pg_temp.expect_fails(
  $$insert into public.people (wedding_id, name) values ('22222222-2222-4222-8222-222222222222', 'Sneaky')$$,
  'a collaborator cannot add a person to another wedding');
reset role;

set role anon;
select pg_temp.expect_fails($$select * from public.people$$, 'anon cannot read people');
reset role;

\o
\echo '24_people: ok'
