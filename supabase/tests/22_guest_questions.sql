-- ===========================================================================
-- Guest questions (migration 0040)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1 '''11111111-1111-4111-8111-111111111111'''

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

-- Inserted as the table owner, the way the service-role server action does.
insert into public.guest_questions (wedding_id, author_name, contact, body)
values (:w1, 'Sam', 'sam@example.com', 'Is there parking at the venue?');

select pg_temp.expect(
  (select count(*) from public.guest_questions where wedding_id = :w1), 1,
  'a question is stored');
select pg_temp.expect(
  (select count(*) from public.guest_questions where status = 'new'), 1,
  'it is born new');

select pg_temp.expect_fails(
  $$insert into public.guest_questions (wedding_id, body) values (:w1, '')$$,
  'an empty question is refused');
select pg_temp.expect_fails(
  $$insert into public.guest_questions (wedding_id, body) values (:w1, repeat('x', 1001))$$,
  'a question over 1000 characters is refused');
select pg_temp.expect_fails(
  $$insert into public.guest_questions (wedding_id, body, status) values (:w1, 'hi', 'approved')$$,
  'there is no approved status');

-- Tenancy: a collaborator of another wedding sees nothing; anon is shut out.
set role authenticated;
select set_config('request.jwt.claim.sub', :stranger, false);
select pg_temp.expect(
  (select count(*) from public.guest_questions), 0,
  'a stranger sees no questions');
select set_config('request.jwt.claim.sub', :alex, false);
select pg_temp.expect(
  (select count(*) from public.guest_questions), 1,
  'a collaborator sees their wedding''s question');
reset role;

set role anon;
select pg_temp.expect_fails(
  $$select * from public.guest_questions$$,
  'anon cannot read questions');
reset role;

\o
\echo '22_guest_questions: ok'
