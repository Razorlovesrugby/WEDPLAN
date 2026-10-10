-- ===========================================================================
-- The song chart (migration 0035, spec 31)
-- ===========================================================================
-- What is worth asserting:
--
--   1. One track, one row. Two households picking the same search result in
--      the same second must land on the same row, so the index has to hold
--      it — within a wedding, and only within one.
--   2. played_at follows status, in both directions, and a re-save of a
--      played song does not move its time.
--   3. The artwork column cannot hold an address that is not Apple's image
--      host, so the proxy that reads it can never be made into a relay.
--   4. Still closed to `anon` — nothing here widened who may read the list.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''

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

create or replace function pg_temp.expect_fail(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ok  %', label;
    return;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. One track, one row — per wedding
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.song_requests (wedding_id, title, artist, catalogue_id)
values (:w1, 'Mr. Brightside', 'The Killers', '1234567');

select pg_temp.expect_fail(
  'insert into public.song_requests (wedding_id, title, catalogue_id)
   values (''11111111-1111-4111-8111-111111111111'', ''Mr Brightside'', ''1234567'')',
  'the same track twice in one wedding is refused');

insert into public.song_requests (wedding_id, title, catalogue_id)
values (:w2, 'Mr. Brightside', '1234567');
select pg_temp.expect(
  (select count(*)::int from public.song_requests where catalogue_id = '1234567'), 2,
  'but two weddings may each have it');

insert into public.song_requests (wedding_id, title) values (:w1, 'Typed in'), (:w1, 'Typed in');
select pg_temp.expect(
  (select count(*)::int from public.song_requests where wedding_id = :w1 and title = 'Typed in'), 2,
  'songs typed in by hand carry no catalogue id and are not held by the index');

select pg_temp.expect_fail(
  'insert into public.song_requests (wedding_id, title, catalogue_id)
   values (''11111111-1111-4111-8111-111111111111'', ''x'', ''12ab'')',
  'a catalogue id is digits only');
rollback;

-- ---------------------------------------------------------------------------
-- 2. played_at follows status
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.song_requests (id, wedding_id, title, status)
values ('bb000000-0000-4000-8000-000000000001', :w1, 'September', 'approved');

select pg_temp.expect_true(
  (select played_at is null from public.song_requests where id = 'bb000000-0000-4000-8000-000000000001'),
  'an approved song has no played time');

update public.song_requests set status = 'played' where id = 'bb000000-0000-4000-8000-000000000001';
select pg_temp.expect_true(
  (select played_at is not null from public.song_requests where id = 'bb000000-0000-4000-8000-000000000001'),
  'marking it played stamps the time');

update public.song_requests set played_at = '2020-01-01T00:00:00Z'
  where id = 'bb000000-0000-4000-8000-000000000001';
update public.song_requests set status = 'played' where id = 'bb000000-0000-4000-8000-000000000001';
select pg_temp.expect_true(
  (select played_at = '2020-01-01T00:00:00Z' from public.song_requests
    where id = 'bb000000-0000-4000-8000-000000000001'),
  're-saving a played song leaves its time where it was');

update public.song_requests set status = 'approved' where id = 'bb000000-0000-4000-8000-000000000001';
select pg_temp.expect_true(
  (select played_at is null from public.song_requests where id = 'bb000000-0000-4000-8000-000000000001'),
  'and un-playing it clears the time');

insert into public.song_requests (wedding_id, title, status) values (:w1, 'Born played', 'played');
select pg_temp.expect_true(
  (select played_at is not null from public.song_requests where wedding_id = :w1 and title = 'Born played'),
  'a song inserted as played is stamped too');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Artwork is Apple's image host or nothing
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.song_requests (wedding_id, title, artwork_url)
values (:w1, 'Valerie', 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg');
select pg_temp.expect(
  (select count(*)::int from public.song_requests where wedding_id = :w1 and title = 'Valerie'), 1,
  'an mzstatic.com artwork address is accepted');

select pg_temp.expect_fail(
  'insert into public.song_requests (wedding_id, title, artwork_url)
   values (''11111111-1111-4111-8111-111111111111'', ''x'', ''https://evil.example/mzstatic.com/a.jpg'')',
  'any other host is refused');
select pg_temp.expect_fail(
  'insert into public.song_requests (wedding_id, title, artwork_url)
   values (''11111111-1111-4111-8111-111111111111'', ''x'', ''https://mzstatic.com.evil.example/a.jpg'')',
  'including a look-alike that merely starts with the name');
select pg_temp.expect_fail(
  'insert into public.song_requests (wedding_id, title, artwork_url)
   values (''11111111-1111-4111-8111-111111111111'', ''x'', ''http://is1-ssl.mzstatic.com/a.jpg'')',
  'and plain http');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Still closed to anon
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_true(
  not has_table_privilege('anon', 'public.song_requests', 'select'),
  'a signed-out visitor still cannot read the song list directly');
select pg_temp.expect_true(
  not has_table_privilege('anon', 'public.song_votes', 'select'),
  'nor the votes');
rollback;
