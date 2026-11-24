-- ===========================================================================
-- Day links (spec 54, migration 0050)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set g1 '''9a000000-0000-4000-8000-000000000001'''
\set p1 '''bb000000-0000-4000-8000-000000000001'''
\set item1 '''bb000000-0000-4000-8000-0000000000a1'''

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

insert into public.people (id, wedding_id, name, phone, email)
values (:p1, :w1, 'Sione', '021 555 0101', 'sione@example.test');
insert into public.run_sheet_items (id, wedding_id, title, starts_at, ends_at)
values (:item1, :w1, 'Hand out programmes', '2027-06-12 12:45+01', '2027-06-12 13:00+01');
insert into public.run_sheet_item_assignees (wedding_id, item_id, person_id) values (:w1, :item1, :p1);

-- A person can carry a phone and email now
select pg_temp.expect(
  (select count(*)::int from public.people where id = :p1 and phone is not null and email is not null), 1,
  'people hold a phone and an email');

-- One live link per assignee
insert into public.day_links (wedding_id, person_id, label, token_hash, token_encrypted, expires_at)
values (:w1, :p1, 'Sione (usher)', 'hash-1', 'enc-1', '2027-06-20 00:00+01');
select pg_temp.expect_error(
  $$insert into public.day_links (wedding_id, person_id, label, token_hash, token_encrypted, expires_at)
    values ('11111111-1111-4111-8111-111111111111', 'bb000000-0000-4000-8000-000000000001', 'Again', 'hash-2', 'enc-2', '2027-06-20 00:00+01')$$,
  '23505', 'a second live link for the same person is refused');
update public.day_links set revoked_at = now() where token_hash = 'hash-1';
insert into public.day_links (wedding_id, person_id, label, token_hash, token_encrypted, expires_at)
values (:w1, :p1, 'Sione (usher)', 'hash-2', 'enc-2', '2027-06-20 00:00+01');
select pg_temp.expect(
  (select count(*)::int from public.day_links where person_id = :p1), 2,
  'after revoking, a new link is allowed (the old row stays)');

-- Exactly one assignee column
select pg_temp.expect_error(
  $$insert into public.day_links (wedding_id, label, token_hash, token_encrypted, expires_at)
    values ('11111111-1111-4111-8111-111111111111', 'Nobody', 'hash-3', 'enc-3', now())$$,
  '23514', 'a link needs an assignee');
select pg_temp.expect_error(
  $$insert into public.day_links (wedding_id, person_id, guest_id, label, token_hash, token_encrypted, expires_at)
    values ('11111111-1111-4111-8111-111111111111', 'bb000000-0000-4000-8000-000000000001',
            '9a000000-0000-4000-8000-000000000001', 'Two', 'hash-4', 'enc-4', now())$$,
  '23514', 'a link has only one assignee');
-- Other wedding's person is refused by the composite foreign key
select pg_temp.expect_error(
  $$insert into public.day_links (wedding_id, person_id, label, token_hash, token_encrypted, expires_at)
    values ('22222222-2222-4222-8222-222222222222', 'bb000000-0000-4000-8000-000000000002', 'Cross', 'hash-5', 'enc-5', now())$$,
  '23503', 'a link cannot point at a person who is not in its wedding');

-- Module keys
select pg_temp.expect_error(
  $$update public.day_links set modules = array['Shot List!'] where token_hash = 'hash-2'$$,
  '23514', 'a module key must match the key pattern');
update public.day_links set modules = array['shot_list', 'seating'] where token_hash = 'hash-2';
select pg_temp.expect(
  (select cardinality(modules) from public.day_links where token_hash = 'hash-2'), 2,
  'valid module keys are accepted');

-- Assignee state
select pg_temp.expect_error(
  $$update public.run_sheet_item_assignees set state = 'finished'$$,
  '23514', 'an assignee state is one of four');
update public.run_sheet_item_assignees set state = 'started', started_at = now(), state_at = now()
 where item_id = :item1;
select pg_temp.expect(
  (select count(*)::int from public.run_sheet_item_assignees where item_id = :item1 and state = 'started'), 1,
  'an assignee can move to started');

-- Activity is append-only, except for the answer
insert into public.day_activity (wedding_id, link_id, person_id, item_id, kind, payload)
select :w1, id, :p1, :item1, 'help', '{"reason":"Something is missing"}'::jsonb
  from public.day_links where token_hash = 'hash-2';
select pg_temp.expect_error(
  $$update public.day_activity set kind = 'done'$$,
  'P0001', 'an activity row cannot be rewritten');
update public.day_activity set answered_at = now(), answer = 'Mere is on her way';
select pg_temp.expect(
  (select count(*)::int from public.day_activity where answer is not null), 1,
  'the master can answer a help row');
select pg_temp.expect_error(
  $$insert into public.day_activity (wedding_id, kind) values ('11111111-1111-4111-8111-111111111111', 'Bad Kind')$$,
  '23514', 'an activity kind must match the key pattern');

-- Steps
insert into public.run_sheet_item_steps (wedding_id, item_id, kind, text, sort_order)
values (:w1, :item1, 'step', 'Collect the boxes', 1), (:w1, :item1, 'bring', 'Programmes', 1);
select pg_temp.expect_error(
  $$insert into public.run_sheet_item_steps (wedding_id, item_id, kind, text) values
      ('11111111-1111-4111-8111-111111111111', 'bb000000-0000-4000-8000-0000000000a1', 'other', 'x')$$,
  '23514', 'a step is a step or a bring item');

-- Audit fires for the link and hides its token
select pg_temp.expect(
  (select count(*)::int from public.audit_log
    where table_name = 'day_links' and changed::text like '%enc-2%'), 0,
  'the audit log never holds a link''s encrypted token');
select pg_temp.expect(
  (select least(count(*), 1)::int from public.audit_log where table_name = 'day_links'), 1,
  'creating a link is audited');

-- Cleanup of what this file added (the SQL suite shares one database)
delete from public.day_activity where wedding_id = :w1;
delete from public.day_links where wedding_id = :w1;
delete from public.run_sheet_item_assignees where item_id = :item1;
delete from public.run_sheet_items where id = :item1;
delete from public.people where id = :p1;
