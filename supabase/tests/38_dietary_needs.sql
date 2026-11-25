-- ===========================================================================
-- Dietary needs save through ON CONFLICT (migration 0058, spec 57 Part H)
-- ===========================================================================
-- These are the statements PostgREST builds for src/server/dietary-write.ts's
-- upsert (`onConflict: "guest_id,tag"`), which the RSVP form and the guest
-- page both use. An upsert whose conflict target matched no index failed
-- every RSVP answer once (spec 49); this one is pinned here.
\set ON_ERROR_STOP on
\o /dev/null

\set w1     '''11111111-1111-4111-8111-111111111111'''
\set w2     '''22222222-2222-4222-8222-222222222222'''
\set alex   '''aaaaaaaa-0000-4000-8000-000000000001'''
\set chidi  '''9a000000-0000-4000-8000-000000000001'''

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

begin;

-- First answer inserts, a second replaces it in place (the RSVP form re-sent).
insert into public.guest_dietary_needs (wedding_id, guest_id, tag, is_allergy, other_text)
values (:w1, :chidi, 'nut', false, null)
on conflict (guest_id, tag) do update set is_allergy = excluded.is_allergy, other_text = excluded.other_text;
insert into public.guest_dietary_needs (wedding_id, guest_id, tag, is_allergy, other_text)
values (:w1, :chidi, 'nut', true, null)
on conflict (guest_id, tag) do update set is_allergy = excluded.is_allergy, other_text = excluded.other_text;
select pg_temp.expect_text(
  (select count(*)::text || ' ' || bool_and(is_allergy)::text from public.guest_dietary_needs where guest_id = :chidi),
  '1 true', 'a dietary need upserts: one row, latest value');

-- A batch with a new tag and Other, as the action sends it.
insert into public.guest_dietary_needs (wedding_id, guest_id, tag, is_allergy, other_text)
values (:w1, :chidi, 'nut', true, null), (:w1, :chidi, 'other', false, 'no mushrooms')
on conflict (guest_id, tag) do update set is_allergy = excluded.is_allergy, other_text = excluded.other_text;
select pg_temp.expect_text(
  (select string_agg(tag, ',' order by tag) from public.guest_dietary_needs where guest_id = :chidi),
  'nut,other', 'a batch upserts the new tag beside the old');

-- Removing one tag leaves the rest.
delete from public.guest_dietary_needs where guest_id = :chidi and tag = 'other';
select pg_temp.expect_text(
  (select string_agg(tag, ',') from public.guest_dietary_needs where guest_id = :chidi),
  'nut', 'a removed tag goes and the others stay');

-- A guest of another wedding can't be given a need under this one.
select pg_temp.expect_error(format(
  'insert into public.guest_dietary_needs (wedding_id, guest_id, tag) values (%L, %L, ''egg'') on conflict (guest_id, tag) do nothing',
  :w2, :chidi), '23503', 'a need can''t name a guest of another wedding');

-- The change is in the audit log.
select pg_temp.expect_text(
  (select (count(*) > 0)::text from public.audit_log where wedding_id = :w1 and table_name = 'guest_dietary_needs'),
  'true', 'dietary changes are audited');
rollback;

-- ===========================================================================
-- Item counts: the supplier and budget line upsert (spec 57 C.4)
-- ===========================================================================
-- src/server/actions/seating-styles.ts upserts `onConflict: "layout_id,item_key"`
-- with only the link columns: it must keep a final number already typed.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', true);
set local role authenticated;
insert into public.seating_tables (wedding_id, event_id, label, capacity)
values ('11111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222', 'T', 8);
create temp table lay as select id from public.seating_layouts where event_id = 'e2222222-2222-4222-8222-222222222222' and is_live;
insert into public.seating_item_counts (wedding_id, layout_id, item_key, final_count)
select '11111111-1111-4111-8111-111111111111', id, 'place:charger', 40 from lay
on conflict (layout_id, item_key) do update set final_count = excluded.final_count;
insert into public.seating_item_counts (wedding_id, layout_id, item_key, vendor_id)
select '11111111-1111-4111-8111-111111111111', id, 'place:charger', 'e0000000-0000-4000-8000-000000000002' from lay
on conflict (layout_id, item_key) do update set vendor_id = excluded.vendor_id;
select pg_temp.expect_text(
  (select final_count::text || ' ' || (vendor_id is not null)::text from public.seating_item_counts where item_key = 'place:charger'),
  '40 true', 'naming a supplier keeps the final number typed before it');
rollback;
