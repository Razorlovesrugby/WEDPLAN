-- ===========================================================================
-- Gift funds (migration 0030)
-- ===========================================================================
-- Four assertions, and each one is a thing that would be expensive or
-- embarrassing rather than merely wrong:
--
--   1. Tenancy. A fund is money on a wedding's own page; another couple's
--      session must not see it, and a signed-out visitor must not reach the
--      table at all.
--   2. The `contribute_url` check actually refuses a non-web scheme. That
--      column ends up in an href in front of every guest, and the app layer
--      refusing it is the second gate, not the only one.
--   3. Money cannot go negative, and a target cannot be zero — a zero target
--      would divide a progress rule by nothing.
--   4. Deleting a wedding takes its funds with it, and nothing else does.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
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
-- 1. Tenancy
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.gift_funds (wedding_id, name, target_minor, raised_minor, contribute_url)
values (:w1, 'The honeymoon', 120000, 74000, 'https://wise.test/pay/abc'),
       (:w2, 'Their honeymoon', 50000, 0, null);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.gift_funds), 1,
  'a collaborator sees their own wedding''s fund and no other');
select pg_temp.expect(
  (select count(*)::int from public.gift_funds where wedding_id = :w2), 0,
  'and sees nothing at all of the other wedding''s');

set local role service_role;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.gift_funds), 1,
  'the other couple sees only theirs');
rollback;

-- A signed-out visitor fails at the privilege check, not at the policy: the
-- grant itself is gone, so a future policy mistake cannot become an exposure
-- on its own. Same argument as 01_tenancy.sql §5.
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.gift_funds;
    raise exception 'FAIL — anon could query gift_funds';
  exception
    when insufficient_privilege then
      raise notice '  ok  anon has no grant on gift_funds at all';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 2. contribute_url is http(s) or nothing
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.expect_fail(
  'insert into public.gift_funds (wedding_id, name, contribute_url)
   values (''11111111-1111-4111-8111-111111111111'', ''Bad'', ''javascript:alert(1)'')',
  'a javascript: URL is refused by the database, not only by the action');

select pg_temp.expect_fail(
  'insert into public.gift_funds (wedding_id, name, contribute_url)
   values (''11111111-1111-4111-8111-111111111111'', ''Bad'', ''wise.test/pay'')',
  'a bare host with no scheme is refused too');

insert into public.gift_funds (wedding_id, name, contribute_url)
values (:w1, 'Fine', 'https://wise.test/pay/abc');
select pg_temp.expect((select count(*)::int from public.gift_funds where name = 'Fine'), 1,
  'an https URL is accepted');
rollback;

-- ---------------------------------------------------------------------------
-- 3. The money cannot lie
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.expect_fail(
  'insert into public.gift_funds (wedding_id, name, raised_minor)
   values (''11111111-1111-4111-8111-111111111111'', ''Negative'', -1)',
  'a negative raised figure is refused');

select pg_temp.expect_fail(
  'insert into public.gift_funds (wedding_id, name, target_minor)
   values (''11111111-1111-4111-8111-111111111111'', ''Zero target'', 0)',
  'a zero target is refused — a progress rule cannot be a proportion of nothing');

select pg_temp.expect_fail(
  'insert into public.gift_funds (wedding_id, name) values
   (''11111111-1111-4111-8111-111111111111'', '''')',
  'a nameless fund is refused');

-- A fund with no target is a real thing — "anything towards the honeymoon" —
-- and the renderer draws no rule for it.
insert into public.gift_funds (wedding_id, name, target_minor) values (:w1, 'Open-ended', null);
select pg_temp.expect(
  (select count(*)::int from public.gift_funds where name = 'Open-ended' and target_minor is null),
  1, 'a fund with no target is allowed');

-- Raised beyond target is allowed: it is a good thing that happened, and the
-- clamp belongs in the renderer rather than in a constraint that would refuse
-- the truth.
insert into public.gift_funds (wedding_id, name, target_minor, raised_minor)
values (:w1, 'Over', 100000, 140000);
select pg_temp.expect(
  (select count(*)::int from public.gift_funds where name = 'Over'), 1,
  'a fund that beat its target is storable');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Deleting the wedding takes its funds
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.gift_funds (wedding_id, name) values (:w2, 'Doomed');
delete from public.weddings where id = :w2;
select pg_temp.expect((select count(*)::int from public.gift_funds where wedding_id = :w2), 0,
  'the funds go with the wedding');
rollback;

\o
\echo '  13_gift_funds.sql passed'
