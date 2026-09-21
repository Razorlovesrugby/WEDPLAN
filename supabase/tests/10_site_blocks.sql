-- ===========================================================================
-- The site builder (spec 23, migrations 0024 and 0025)
-- ===========================================================================
-- The assertions worth having are about the draft/published split, because
-- that is the property the whole design rests on: what a guest sees must not
-- change when the planner types, and a revision must keep rendering as it did
-- after the draft moves on.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''

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

-- ---------------------------------------------------------------------------
-- 1. The seed produced a page and a published version of it
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_true(
  (select count(*) > 5 from public.site_blocks where wedding_id = :w1),
  'the seeded wedding has a page made of blocks');

select pg_temp.expect(
  (select count(*)::int from public.site_revisions where wedding_id = :w1),
  1,
  'and exactly one published revision');

select pg_temp.expect_true(
  (select jsonb_array_length(blocks) = (select count(*) from public.site_blocks where wedding_id = :w1)
     from public.site_revisions where wedding_id = :w1),
  'the revision carries every block the draft has');

select pg_temp.expect_true(
  (select bool_and(entry ? 'type' and entry ? 'payload' and entry ? 'visible' and entry ? 'audience')
     from public.site_revisions r,
          lateral jsonb_array_elements(r.blocks) entry
    where r.wedding_id = :w1),
  'and each entry carries everything the renderer needs');
rollback;

-- ---------------------------------------------------------------------------
-- 2. THE POINT OF THE SPLIT: editing the draft does not change what guests see
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

create temp table before_edit as
  select blocks from public.site_revisions where wedding_id = :w1;

update public.site_blocks
   set payload = '{"headline":"Half-finished edit nobody should see"}'::jsonb
 where wedding_id = :w1 and type = 'hero';

insert into public.site_blocks (wedding_id, type, payload, sort_order)
values (:w1, 'prose', '{"body":"Also unfinished"}'::jsonb, 999);

select pg_temp.expect_true(
  (select r.blocks = b.blocks from public.site_revisions r, before_edit b where r.wedding_id = :w1),
  'the published revision is untouched by every draft edit');
rollback;

-- ---------------------------------------------------------------------------
-- 3. A revision keeps rendering after the block it came from is deleted
-- ---------------------------------------------------------------------------
-- A snapshot rather than a join, so that deleting a block from the draft
-- cannot rewrite the page guests were shown last month.
begin;
set local role service_role;

delete from public.site_blocks where wedding_id = :w1;

select pg_temp.expect_true(
  (select jsonb_array_length(blocks) > 5 from public.site_revisions where wedding_id = :w1),
  'the published page survives its draft being emptied');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Only the newest twenty revisions are kept
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

do $$
declare i integer;
begin
  for i in 1..25 loop
    insert into public.site_revisions (wedding_id, blocks, published_at, note)
    values ('11111111-1111-4111-8111-111111111111', '[]'::jsonb, now() + (i || ' seconds')::interval,
            'v' || i);
  end loop;
end;
$$;

select pg_temp.expect(
  (select count(*)::int from public.site_revisions where wedding_id = :w1),
  20,
  'publishing prunes to the last twenty');

select pg_temp.expect_true(
  (select note = 'v25' from public.site_revisions
    where wedding_id = :w1 order by published_at desc limit 1),
  'and the newest is the one that survived');

select pg_temp.expect_true(
  (select count(*) = 0 from public.site_revisions where wedding_id = :w1 and note = 'v1'),
  'while the oldest is gone');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Pruning is per wedding
-- ---------------------------------------------------------------------------
-- The failure this prevents: one busy couple's publishing deletes another
-- couple's history.
begin;
set local role service_role;

insert into public.site_revisions (wedding_id, blocks, note) values (:w2, '[]'::jsonb, 'other couple');

do $$
declare i integer;
begin
  for i in 1..25 loop
    insert into public.site_revisions (wedding_id, blocks, published_at)
    values ('11111111-1111-4111-8111-111111111111', '[]'::jsonb, now() + (i || ' seconds')::interval);
  end loop;
end;
$$;

select pg_temp.expect(
  (select count(*)::int from public.site_revisions where wedding_id = :w2),
  1,
  'the other wedding''s revision is untouched');
rollback;

-- ---------------------------------------------------------------------------
-- 6. The shape checks
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

do $$
begin
  begin
    insert into public.site_blocks (wedding_id, type)
    values ('11111111-1111-4111-8111-111111111111', 'Hero; drop table');
    raise exception 'FAIL — a block type with punctuation was accepted';
  exception when check_violation then
    raise notice '  ok  a block type that could break a route is rejected';
  end;

  begin
    insert into public.site_blocks (wedding_id, type, payload)
    values ('11111111-1111-4111-8111-111111111111', 'prose', '"a string"'::jsonb);
    raise exception 'FAIL — a non-object payload was accepted';
  exception when check_violation then
    raise notice '  ok  a payload that is not an object is rejected';
  end;

  begin
    insert into public.site_revisions (wedding_id, blocks)
    values ('11111111-1111-4111-8111-111111111111', '{"not":"an array"}'::jsonb);
    raise exception 'FAIL — a revision that is not an array was accepted';
  exception when check_violation then
    raise notice '  ok  a revision must be an array of blocks';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 7. A page may hold many of one type
-- ---------------------------------------------------------------------------
-- The ceiling `site_content` imposed — one row per block_key per wedding — is
-- the whole reason this table exists.
begin;
set local role service_role;

insert into public.site_blocks (wedding_id, type, sort_order) values
  (:w1, 'photo_band', 500),
  (:w1, 'photo_band', 510),
  (:w1, 'photo_band', 520);

select pg_temp.expect(
  (select count(*)::int from public.site_blocks where wedding_id = :w1 and type = 'photo_band'),
  3,
  'three photo bands on one page is allowed');
rollback;

-- ---------------------------------------------------------------------------
-- 8. song_requests
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.song_requests (wedding_id, title, artist, asked_by)
values (:w1, 'Dancing Queen', 'ABBA', 'Someone at the shared site');

insert into public.song_requests (wedding_id, household_id, title)
values (:w1, 'd0000000-0000-4000-8000-000000000001', 'Mr. Brightside');

select pg_temp.expect(
  (select count(*)::int from public.song_requests where wedding_id = :w1),
  2,
  'a request can come with a household or with neither');

select pg_temp.expect_true(
  (select bool_and(status = 'new') from public.song_requests where wedding_id = :w1),
  'and arrives as new, for the planner to approve');

do $$
begin
  begin
    insert into public.song_requests (wedding_id, title, status)
    values ('11111111-1111-4111-8111-111111111111', 'Nonsense', 'played-twice');
    raise exception 'FAIL — an unknown status was accepted';
  exception when check_violation then
    raise notice '  ok  an unknown song status is rejected';
  end;

  begin
    insert into public.song_requests (wedding_id, title)
    values ('11111111-1111-4111-8111-111111111111', '');
    raise exception 'FAIL — a song with no name was accepted';
  exception when check_violation then
    raise notice '  ok  a song needs a name';
  end;
end;
$$;

-- A cut household keeps its request, unattributed: the request is not guest
-- data to reconstruct, but losing the song because somebody was cut from the
-- list would lose the DJ a track.
delete from public.households where id = 'd0000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select count(*)::int from public.song_requests where wedding_id = :w1),
  2,
  'deleting a household keeps its song request, without the name');
rollback;

-- ---------------------------------------------------------------------------
-- 9. RLS on all three tables, from another wedding's account
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.song_requests (wedding_id, title) values (:w1, 'Private');
reset role;

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*)::int from public.site_blocks), 0,
  'the other wedding''s collaborator sees no blocks');
select pg_temp.expect(
  (select count(*)::int from public.site_revisions), 0,
  'nor any published versions');
select pg_temp.expect(
  (select count(*)::int from public.song_requests), 0,
  'nor any song requests');
rollback;

-- ---------------------------------------------------------------------------
-- 10. The backfill left site_content alone
-- ---------------------------------------------------------------------------
-- Migrations are append-only and a rollback must not be a data loss, so the
-- old table is still there with the theme in it.
begin;
select pg_temp.expect(
  (select count(*)::int from public.site_content where wedding_id = :w1 and block_key = 'theme'),
  1,
  'the theme still lives in site_content, where /site/theme writes it');
rollback;
