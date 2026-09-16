-- ===========================================================================
-- Moodboard tests (specs 9 and 9.1)
-- ===========================================================================
-- Three things are under test here, and they fail differently:
--
--   RLS            silently returns zero rows, or raises 42501 on write
--   composite FK   raises 23503 even for a role that bypasses RLS entirely
--   check/index    raises 23514 or 23505 for everyone, service role included
--
-- The last group matters more than usual in this feature. There are NO RLS
-- policies on the storage bucket at all — every object is written and signed
-- by the service role — so the database constraints are what is left when
-- application code is wrong.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex  '''aaaaaaaa-0000-4000-8000-000000000001'''
\set w1    '''11111111-1111-4111-8111-111111111111'''
\set w2    '''22222222-2222-4222-8222-222222222222'''
\set board '''c1000000-0000-4000-8000-000000000001'''
\set dress '''c1000000-0000-4000-8000-000000000002'''
\set other '''c1000000-0000-4000-8000-0000000000ff'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_bool(actual boolean, wanted boolean, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. A collaborator sees their own boards, and nothing of the other wedding
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect((select count(*) from public.moodboards), 2, 'alex sees 2 moodboards');
select pg_temp.expect((select count(*) from public.moodboard_items), 4, 'alex sees 4 items');
select pg_temp.expect((select count(*) from public.moodboard_shares), 3, 'alex sees 3 shares');
select pg_temp.expect(
  (select count(*) from public.moodboards where wedding_id = :w2), 0,
  'alex sees no moodboards from wedding 2');
select pg_temp.expect(
  (select count(*) from public.moodboard_items where wedding_id = :w2), 0,
  'alex sees no items from wedding 2');
select pg_temp.expect(
  (select count(*) from public.moodboard_clip_tokens where wedding_id = :w2), 0,
  'alex sees no clip tokens from wedding 2');

-- A share token hash is a credential. A collaborator on another wedding must
-- not be able to read one and open the board with it.
select pg_temp.expect(
  (select count(*) from public.moodboard_shares where wedding_id = :w2), 0,
  'alex cannot read another wedding''s share tokens');

-- ---------------------------------------------------------------------------
-- 2. Writes into the other wedding are refused
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.moodboards (wedding_id, title)
    values ('22222222-2222-4222-8222-222222222222', 'Gatecrasher board');
    raise exception 'FAIL — cross-wedding moodboard insert was allowed';
  exception
    when insufficient_privilege then raise notice '  ok  cross-wedding insert blocked by RLS';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 3. The composite FK stops the SERVICE ROLE too
-- ---------------------------------------------------------------------------
-- This is the one that matters: the service role is what /api/clip and the
-- share resolver run as, and it bypasses RLS entirely.
begin;
set local role service_role;

do $$
begin
  begin
    insert into public.moodboard_items
      (wedding_id, moodboard_id, storage_path, thumb_path, content_type, byte_size)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-0000000000ff',
            'x', 'x', 'image/webp', 1);
    raise exception 'FAIL — item in wedding 1 attached to a board in wedding 2';
  exception
    when foreign_key_violation then raise notice '  ok  composite FK refuses a cross-wedding item';
  end;

  begin
    insert into public.moodboard_shares
      (wedding_id, moodboard_id, channel, token_hash, token_encrypted)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-0000000000ff',
            'link', 'x', 'x');
    raise exception 'FAIL — share in wedding 1 attached to a board in wedding 2';
  exception
    when foreign_key_violation then raise notice '  ok  composite FK refuses a cross-wedding share';
  end;

  begin
    insert into public.moodboard_clip_tokens
      (wedding_id, label, token_hash, token_encrypted, default_moodboard_id)
    values ('11111111-1111-4111-8111-111111111111', 'Bad default', 'x1', 'x1',
            'c1000000-0000-4000-8000-0000000000ff');
    raise exception 'FAIL — clip token defaulted to a board in another wedding';
  exception
    when foreign_key_violation then raise notice '  ok  composite FK refuses a cross-wedding default board';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. One cover per board
-- ---------------------------------------------------------------------------
-- In the database and not just in the action, because v_moodboards joins on
-- it expecting one row: two covers would duplicate a board on /moodboards
-- rather than fail loudly.
do $$
begin
  begin
    update public.moodboard_items set is_cover = true
    where id = 'c2000000-0000-4000-8000-000000000002';
    raise exception 'FAIL — a second cover was allowed on one board';
  exception
    when unique_violation then raise notice '  ok  a board cannot have two covers';
  end;
end;
$$;

-- ...but two different boards may each have one.
select pg_temp.expect(
  (select count(*) from public.moodboard_items where is_cover), 2,
  'two boards, one cover each');

-- ---------------------------------------------------------------------------
-- 5. A token is required exactly where the channel needs one
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.moodboard_shares (wedding_id, moodboard_id, channel)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 'link');
    raise exception 'FAIL — a link share with no token was allowed';
  exception
    when check_violation then raise notice '  ok  a link share must carry a token';
  end;

  -- The other direction matters as much: a channel that needs no credential
  -- must not be storing one.
  begin
    insert into public.moodboard_shares
      (wedding_id, moodboard_id, channel, token_hash, token_encrypted)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
            'public_site', 'stray', 'stray');
    raise exception 'FAIL — a public_site share was allowed to carry a token';
  exception
    when check_violation then raise notice '  ok  a tokenless channel cannot store a token';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. One public_site and one rsvp share per board; links are unlimited
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.moodboard_shares (wedding_id, moodboard_id, channel)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002', 'rsvp');
    raise exception 'FAIL — a second rsvp share was allowed on one board';
  exception
    when unique_violation then raise notice '  ok  one rsvp share per board';
  end;
end;
$$;

insert into public.moodboard_shares
  (wedding_id, moodboard_id, channel, label, token_hash, token_encrypted)
values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
        'link', 'Third link', 'seed-hash-third', 'seed-encrypted-third');
select pg_temp.expect(
  (select count(*) from public.moodboard_shares
    where moodboard_id = :board and channel = 'link'), 3,
  'link shares are unlimited — one per recipient is the point');

-- Token hashes are globally unique: two weddings must never collide.
do $$
begin
  begin
    insert into public.moodboard_shares
      (wedding_id, moodboard_id, channel, token_hash, token_encrypted)
    values ('22222222-2222-4222-8222-222222222222', 'c1000000-0000-4000-8000-0000000000ff',
            'link', 'seed-hash-photographer', 'x');
    raise exception 'FAIL — a duplicate token hash was allowed across weddings';
  exception
    when unique_violation then raise notice '  ok  token hashes are globally unique';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Import dedupe
-- ---------------------------------------------------------------------------
-- The whole re-import story: a pin already on the board is refused, and the
-- many rows with no pin id do not collide with each other.
do $$
begin
  begin
    insert into public.moodboard_items
      (wedding_id, moodboard_id, storage_path, thumb_path, content_type, byte_size, external_id)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001',
            'a', 'b', 'image/webp', 1, '813744956860114778');
    raise exception 'FAIL — the same pin was imported twice into one board';
  exception
    when unique_violation then raise notice '  ok  a pin cannot be imported twice into one board';
  end;
end;
$$;

-- The same pin on a DIFFERENT board is fine: two boards, two purposes.
insert into public.moodboard_items
  (wedding_id, moodboard_id, storage_path, thumb_path, content_type, byte_size, external_id, uploaded_at)
values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002',
        'c', 'd', 'image/webp', 1, '813744956860114778', now());
select pg_temp.expect(
  (select count(*) from public.moodboard_items where external_id = '813744956860114778'), 2,
  'the same pin may sit on two different boards');

-- ---------------------------------------------------------------------------
-- 8. v_moodboards
-- ---------------------------------------------------------------------------
-- item_count counts uploaded items only: a row whose bytes never arrived is
-- not on the board.
select pg_temp.expect(
  (select item_count from public.v_moodboards where id = :board), 2,
  'item_count ignores an upload that never finished');
select pg_temp.expect(
  (select total_bytes from public.v_moodboards where id = :board), 420000,
  'total_bytes sums the board');
select pg_temp.expect(
  (select link_share_count from public.v_moodboards where id = :board), 3,
  'link_share_count counts live links');
select pg_temp.expect_bool(
  (select published_to_rsvp from public.v_moodboards where id = :dress), true,
  'the dress-code board is published to the RSVP page');
select pg_temp.expect_bool(
  (select published_to_site from public.v_moodboards where id = :dress), false,
  '...but not to the public site');

-- A revoked link stops counting; the row survives, so the label and the view
-- count remain as a record of what was sent to whom.
update public.moodboard_shares set revoked_at = now()
 where id = 'c3000000-0000-4000-8000-000000000002';
select pg_temp.expect(
  (select link_share_count from public.v_moodboards where id = :board), 2,
  'a revoked link stops counting');
select pg_temp.expect(
  (select count(*) from public.moodboard_shares where id = 'c3000000-0000-4000-8000-000000000002'), 1,
  '...but the row and its view count survive');

-- An expired link is dead too, without being revoked.
update public.moodboard_shares set expires_at = now() - interval '1 day'
 where id = 'c3000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select link_share_count from public.v_moodboards where id = :board), 1,
  'an expired link stops counting');

-- The cover falls back to the first item when none is flagged.
update public.moodboard_items set is_cover = false where moodboard_id = :board;
select pg_temp.expect_bool(
  (select cover_thumb_path is not null from public.v_moodboards where id = :board), true,
  'a board with no flagged cover still shows a picture');

-- An archived board leaves the view entirely.
update public.moodboards set archived_at = now() where id = :dress;
select pg_temp.expect(
  (select count(*) from public.v_moodboards where wedding_id = :w1), 1,
  'an archived board leaves v_moodboards');

-- ---------------------------------------------------------------------------
-- 9. Deleting a board takes its items and shares with it
-- ---------------------------------------------------------------------------
delete from public.moodboards where id = :board;
select pg_temp.expect(
  (select count(*) from public.moodboard_items where moodboard_id = :board), 0,
  'deleting a board cascades its items');
select pg_temp.expect(
  (select count(*) from public.moodboard_shares where moodboard_id = :board), 0,
  'deleting a board cascades its shares');
-- The clip token that defaulted to it survives, pointing at nothing.
select pg_temp.expect(
  (select count(*) from public.moodboard_clip_tokens
    where id = 'c4000000-0000-4000-8000-000000000001' and default_moodboard_id is null), 1,
  'a clip token outlives its default board');

rollback;

-- ---------------------------------------------------------------------------
-- 10. anon is granted nothing
-- ---------------------------------------------------------------------------
-- The public board page reads through the service role after resolving a
-- token. No browser ever talks to PostgREST for this data.
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.moodboards;
    raise exception 'FAIL — anon could query moodboards';
  exception
    when insufficient_privilege then raise notice '  ok  anon cannot query moodboards';
  end;

  begin
    perform count(*) from public.moodboard_shares;
    raise exception 'FAIL — anon could read share tokens';
  exception
    when insufficient_privilege then raise notice '  ok  anon cannot read share tokens';
  end;

  begin
    perform count(*) from public.moodboard_clip_tokens;
    raise exception 'FAIL — anon could read clip tokens';
  exception
    when insufficient_privilege then raise notice '  ok  anon cannot read clip tokens';
  end;

  begin
    perform count(*) from public.pinterest_accounts;
    raise exception 'FAIL — anon could read stored Pinterest tokens';
  exception
    when insufficient_privilege then raise notice '  ok  anon cannot read Pinterest tokens';
  end;

  begin
    perform count(*) from public.v_moodboards;
    raise exception 'FAIL — anon could query v_moodboards';
  exception
    when insufficient_privilege then raise notice '  ok  anon cannot query v_moodboards';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 11. One Pinterest connection per wedding
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.pinterest_accounts (wedding_id, external_user_id, access_token_encrypted)
values ('11111111-1111-4111-8111-111111111111', 'pinterest-user-1', 'encrypted');

do $$
begin
  begin
    insert into public.pinterest_accounts (wedding_id, external_user_id, access_token_encrypted)
    values ('11111111-1111-4111-8111-111111111111', 'pinterest-user-2', 'encrypted');
    raise exception 'FAIL — a second Pinterest account was allowed on one wedding';
  exception
    when unique_violation then raise notice '  ok  one Pinterest connection per wedding';
  end;
end;
$$;
rollback;
