-- ===========================================================================
-- Day links, the rest (spec 54, migration 0051)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set p1 '''bc000000-0000-4000-8000-000000000001'''
\set p2 '''bc000000-0000-4000-8000-000000000002'''
\set p3 '''bc000000-0000-4000-8000-000000000003'''
\set item1 '''bc000000-0000-4000-8000-0000000000a1'''
\set grp '''bc000000-0000-4000-8000-0000000000b1'''

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

insert into public.people (id, wedding_id, name) values
  (:p1, :w1, 'Sione'), (:p2, :w1, 'Tama'), (:p3, :w1, 'Rangi');
insert into public.run_sheet_items (id, wedding_id, title, starts_at, ends_at)
values (:item1, :w1, 'Run the guestbook', '2027-06-12 14:00+01', '2027-06-12 15:00+01');
insert into public.helper_groups (id, wedding_id, name) values (:grp, :w1, 'Ushers');
insert into public.helper_group_members (wedding_id, group_id, person_id)
values (:w1, :grp, :p1), (:w1, :grp, :p2);

select pg_temp.expect_error(
  $$insert into public.helper_groups (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', ' USHERS ')$$,
  '23505', 'group names are unique per wedding, ignoring case and spacing');
select pg_temp.expect_error(
  $$insert into public.helper_group_members (wedding_id, group_id, person_id)
    values ('11111111-1111-4111-8111-111111111111', 'bc000000-0000-4000-8000-0000000000b1', 'bc000000-0000-4000-8000-000000000001')$$,
  '23505', 'a person is in a group once');

-- Open task: two places for the Ushers
update public.run_sheet_items set open_to_group_id = :grp, open_places = 2 where id = :item1;
select pg_temp.expect_text(
  public.claim_open_task(:w1, :item1, null, null, :p3), 'not_in_group',
  'someone outside the group cannot claim');
select pg_temp.expect_text(
  public.claim_open_task(:w1, :item1, null, null, :p1), 'claimed', 'a group member claims a place');
select pg_temp.expect_text(
  public.claim_open_task(:w1, :item1, null, null, :p1), 'already', 'claiming twice is "already"');
select pg_temp.expect_text(
  (select open_places::text from public.run_sheet_items where id = :item1), '1', 'a place is used up');
select pg_temp.expect_text(
  public.claim_open_task(:w1, :item1, null, null, :p2), 'claimed', 'the last place is taken');
select pg_temp.expect_text(
  (select coalesce(open_to_group_id::text, 'closed') from public.run_sheet_items where id = :item1), 'closed',
  'the task closes to claims when full');
select pg_temp.expect_text(
  public.claim_open_task(:w1, :item1, null, null, :p1), 'not_open', 'a closed task is not open');

-- One lead per task
update public.run_sheet_item_assignees set is_lead = true where item_id = :item1 and person_id = :p1;
select pg_temp.expect_error(
  $$update public.run_sheet_item_assignees set is_lead = true where item_id = 'bc000000-0000-4000-8000-0000000000a1' and person_id = 'bc000000-0000-4000-8000-000000000002'$$,
  '23505', 'only one lead per task');

-- Places without a group are refused the other way round
select pg_temp.expect_error(
  $$update public.run_sheet_items set open_places = 0, open_to_group_id = 'bc000000-0000-4000-8000-0000000000b1' where id = 'bc000000-0000-4000-8000-0000000000a1'$$,
  '23514', 'open places are 1 to 20');

-- Announcements: the audience and its target agree
select pg_temp.expect_error(
  $$insert into public.day_announcements (wedding_id, audience, text) values ('11111111-1111-4111-8111-111111111111', 'group', 'Hi')$$,
  '23514', 'a group announcement needs a group');
insert into public.day_announcements (wedding_id, audience, text, important)
values (:w1, 'everyone', 'Ceremony running 10 minutes late', true);
select pg_temp.expect_text(
  (select count(*)::text from public.day_announcements where wedding_id = :w1), '1', 'an announcement to everyone is stored');

-- Reminder log dedupes
insert into public.day_links (id, wedding_id, person_id, label, token_hash, token_encrypted, expires_at)
values ('bc000000-0000-4000-8000-0000000000c1', :w1, :p1, 'Sione', 'hash-31', 'enc-31', '2027-06-20 00:00+01');
insert into public.day_reminder_log (link_id, wedding_id, dedupe_key, kind)
values ('bc000000-0000-4000-8000-0000000000c1', :w1, 'day-before', 'day_before_email');
select pg_temp.expect_error(
  $$insert into public.day_reminder_log (link_id, wedding_id, dedupe_key, kind)
    values ('bc000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111', 'day-before', 'day_before_email')$$,
  '23505', 'the same reminder is never logged twice');

select pg_temp.expect_text(
  (select day_before_email::text from public.weddings where id = :w1), 'true', 'the day-before email is on by default');

-- Cleanup
delete from public.day_announcements where wedding_id = :w1;
delete from public.day_links where id = 'bc000000-0000-4000-8000-0000000000c1';
delete from public.run_sheet_item_assignees where item_id = :item1;
delete from public.run_sheet_items where id = :item1;
delete from public.helper_groups where id = :grp;
delete from public.people where id in (:p1, :p2, :p3);
