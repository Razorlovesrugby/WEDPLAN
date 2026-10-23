-- ===========================================================================
-- Gift registry (migrations 0038, 0039; spec 36)
-- ===========================================================================
-- The assertions that matter, in the order they would hurt:
--
--   1. Tenancy, and `anon` reaches NOTHING. A claim is somebody's name and a
--      private message; the delivery address is the couple's home.
--   2. The claim function: the last unit goes to exactly one buyer, an
--      over-claim is refused with the true number left, an off or closed
--      registry refuses, and a release gives the unit back.
--   3. A visitor cannot call the functions themselves (service role only).
--   4. `remaining` (v_registry_items) is the one arithmetic and it ignores
--      released claims.
--   5. Constraints: web-scheme links only, no negative price, at most 8 specs,
--      a tag and an item from different weddings cannot be joined.
--   6. Deleting an item softly keeps its claims readable; deleting a wedding
--      takes everything with it.
--   7. The audit log redacts the claim token hash and the address.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set item1    '''f1111111-1111-4111-8111-111111111111'''
\set item2    '''f2222222-2222-4222-8222-222222222222'''
\set tag1     '''f3333333-3333-4333-8333-333333333333'''
\set tag2     '''f4444444-4444-4444-8444-444444444444'''

create or replace function pg_temp.expect(actual int, wanted int, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
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

-- A fixture: both weddings get a registry, the first with two items.
create or replace function pg_temp.fixture() returns void language plpgsql as $$
begin
  insert into public.registry_settings (wedding_id, enabled, open)
  values ('11111111-1111-4111-8111-111111111111', true, true),
         ('22222222-2222-4222-8222-222222222222', true, true);
  insert into public.registry_items (id, wedding_id, title, url, quantity, price_minor)
  values ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
          'Wine glasses', 'https://shop.test/glasses', 4, 12000),
         ('f2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
          'Casserole dish', 'https://shop.test/dish', 1, 25000);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Tenancy, and anon reaches nothing
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();
insert into public.registry_shipping (wedding_id, line1, city) values (:w1, '1 Test St', 'Wellington');
select * from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Aunt Jo', 'Congratulations!', 1, 'hash-aunt-jo');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.registry_items), 2,
  'a collaborator sees their own registry items');
select pg_temp.expect((select count(*)::int from public.registry_claims), 1,
  'and their own claims');
select pg_temp.expect((select count(*)::int from public.registry_shipping), 1,
  'and their delivery address');

set local role service_role;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.registry_items), 0,
  'another couple sees none of the items');
select pg_temp.expect((select count(*)::int from public.registry_claims), 0,
  'none of the claims (names and messages)');
select pg_temp.expect((select count(*)::int from public.registry_shipping), 0,
  'and not the address');
select pg_temp.expect((select count(*)::int from public.v_registry_items), 0,
  'nor the derived view');
rollback;

begin;
set local role anon;
select pg_temp.expect_fail('select count(*) from public.registry_claims',
  'a signed-out visitor cannot read claims at all');
select pg_temp.expect_fail('select count(*) from public.registry_shipping',
  'nor the delivery address');
select pg_temp.expect_fail('select count(*) from public.registry_items',
  'nor the items table (the public page reads through the server)');
select pg_temp.expect_fail('select count(*) from public.v_registry_items',
  'nor the view');
select pg_temp.expect_fail($q$select * from public.claim_registry_item(
  '11111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'x', null, 1, 'h')$q$,
  'and cannot call the claim function directly');
select pg_temp.expect_fail($q$select public.release_registry_claim('h')$q$,
  'or the release function');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :alex, true);
select pg_temp.expect_fail($q$select * from public.claim_registry_item(
  '11111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'x', null, 1, 'h')$q$,
  'a signed-in planner cannot call the claim function either (service role only)');
rollback;

-- ---------------------------------------------------------------------------
-- 2. The claim function
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();

select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Jo', 'hi', 3, 'h1')),
  'ok', 'claiming 3 of 4 succeeds');
select pg_temp.expect((select remaining from public.v_registry_items where id = :item1::uuid), 1,
  'and one is left, by the view');

select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Sam', null, 2, 'h2')),
  'sold_out', 'asking for 2 when 1 is left is refused');
select pg_temp.expect((select remaining from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Sam', null, 2, 'h2b')), 1,
  'and says how many are really left');
select pg_temp.expect((select count(*)::int from public.registry_claims where item_id = :item1::uuid), 1,
  'a refused claim writes nothing');

select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Sam', null, 1, 'h3')),
  'ok', 'the last unit goes to the next buyer');
select pg_temp.expect((select remaining from public.v_registry_items where id = :item1::uuid), 0,
  'and then nothing remains');
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Late', null, 1, 'h4')),
  'sold_out', 'a third buyer for a finished item is told it is gone');

select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'Zed', null, 0, 'h5')),
  'sold_out', 'a quantity below 1 is refused');
-- the item belongs to wedding 1; wedding 2 asking for it finds nothing
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w2::uuid, :item2::uuid, 'Zed', null, 1, 'h6')),
  'unavailable', 'another wedding cannot claim this wedding''s item');

-- release gives the unit back, once
select pg_temp.expect_text(public.release_registry_claim('h3')::text, 'true', 'a buyer can release their own claim');
select pg_temp.expect_text(public.release_registry_claim('h3')::text, 'false', 'but only once');
select pg_temp.expect((select remaining from public.v_registry_items where id = :item1::uuid), 1,
  'and the unit is back on the registry');
select pg_temp.expect_text(public.release_registry_claim('nonsense')::text, 'false',
  'an unknown token releases nothing');
select pg_temp.expect((select count(*)::int from public.registry_claims where released_at is not null), 1,
  'a release is soft: the row stays');

-- once it has arrived, "undo" would be a lie
update public.registry_claims set status = 'arrived' where claim_token_hash = 'h1';
select pg_temp.expect_text(public.release_registry_claim('h1')::text, 'false',
  'an arrived gift cannot be released by the buyer');
rollback;

-- off, closed, hidden, deleted
begin;
set local role service_role;
select pg_temp.fixture();
update public.registry_settings set open = false where wedding_id = :w1;
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'A', null, 1, 'x1')),
  'unavailable', 'a closed registry takes no claims');
update public.registry_settings set open = true, enabled = false where wedding_id = :w1;
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'A', null, 1, 'x2')),
  'unavailable', 'nor does one that is switched off');
update public.registry_settings set enabled = true where wedding_id = :w1;
update public.registry_items set hidden = true where id = :item2::uuid;
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'A', null, 1, 'x3')),
  'unavailable', 'a hidden item cannot be claimed');
update public.registry_items set hidden = false, deleted_at = now() where id = :item2::uuid;
select pg_temp.expect_text((select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'A', null, 1, 'x4')),
  'unavailable', 'nor a deleted one');
rollback;

-- the wedding-wide brake
begin;
set local role service_role;
select pg_temp.fixture();
insert into public.registry_items (wedding_id, title, url, quantity)
select '11111111-1111-4111-8111-111111111111', 'Item ' || g, 'https://shop.test/' || g, 1
from generate_series(1, 16) g;
do $$
declare r record; n int := 0;
begin
  for r in select id from public.registry_items where title like 'Item %' order by title loop
    perform * from public.claim_registry_item('11111111-1111-4111-8111-111111111111', r.id, 'J', null, 1, 'b' || n);
    n := n + 1;
  end loop;
end;
$$;
select pg_temp.expect((select count(*)::int from public.registry_claims), 15,
  'the 16th claim inside ten minutes is turned away (the brake is 15)');
select pg_temp.expect_text(
  (select outcome from public.claim_registry_item(:w1::uuid, :item2::uuid, 'J', null, 1, 'b99')),
  'busy', 'and it says busy');
rollback;

-- the lock the race turns on is in the function, not just in a comment
select pg_temp.expect(
  (select case when pg_get_functiondef('public.claim_registry_item(uuid,uuid,text,text,integer,text)'::regprocedure)
                      ~* 'for update' then 1 else 0 end),
  1, 'claim_registry_item locks the item row (FOR UPDATE)');

-- ---------------------------------------------------------------------------
-- 3/4. Derived `remaining` ignores released claims; quantity bound
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();
select * from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Jo', null, 2, 'r1');
select pg_temp.expect((select remaining from public.v_registry_items where id = :item1::uuid), 2,
  'remaining = wanted − claimed');
select public.release_registry_claim('r1');
select pg_temp.expect((select remaining from public.v_registry_items where id = :item1::uuid), 4,
  'a released claim counts for nothing');
rollback;

-- ---------------------------------------------------------------------------
-- 5. Constraints
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'javascript:alert(1)')$q$,
  'a javascript: link is refused');
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'ftp://x.test/a')$q$,
  'and so is any non-web scheme');
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url, price_minor)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'https://a.test', -1)$q$,
  'a negative price is refused');
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url, quantity)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'https://a.test', 0)$q$,
  'a quantity of zero is refused');
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url, specs)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'https://a.test', '{"a":1}')$q$,
  'specs must be a list');
select pg_temp.expect_fail($q$insert into public.registry_items (wedding_id, title, url, specs)
  values ('11111111-1111-4111-8111-111111111111', 'Bad', 'https://a.test',
          '[1,2,3,4,5,6,7,8,9]')$q$,
  'and no more than eight');
select pg_temp.expect_fail($q$insert into public.registry_claims (wedding_id, item_id, name, claim_token_hash)
  values ('11111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', '   ', 'z')$q$,
  'a blank name is refused');
select pg_temp.expect_fail($q$insert into public.registry_claims (wedding_id, item_id, name, claim_token_hash, status)
  values ('11111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Z', 'z2', 'banana')$q$,
  'an unknown status is refused');
select * from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Jo', null, 1, 'dup');
select pg_temp.expect_fail($q$insert into public.registry_claims (wedding_id, item_id, name, claim_token_hash)
  values ('11111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Z', 'dup')$q$,
  'two claims cannot share a token hash');

-- tags: same-wedding only, by composite FK
insert into public.registry_tags (id, wedding_id, name) values
  (:tag1::uuid, :w1::uuid, 'Kitchen'), (:tag2::uuid, :w2::uuid, 'Garden');
insert into public.registry_item_tags (item_id, tag_id, wedding_id) values (:item1::uuid, :tag1::uuid, :w1::uuid);
select pg_temp.expect_fail($q$insert into public.registry_item_tags (item_id, tag_id, wedding_id)
  values ('f1111111-1111-4111-8111-111111111111', 'f4444444-4444-4444-8444-444444444444',
          '11111111-1111-4111-8111-111111111111')$q$,
  'a tag from another wedding cannot be put on an item');
select pg_temp.expect_fail($q$insert into public.registry_tags (wedding_id, name)
  values ('11111111-1111-4111-8111-111111111111', 'KITCHEN')$q$,
  'a tag name is unique per wedding, ignoring case');
rollback;

-- ---------------------------------------------------------------------------
-- 6. Soft delete, wedding delete
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();
select * from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Jo', 'keep me', 1, 'keep');
update public.registry_items set deleted_at = now() where id = :item1::uuid;
select pg_temp.expect((select count(*)::int from public.registry_claims where message = 'keep me'), 1,
  'soft-deleting an item leaves its claims readable');
rollback;

-- ---------------------------------------------------------------------------
-- 7. Audit: credentials and the address are redacted
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.fixture();
insert into public.registry_shipping (wedding_id, line1, postcode) values (:w1, '1 Secret Lane', '6011');
select * from public.claim_registry_item(:w1::uuid, :item1::uuid, 'Jo', 'hello', 1, 'topsecrethash');
select pg_temp.expect_text(
  (select changed ->> 'claim_token_hash' from public.audit_log
    where table_name = 'registry_claims' and action = 'insert' order by id desc limit 1),
  '[redacted]', 'the audit log never holds a claim token hash');
select pg_temp.expect_text(
  (select changed ->> 'line1' from public.audit_log
    where table_name = 'registry_shipping' and action = 'insert' order by id desc limit 1),
  '[redacted]', 'nor the delivery address');
select pg_temp.expect_text(
  (select actor_kind from public.audit_log
    where table_name = 'registry_claims' and action = 'insert' order by id desc limit 1),
  'public', 'and a visitor''s claim is recorded as a public write');
rollback;

-- Deleting a wedding takes the registry with it.
begin;
set local role service_role;
select pg_temp.fixture();
insert into public.registry_shipping (wedding_id, line1) values (:w2, 'x');
delete from public.weddings where id = :w2;
select pg_temp.expect((select count(*)::int from public.registry_settings where wedding_id = :w2), 0,
  'deleting a wedding removes its registry settings');
rollback;
