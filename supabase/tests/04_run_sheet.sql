-- ===========================================================================
-- Run sheet tests (spec 5 part B, rewritten for spec 50, migration 0048)
-- ===========================================================================
-- Times are stored. An item with a predecessor always satisfies
--   starts_at = predecessor.ends_at + offset_minutes
-- and save_run_sheet_item / shift_run_sheet_item / delete_run_sheet_item are
-- the writers that keep it true. Every block rolls back.
--
-- The 0048 backfill (resolving the old chains) cannot be tested here: this
-- suite runs after every migration, when there is nothing left to backfill.
-- It was checked once by hand against a database built up to 0047 (see
-- docs/specs/50-run-sheet-one-timeline.md, Build status).
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set sam      '''aaaaaaaa-0000-4000-8000-000000000002'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set event    '''e1111111-1111-4111-8111-111111111111'''
\set chidi    '''9a000000-0000-4000-8000-000000000001'''
\set ngozi    '''9a000000-0000-4000-8000-000000000002'''
\set otherguest '''9a000000-0000-4000-8000-0000000000ff'''
\set barn     '''e0000000-0000-4000-8000-000000000001'''
\set bloom    '''e0000000-0000-4000-8000-000000000002'''
\set otherven '''e0000000-0000-4000-8000-0000000000ff'''

create or replace function pg_temp.expect_ts(actual timestamptz, wanted timestamptz, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % - expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_bool(actual boolean, wanted boolean, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % - expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_int(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % - expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % - expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_fails(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL % - it was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise notice '  ok  %', p_label;
end;
$$;

-- Saves an item in wedding 1. p_off = null means "a typed start".
create or replace function pg_temp.sv(
  p_id uuid, p_title text, p_start text, p_end text,
  p_pred uuid default null, p_off integer default 0, p_assignees jsonb default '[]'
) returns uuid language sql as $$
  select public.save_run_sheet_item(
    '11111111-1111-4111-8111-111111111111'::uuid, p_id, p_title, null, null,
    'e1111111-1111-4111-8111-111111111111'::uuid, false,
    p_start::timestamptz, p_end::timestamptz, p_pred, p_off, p_assignees);
$$;

-- Items with a predecessor whose start is not predecessor.end + offset.
create or replace function pg_temp.broken() returns bigint language sql as $$
  select count(*) from public.run_sheet_items i
    join public.run_sheet_items p on p.id = i.predecessor_id
   where i.starts_at <> p.ends_at + make_interval(mins => i.offset_minutes);
$$;

create or replace function pg_temp.at(p_id uuid) returns text language sql as $$
  select to_char(starts_at at time zone 'Europe/London', 'HH24:MI') || '-' ||
         to_char(ends_at at time zone 'Europe/London', 'HH24:MI')
    from public.run_sheet_items where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- 1. Saving, "starts after", and the cascade
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.sv(null, 'Ceremony', '2027-06-12 13:00+01', '2027-06-12 13:30+01') as cer \gset
select pg_temp.expect_text(pg_temp.at(:'cer'), '13:00-13:30', 'a fixed item keeps the times it was given');

-- Photos: 90 minutes, starting when the ceremony ends. The start passed in is
-- ignored for a linked item: the predecessor decides.
select pg_temp.sv(null, 'Photos', '2027-06-12 09:00+01', '2027-06-12 10:30+01', :'cer', 0) as pho \gset
select pg_temp.expect_text(pg_temp.at(:'pho'), '13:30-15:00', 'a follower starts when its predecessor ends and keeps its length');

select pg_temp.sv(null, 'Drinks', '2027-06-12 00:00+01', '2027-06-12 00:30+01', :'cer', 0) as dri \gset
select pg_temp.expect_text(pg_temp.at(:'dri'), '13:30-14:00', 'two items can follow the same item');

select pg_temp.sv(null, 'Reception', '2027-06-12 00:00+01', '2027-06-12 01:00+01', :'pho', 15) as rec \gset
select pg_temp.expect_text(pg_temp.at(:'rec'), '15:15-16:15', 'a gap is added after the predecessor ends');
select pg_temp.expect_int(pg_temp.broken(), 0, 'every follower starts at predecessor end plus gap');

-- Moving the ceremony 15 minutes later carries everything that follows it.
select pg_temp.sv(:'cer', 'Ceremony', '2027-06-12 13:15+01', '2027-06-12 13:45+01') as _ \gset
select pg_temp.expect_text(pg_temp.at(:'cer'), '13:15-13:45', 'the moved item is where it was put');
select pg_temp.expect_text(pg_temp.at(:'pho'), '13:45-15:15', 'its follower moved with it, length unchanged');
select pg_temp.expect_text(pg_temp.at(:'dri'), '13:45-14:15', 'its second follower moved too');
select pg_temp.expect_text(pg_temp.at(:'rec'), '15:30-16:30', 'followers of followers moved, gap kept');
select pg_temp.expect_int(pg_temp.broken(), 0, 'the rule still holds after a move');

-- Resizing moves followers by the change in the END only.
select pg_temp.sv(:'cer', 'Ceremony', '2027-06-12 13:15+01', '2027-06-12 14:00+01') as _ \gset
select pg_temp.expect_text(pg_temp.at(:'pho'), '14:00-15:30', 'a longer item pushes its follower by the extra length');
select pg_temp.expect_int(pg_temp.broken(), 0, 'the rule still holds after a resize');

-- shift_run_sheet_item: one move, followers carried, gap changes.
select public.shift_run_sheet_item('11111111-1111-4111-8111-111111111111', :'pho', 30);
select pg_temp.expect_text(pg_temp.at(:'pho'), '14:30-16:00', 'shift moves the item later');
select pg_temp.expect_text(pg_temp.at(:'rec'), '16:15-17:15', 'shift carries what follows it');
select pg_temp.expect_text(pg_temp.at(:'dri'), '14:00-14:30', 'shift leaves its siblings alone');
select pg_temp.expect_int((select offset_minutes from public.run_sheet_items where id = :'pho'), 30,
  'shifting a follower changes its gap');
select pg_temp.expect_int(pg_temp.broken(), 0, 'the rule holds after a shift');

select pg_temp.expect_fails(
  format('select public.shift_run_sheet_item(%L, %L, -60)', '11111111-1111-4111-8111-111111111111', :'pho'),
  'a follower cannot be shifted to start before its predecessor ends');

-- Fixed items just move.
select public.shift_run_sheet_item('11111111-1111-4111-8111-111111111111', :'cer', -15);
select pg_temp.expect_text(pg_temp.at(:'cer'), '13:00-13:45', 'a fixed item shifts freely');
select pg_temp.expect_int(pg_temp.broken(), 0, 'and its followers still satisfy the rule');

-- Loops and self-reference are refused.
select pg_temp.expect_fails(
  format('select pg_temp.sv(%L, ''Ceremony'', ''2027-06-12 13:00+01'', ''2027-06-12 13:30+01'', %L, 0)', :'cer', :'rec'),
  'an item cannot start after something that starts after it');
select pg_temp.expect_fails(
  format('select pg_temp.sv(%L, ''Ceremony'', ''2027-06-12 13:00+01'', ''2027-06-12 13:30+01'', %L, 0)', :'cer', :'cer'),
  'an item cannot start after itself');

-- A typed start earlier than the predecessor ends removes the link.
select pg_temp.sv(:'dri', 'Drinks', '2027-06-12 13:00+01', '2027-06-12 13:30+01', :'cer', null) as _ \gset
select pg_temp.expect_text(pg_temp.at(:'dri'), '13:00-13:30', 'a typed start before the predecessor ends keeps that start');
select pg_temp.expect_bool((select predecessor_id is null from public.run_sheet_items where id = :'dri'), true,
  'and the item stops following it');

-- A typed start after it ends sets the gap.
select pg_temp.sv(:'dri', 'Drinks', '2027-06-12 14:05+01', '2027-06-12 14:35+01', :'cer', null) as _ \gset
select pg_temp.expect_int((select offset_minutes from public.run_sheet_items where id = :'dri'), 20,
  'a typed start after the predecessor ends becomes the gap');
select pg_temp.expect_int(pg_temp.broken(), 0, 'the rule holds after typed starts');

-- Validation
select pg_temp.expect_fails(
  $$select pg_temp.sv(null, '   ', '2027-06-12 13:00+01', '2027-06-12 13:30+01')$$,
  'a blank title is refused');
select pg_temp.expect_fails(
  $$select pg_temp.sv(null, 'Backwards', '2027-06-12 13:30+01', '2027-06-12 13:00+01')$$,
  'an end before the start is refused');
select pg_temp.expect_fails(
  $$select pg_temp.sv(null, 'Too far', '2027-06-12 13:00+01', '2027-06-12 13:30+01',
      (select id from public.run_sheet_items limit 1), 2000)$$,
  'a gap over 24 hours is refused');

-- A zero-length item is allowed.
select pg_temp.sv(null, 'Cake cut', '2027-06-12 20:00+01', '2027-06-12 20:00+01') as zero \gset
select pg_temp.expect_text(pg_temp.at(:'zero'), '20:00-20:00', 'a zero-length item is allowed');
rollback;

-- ---------------------------------------------------------------------------
-- 2. Deleting keeps every follower's time
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.sv(null, 'Ceremony', '2027-06-12 13:00+01', '2027-06-12 13:30+01') as cer \gset
select pg_temp.sv(null, 'Photos', '2027-06-12 00:00+01', '2027-06-12 01:30+01', :'cer', 0) as pho \gset
select pg_temp.sv(null, 'Reception', '2027-06-12 00:00+01', '2027-06-12 01:00+01', :'pho', 15) as rec \gset

select public.delete_run_sheet_item('11111111-1111-4111-8111-111111111111', :'pho');
select pg_temp.expect_text(pg_temp.at(:'rec'), '15:15-16:15', 'deleting a middle item leaves its follower at the same time');
select pg_temp.expect_bool((select predecessor_id from public.run_sheet_items where id = :'rec') = :'cer'::uuid, true,
  'and it is re-linked to the deleted item''s predecessor');
select pg_temp.expect_int((select offset_minutes from public.run_sheet_items where id = :'rec'), 105,
  'with the gap that keeps its time');
select pg_temp.expect_int(pg_temp.broken(), 0, 'the rule holds after the delete');

select public.delete_run_sheet_item('11111111-1111-4111-8111-111111111111', :'cer');
select pg_temp.expect_text(pg_temp.at(:'rec'), '15:15-16:15', 'deleting the first item leaves its follower at the same time');
select pg_temp.expect_bool((select predecessor_id is null from public.run_sheet_items where id = :'rec'), true,
  'and unlinks it');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Assignees
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.people (id, wedding_id, name) values
  ('a1000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'The DJ');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.sv(null, 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
  jsonb_build_array(
    jsonb_build_object('type', 'collaborator', 'id', 'aaaaaaaa-0000-4000-8000-000000000001'),
    jsonb_build_object('type', 'collaborator', 'id', 'aaaaaaaa-0000-4000-8000-000000000002'),
    jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'),
    jsonb_build_object('type', 'guest', 'id', '9a000000-0000-4000-8000-000000000001'),
    jsonb_build_object('type', 'person', 'id', 'a1000000-0000-4000-8000-0000000000a1'),
    jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002')
  )) as photos \gset

select pg_temp.expect_int((select count(*) from public.run_sheet_item_assignees where item_id = :'photos'), 5,
  'one item holds both of us, a vendor, a guest and a person, and a duplicate adds nothing');
select pg_temp.expect_int((select assignee_count from public.v_run_sheet_items where id = :'photos'), 5,
  'the view counts them');

-- Replacing the set
select pg_temp.sv(:'photos', 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as _ \gset
select pg_temp.expect_int((select count(*) from public.run_sheet_item_assignees where item_id = :'photos'), 1,
  'saving replaces the assignee set');

-- A null set leaves the assignees alone (a resize does not resend them).
select public.save_run_sheet_item('11111111-1111-4111-8111-111111111111', :'photos', 'Couple photos', null, null,
  'e1111111-1111-4111-8111-111111111111', false, '2027-06-12 15:00+01', '2027-06-12 16:30+01', null, 0, null) as _ \gset
select pg_temp.expect_int((select count(*) from public.run_sheet_item_assignees where item_id = :'photos'), 1,
  'saving with no assignee list leaves the assignees as they were');
select pg_temp.expect_text(pg_temp.at(:'photos'), '15:00-16:30', 'while still changing the times');

-- Refusals
select pg_temp.expect_fails(
  format($f$select pg_temp.sv(%L, 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
    jsonb_build_array(jsonb_build_object('type', 'guest', 'id', %L)))$f$, :'photos', '9a000000-0000-4000-8000-0000000000ff'),
  'a guest from another wedding cannot be assigned');
select pg_temp.expect_fails(
  format($f$select pg_temp.sv(%L, 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
    jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', %L)))$f$, :'photos', 'e0000000-0000-4000-8000-0000000000ff'),
  'a vendor from another wedding cannot be assigned');
select pg_temp.expect_fails(
  format($f$select pg_temp.sv(%L, 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
    jsonb_build_array(jsonb_build_object('type', 'robot', 'id', %L)))$f$, :'photos', '9a000000-0000-4000-8000-000000000001'),
  'an unknown assignee type is refused');

-- Atomic: a bad assignee leaves the item untouched.
select pg_temp.expect_fails(
  format($f$select pg_temp.sv(%L, 'Renamed', '2027-06-12 17:00+01', '2027-06-12 18:00+01', null, 0,
    jsonb_build_array(jsonb_build_object('type', 'guest', 'id', %L)))$f$, :'photos', '9a000000-0000-4000-8000-0000000000ff'),
  'a save with a bad assignee fails');
select pg_temp.expect_text((select title from public.run_sheet_items where id = :'photos'), 'Couple photos',
  'and the item''s title is unchanged');
select pg_temp.expect_text(pg_temp.at(:'photos'), '15:00-16:30', 'and its times are unchanged');

-- Table constraints (as the owner, so RLS is not what refuses them)
reset role;
select pg_temp.expect_fails(
  format($f$insert into public.run_sheet_item_assignees (wedding_id, item_id, guest_id, vendor_id)
    values ('11111111-1111-4111-8111-111111111111', %L, '9a000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')$f$, :'photos'),
  'an assignee row names exactly one source, not two');
select pg_temp.expect_fails(
  format($f$insert into public.run_sheet_item_assignees (wedding_id, item_id)
    values ('11111111-1111-4111-8111-111111111111', %L)$f$, :'photos'),
  'an assignee row names exactly one source, not none');
select pg_temp.expect_fails(
  format($f$insert into public.run_sheet_item_assignees (wedding_id, item_id, vendor_id)
    values ('11111111-1111-4111-8111-111111111111', %L, 'e0000000-0000-4000-8000-000000000002')$f$, :'photos'),
  'the same vendor cannot be on an item twice');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Overlap warning: same assignee only
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.people (id, wedding_id, name) values
  ('a1000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'The DJ');
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.sv(null, 'Couple photos', '2027-06-12 15:00+01', '2027-06-12 16:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as a \gset
select pg_temp.sv(null, 'Family photos', '2027-06-12 15:30+01', '2027-06-12 16:30+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as b \gset
select pg_temp.sv(null, 'Band setup', '2027-06-12 15:30+01', '2027-06-12 16:30+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'person', 'id', 'a1000000-0000-4000-8000-0000000000a1'))) as c \gset
select pg_temp.sv(null, 'Unassigned thing', '2027-06-12 15:30+01', '2027-06-12 16:30+01') as d \gset
select pg_temp.sv(null, 'Touching', '2027-06-12 16:00+01', '2027-06-12 16:30+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as e \gset

select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'a'), true,
  'the same assignee on two overlapping items warns on the first');
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'b'), true,
  'and on the second');
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'c'), false,
  'overlapping an item with a different assignee does not warn');
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'d'), false,
  'an unassigned item never warns');
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'e'), true,
  'the same vendor on the 16:00 item overlaps Family photos, which runs to 16:30');
select pg_temp.expect_int((select count(*) from public.v_run_sheet_items where conflict), 3,
  'only the three items sharing the vendor warn');

-- Touching items do not overlap.
select pg_temp.sv(:'e', 'Touching', '2027-06-12 16:30+01', '2027-06-12 17:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as _ \gset
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'e'), false,
  'items that touch end to start do not overlap');

-- A removed (soft-deleted) person is hidden and does not warn; the assignment survives.
select pg_temp.sv(null, 'DJ sound check', '2027-06-12 15:30+01', '2027-06-12 16:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'person', 'id', 'a1000000-0000-4000-8000-0000000000a1'))) as f \gset
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'f'), true,
  'the DJ on two overlapping items warns');
reset role;
update public.people set deleted_at = now() where id = 'a1000000-0000-4000-8000-0000000000a1';
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_bool((select conflict from public.v_run_sheet_items where id = :'f'), false,
  'a removed person no longer warns');
select pg_temp.expect_int((select assignee_count from public.v_run_sheet_items where id = :'f'), 0,
  'and is not counted');
select pg_temp.sv(:'f', 'DJ sound check', '2027-06-12 15:30+01', '2027-06-12 16:00+01', null, 0, '[]') as _ \gset
reset role;
select pg_temp.expect_int((select count(*) from public.run_sheet_item_assignees where item_id = :'f'), 1,
  'saving the item without the hidden person leaves their assignment in place');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Vendors, events and tenancy
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.sv(null, 'Flowers', '2027-06-12 09:00+01', '2027-06-12 10:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'vendor', 'id', 'e0000000-0000-4000-8000-000000000002'))) as fl \gset
reset role;
delete from public.vendors where id = 'e0000000-0000-4000-8000-000000000002';
select pg_temp.expect_int((select count(*) from public.run_sheet_items where id = :'fl'), 1,
  'deleting a vendor keeps the item');
select pg_temp.expect_int((select count(*) from public.run_sheet_item_assignees where item_id = :'fl'), 0,
  'and removes the vendor''s assignment');
rollback;

begin;
set local role service_role;
insert into public.events (id, wedding_id, name) values
  ('e9999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', 'Rehearsal dinner');
insert into public.run_sheet_items (id, wedding_id, event_id, title, starts_at, ends_at)
values ('f0000000-0000-4000-8000-0000000000e1', '11111111-1111-4111-8111-111111111111',
        'e9999999-9999-4999-8999-999999999999', 'Labelled', '2027-06-12 12:00+01', '2027-06-12 13:00+01');
reset role;
delete from public.events where id = 'e9999999-9999-4999-8999-999999999999';
select pg_temp.expect_bool((select event_id is null from public.run_sheet_items where id = 'f0000000-0000-4000-8000-0000000000e1'), true,
  'deleting an event keeps its items and clears the label');
rollback;

begin;
set local role service_role;
insert into public.run_sheet_items (id, wedding_id, title, starts_at, ends_at)
values ('f0000000-0000-4000-8000-0000000000e2', '11111111-1111-4111-8111-111111111111',
        'No event', '2027-06-12 12:00+01', '2027-06-12 13:00+01');
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect_int((select count(*) from public.v_run_sheet_items), 0,
  'a non-collaborator sees no items, and an item needs no event');
select pg_temp.expect_fails(
  $$select pg_temp.sv(null, 'Intruder', '2027-06-12 12:00+01', '2027-06-12 13:00+01')$$,
  'a non-collaborator cannot save an item');
rollback;

-- ---------------------------------------------------------------------------
-- 6. Constraints on the table itself
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.expect_fails(
  $$insert into public.run_sheet_items (wedding_id, title, starts_at, ends_at)
    values ('11111111-1111-4111-8111-111111111111', 'Backwards', '2027-06-12 13:00+01', '2027-06-12 12:00+01')$$,
  'a table row cannot end before it starts');
select pg_temp.expect_fails(
  $$insert into public.run_sheet_items (wedding_id, title, starts_at)
    values ('11111111-1111-4111-8111-111111111111', 'No end', '2027-06-12 13:00+01')$$,
  'a table row needs an end');
select pg_temp.expect_fails(
  $$insert into public.run_sheet_items (wedding_id, title, starts_at, ends_at, offset_minutes)
    values ('11111111-1111-4111-8111-111111111111', 'Big gap', '2027-06-12 13:00+01', '2027-06-12 14:00+01', 5000)$$,
  'a gap over 24 hours is refused by the table');
rollback;

-- ---------------------------------------------------------------------------
-- 7. A corrected timezone keeps the wall-clock time of a run sheet item
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.sv(null, 'Ceremony', '2027-06-12 13:00+01', '2027-06-12 14:00+01') as cer \gset
select public.change_wedding_timezone('11111111-1111-4111-8111-111111111111', 'Pacific/Auckland');
select pg_temp.expect_text(
  (select to_char(starts_at at time zone 'Pacific/Auckland', 'YYYY-MM-DD HH24:MI') || ' ' ||
          to_char(ends_at at time zone 'Pacific/Auckland', 'HH24:MI')
     from public.run_sheet_items where id = :'cer'),
  '2027-06-12 13:00 14:00',
  'the item reads 13:00 to 14:00 in the new zone, as it did in the old one');
rollback;

-- ---------------------------------------------------------------------------
-- 8. Audit
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.sv(null, 'Audited', '2027-06-12 13:00+01', '2027-06-12 14:00+01', null, 0,
  jsonb_build_array(jsonb_build_object('type', 'collaborator', 'id', 'aaaaaaaa-0000-4000-8000-000000000001'))) as aud \gset
reset role;
select pg_temp.expect_bool(
  exists (select 1 from public.audit_log where table_name = 'run_sheet_item_assignees'),
  true, 'assigning someone writes an audit row');
rollback;
