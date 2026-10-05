-- ===========================================================================
-- Gift bank details (migration 0033)
-- ===========================================================================
-- A couple's bank account number is the most sensitive thing a guest-facing
-- table has held, so the assertions are about who can reach it and what it
-- can hold:
--
--   1. Tenancy. Another couple's session sees nothing of it, and a signed-out
--      visitor fails at the privilege check rather than at a policy.
--   2. One row per wedding. The primary key is the wedding, so a second row
--      cannot exist.
--   3. The account number is digits only, 15 or 16 of them. Anything else —
--      a formatted string, letters, a short number — is refused, so the
--      formatting is always presentation and never data.
--   4. Deleting a wedding takes its details with it.
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
insert into public.gift_bank_details (wedding_id, account_name, account_number)
values (:w1, 'Ray & Olivia Smith', '123456789012300'),
       (:w2, 'Their Account',      '010203040506070');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.gift_bank_details), 1,
  'a collaborator sees their own wedding''s details and no other');
select pg_temp.expect(
  (select count(*)::int from public.gift_bank_details where wedding_id = :w2), 0,
  'and sees nothing at all of the other wedding''s');

-- Nor write to it. Row-level security does not raise for this: the other
-- wedding's row is simply not one of the rows the update can see, so it
-- matches nothing. The proof is that the number is unchanged afterwards.
update public.gift_bank_details set account_number = '999999999999999' where wedding_id = :w2;
set local role service_role;
select pg_temp.expect(
  (select count(*)::int from public.gift_bank_details where account_number = '999999999999999'), 0,
  'and an update aimed at the other wedding''s row changes nothing');
select pg_temp.expect(
  (select count(*)::int from public.gift_bank_details where wedding_id = :w2 and account_number = '010203040506070'), 1,
  'their account number is exactly as they left it');

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*)::int from public.gift_bank_details), 1,
  'the other couple sees only theirs');
rollback;

-- A signed-out visitor fails at the privilege check, not at the policy: the
-- grant itself is gone, so a future policy mistake cannot become an exposure
-- on its own. Same argument as 01_tenancy.sql §5 and 13_gift_funds.sql.
begin;
set local role anon;
select pg_temp.expect_fail('select count(*) from public.gift_bank_details',
  'a signed-out visitor cannot read the table at all');
rollback;

-- ---------------------------------------------------------------------------
-- 2. One row per wedding
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.gift_bank_details (wedding_id, account_name) values (:w1, 'First');
select pg_temp.expect_fail(
  format('insert into public.gift_bank_details (wedding_id, account_name) values (%L, %L)', :w1, 'Second'),
  'a second row for the same wedding is refused');
rollback;

-- ---------------------------------------------------------------------------
-- 3. The account number is digits, and enough of them
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
select pg_temp.expect_fail(
  format('insert into public.gift_bank_details (wedding_id, account_number) values (%L, %L)',
         :w1, '12-3456-7890123-00'),
  'a formatted number is refused — the grouping is presentation, not data');
select pg_temp.expect_fail(
  format('insert into public.gift_bank_details (wedding_id, account_number) values (%L, %L)',
         :w1, '12345678901234'),
  'fourteen digits is too short for a NZ account');
select pg_temp.expect_fail(
  format('insert into public.gift_bank_details (wedding_id, account_number) values (%L, %L)',
         :w1, '12345678901234567'),
  'seventeen digits is too long');
select pg_temp.expect_fail(
  format('insert into public.gift_bank_details (wedding_id, account_number) values (%L, %L)',
         :w1, '1234567890123AB'),
  'letters are refused');

-- Both real shapes go in: a two-digit suffix and a three-digit one.
insert into public.gift_bank_details (wedding_id, account_number) values (:w1, '123456789012300');
select pg_temp.expect((select count(*)::int from public.gift_bank_details where wedding_id = :w1), 1,
  'a fifteen-digit number (two-digit suffix) is accepted');
update public.gift_bank_details set account_number = '1234567890123001' where wedding_id = :w1;
select pg_temp.expect(
  (select count(*)::int from public.gift_bank_details where account_number = '1234567890123001'), 1,
  'and so is sixteen (three-digit suffix)');
-- Not having one yet is a state: the row exists before the couple has typed it.
update public.gift_bank_details set account_number = null where wedding_id = :w1;
select pg_temp.expect(
  (select count(*)::int from public.gift_bank_details where wedding_id = :w1 and account_number is null), 1,
  'a row with no account number yet is allowed');
select pg_temp.expect_fail(
  format('update public.gift_bank_details set account_name = %L where wedding_id = %L', '', :w1),
  'an empty account name is refused rather than stored as nothing');
rollback;

-- ---------------------------------------------------------------------------
-- 4. Deleting a wedding takes its details with it
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.gift_bank_details (wedding_id, account_name, account_number)
values (:w2, 'Doomed', '010203040506070');
delete from public.weddings where id = :w2;
select pg_temp.expect((select count(*)::int from public.gift_bank_details where wedding_id = :w2), 0,
  'the details go with the wedding');
rollback;

\o
\echo '  16_gift_bank_details.sql passed'
