-- ===========================================================================
-- Vendors (spec 8, migration 0029)
-- ===========================================================================
-- The assertions worth having are the ones where a mistake costs money or
-- leaks a tenant:
--
--   1. Deleting a vendor must NEVER take a budget line, or a payment, with it.
--      This is the single most expensive thing this feature could get wrong.
--   2. The partial unique index must actually refuse a second primary contact,
--      because v_vendors left-joins on it and two primaries would silently
--      duplicate a vendor on /vendors rather than fail loudly.
--   3. v_vendors' money must equal the sum of that vendor's v_budget_items
--      rows — it is allowed to sum and nothing else.
--   4. A rename must reach /budget and the digest with no sync step.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set barn     '''e0000000-0000-4000-8000-000000000001'''
\set bloom    '''e0000000-0000-4000-8000-000000000002'''
\set ciara    '''ea000000-0000-4000-8000-000000000002'''
\set marcus   '''ea000000-0000-4000-8000-000000000001'''

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


-- A budget line linked to the venue, built here rather than seeded:
-- 03_budget.sql counts categories globally, so a seeded one breaks it.
create or replace function pg_temp.link_a_line() returns uuid language plpgsql as $$
declare cat uuid; item uuid;
begin
  insert into public.budget_categories (wedding_id, name, sort_order)
  values ('11111111-1111-4111-8111-111111111111', 'Venue (fixture)', 900)
  returning id into cat;

  insert into public.budget_items
    (wedding_id, category_id, label, vendor_name, quantity_basis, contracted,
     gst_treatment, vendor_id)
  values ('11111111-1111-4111-8111-111111111111', cat, 'The barn, all day',
          'The Old Barn', 'flat', 780000, 'inclusive',
          'e0000000-0000-4000-8000-000000000001')
  returning id into item;

  insert into public.payments (wedding_id, budget_item_id, amount, due_date, paid_at)
  values ('11111111-1111-4111-8111-111111111111', item, 200000,
          current_date - 30, now());

  return item;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The backfill seeded vendor categories from the budget's own names
-- ---------------------------------------------------------------------------
-- The one concession to question 1's cost: the two taxonomies start aligned
-- rather than the vendor one starting empty. They are free to diverge after
-- this, and nothing syncs them.
begin;
select pg_temp.expect_true(
  (select count(*) > 0 from public.vendor_categories where wedding_id = :w1),
  'vendor categories were seeded from the budget category names');

select pg_temp.expect(
  (select count(*)::int
     from public.budget_categories bc
    where bc.wedding_id = :w1
      and not exists (
        select 1 from public.vendor_categories vc
        where vc.wedding_id = bc.wedding_id and vc.name = bc.name)),
  0,
  'every budget category name has a vendor category to match');

select pg_temp.expect_fail(
  'insert into public.vendor_categories (wedding_id, name)
   select wedding_id, name from public.vendor_categories
    where wedding_id = ''11111111-1111-4111-8111-111111111111'' limit 1',
  'two categories cannot share a name within one wedding');
rollback;

-- ---------------------------------------------------------------------------
-- 2. One primary contact per vendor, enforced by the index
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect(
  (select count(*)::int from public.vendor_contacts
    where vendor_id = :barn and is_primary),
  1,
  'the venue has exactly one primary contact');

select pg_temp.expect_fail(
  'update public.vendor_contacts set is_primary = true
    where id = ''ea000000-0000-4000-8000-000000000001''',
  'a second primary is refused by the partial unique index, not by an action');

-- The action clears the old one first for exactly this reason. Doing it in
-- that order works; the reverse is what the index above rejects.
update public.vendor_contacts set is_primary = false where id = :ciara;
update public.vendor_contacts set is_primary = true where id = :marcus;
select pg_temp.expect(
  (select count(*)::int from public.vendor_contacts where vendor_id = :barn and is_primary),
  1,
  'clearing then setting hands the primary over cleanly');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Deleting a vendor must never delete money
-- ---------------------------------------------------------------------------
-- The most expensive mistake available to this feature.
begin;
select pg_temp.link_a_line();
select pg_temp.expect_true(
  (select count(*) > 0 from public.budget_items where vendor_id = :barn),
  'the venue starts with at least one budget line');

-- Snapshot what the line looks like before.
create temp table before_delete as
select id, vendor_name, vendor_id,
       (select count(*) from public.payments p where p.budget_item_id = bi.id) as payment_count
from public.budget_items bi where bi.vendor_id = :barn;

delete from public.vendors where id = :barn;

select pg_temp.expect(
  (select count(*)::int from public.budget_items bi
     join before_delete b on b.id = bi.id),
  (select count(*)::int from before_delete),
  'every budget line still exists');

select pg_temp.expect_true(
  (select bool_and(bi.vendor_id is null)
     from public.budget_items bi join before_delete b on b.id = bi.id),
  'their vendor_id is nulled rather than the row being taken');

select pg_temp.expect_true(
  (select bool_and(bi.vendor_name = b.vendor_name)
     from public.budget_items bi join before_delete b on b.id = bi.id),
  'and the snapshot name survives, so the line reads "The Old Barn" not blank');

select pg_temp.expect_true(
  (select bool_and(
     (select count(*) from public.payments p where p.budget_item_id = bi.id) = b.payment_count)
     from public.budget_items bi join before_delete b on b.id = bi.id),
  'every payment on those lines is untouched');

select pg_temp.expect(
  (select count(*)::int from public.vendor_contacts where vendor_id = :barn),
  0,
  'its contacts cascade — they have no meaning without the vendor');
select pg_temp.expect(
  (select count(*)::int from public.vendor_notes where vendor_id = :barn),
  0,
  'and so do its notes');
rollback;

-- ---------------------------------------------------------------------------
-- 4. v_vendors sums, and computes nothing
-- ---------------------------------------------------------------------------
begin;
select pg_temp.link_a_line();
select pg_temp.expect_true(
  (select v.committed = coalesce(
      (select sum(bi.computed_current) from public.v_budget_items bi where bi.vendor_id = v.id), 0)
     from public.v_vendors v where v.id = :barn),
  'committed equals the sum of the vendor''s budget lines and nothing else');

select pg_temp.expect_true(
  (select v.paid = coalesce(
      (select sum(bi.paid) from public.v_budget_items bi where bi.vendor_id = v.id), 0)
     from public.v_vendors v where v.id = :barn),
  'so does paid');

select pg_temp.expect(
  (select contact_count::int from public.v_vendors where id = :barn), 2,
  'contact_count counts them');
select pg_temp.expect(
  (select note_count::int from public.v_vendors where id = :barn), 2,
  'note_count counts them');

-- A vendor with nothing attached reports zeroes, never nulls: a null here
-- renders as an empty cell where a figure should be.
select pg_temp.expect(
  (select committed::int from public.v_vendors where id = :bloom), 0,
  'a vendor with no budget line reports zero rather than null');
select pg_temp.expect(
  (select budget_line_count::int from public.v_vendors where id = :bloom), 0,
  'and no lines');
rollback;

-- ---------------------------------------------------------------------------
-- 5. next_payment_due ignores payments already made
-- ---------------------------------------------------------------------------
begin;
select pg_temp.link_a_line();
-- The fixture already carries one PAID payment dated in the past. Adding an
-- unpaid one in the future is what proves next_payment_due skips the paid one
-- rather than simply returning the earliest row.
insert into public.payments (wedding_id, budget_item_id, amount, due_date)
select :w1, bi.id, 150000, current_date + 30
from public.budget_items bi where bi.vendor_id = :barn limit 1;

select pg_temp.expect_true(
  (select next_payment_due = current_date + 30 from public.v_vendors where id = :barn),
  'next_payment_due skips the one already paid');
rollback;

-- ---------------------------------------------------------------------------
-- 6. A rename reaches the budget and the digest with no sync step
-- ---------------------------------------------------------------------------
-- v_budget_items prefers the vendor's LIVE name, which is the whole reason
-- the free-text column can stay without going stale.
begin;
select pg_temp.link_a_line();
update public.vendors set name = 'The Barn, renamed' where id = :barn;

select pg_temp.expect_true(
  (select bool_and(bi.vendor_name = 'The Barn, renamed')
     from public.v_budget_items bi where bi.vendor_id = :barn),
  'the budget line reports the vendor''s new name with no write to budget_items');

select pg_temp.expect_true(
  (select count(*) = 0 from public.budget_items bi
    where bi.vendor_id = :barn and bi.vendor_name = 'The Barn, renamed'),
  'and the stored snapshot is deliberately NOT updated — it is the after-delete fallback');
rollback;

-- A line with no vendor still returns its own typed text — the case that has
-- to keep working, because most lines will never have a vendor record.
begin;
insert into public.budget_categories (id, wedding_id, name, sort_order)
values ('bc999999-0000-4000-8000-000000000001', :w1, 'Bits (fixture)', 910);
insert into public.budget_items
  (id, wedding_id, category_id, label, vendor_name, quantity_basis, contracted, gst_treatment)
values ('b1999999-0000-4000-8000-000000000001', :w1, 'bc999999-0000-4000-8000-000000000001',
        'Cake stand hire', 'The village hall cupboard', 'flat', 15000, 'inclusive');

select pg_temp.expect_true(
  (select bi.vendor_name = 'The village hall cupboard'
     from public.v_budget_items bi
    where bi.id = 'b1999999-0000-4000-8000-000000000001'),
  'an unlinked line still shows exactly what was typed on it');

select pg_temp.expect_true(
  (select bi.vendor_id is null
     from public.v_budget_items bi
    where bi.id = 'b1999999-0000-4000-8000-000000000001'),
  'and carries no vendor id');
rollback;

-- ---------------------------------------------------------------------------
-- 7. Tenancy: the composite FK, and RLS from another wedding's account
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_fail(
  'insert into public.vendor_contacts (wedding_id, vendor_id, name)
   values (''22222222-2222-4222-8222-222222222222'',
           ''e0000000-0000-4000-8000-000000000001'', ''Smuggled'')',
  'a contact in wedding 2 cannot attach to a vendor in wedding 1, service role included');

select pg_temp.expect_fail(
  'insert into public.vendor_notes (wedding_id, vendor_id, body)
   values (''22222222-2222-4222-8222-222222222222'',
           ''e0000000-0000-4000-8000-000000000001'', ''Smuggled'')',
  'nor can a note');
rollback;

begin;
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect((select count(*)::int from public.vendors where wedding_id = :w1), 0,
  'the other wedding''s collaborator sees none of these vendors');
select pg_temp.expect((select count(*)::int from public.vendor_contacts), 0,
  'nor any contact');
select pg_temp.expect((select count(*)::int from public.vendor_notes), 0,
  'nor a single note');
select pg_temp.expect((select count(*)::int from public.vendor_categories where wedding_id = :w1), 0,
  'nor wedding 1''s categories');
select pg_temp.expect((select count(*)::int from public.v_vendors where wedding_id = :w1), 0,
  'and the view is scoped too, not just the tables');

-- They do see their own, which is what proves the policy is scoping rather
-- than just denying everything.
select pg_temp.expect((select count(*)::int from public.vendors where wedding_id = :w2), 1,
  'they still see their own vendor');
rollback;

-- ---------------------------------------------------------------------------
-- 8. gut_score is bounded, and the run sheet link nulls safely
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_fail(
  'insert into public.vendors (wedding_id, name, gut_score)
   values (''11111111-1111-4111-8111-111111111111'', ''Too good'', 6)',
  'a gut score above 5 is refused');

select pg_temp.expect_fail(
  'insert into public.vendors (wedding_id, name) values
   (''11111111-1111-4111-8111-111111111111'', '''')',
  'a vendor with no name is refused');
rollback;

begin;
insert into public.run_sheet_items (wedding_id, event_id, title, vendor_id, track, duration_minutes)
values (:w1, 'e1111111-1111-4111-8111-111111111111', 'Flowers arrive', :bloom, 'vendors', 30);

delete from public.vendors where id = :bloom;

select pg_temp.expect(
  (select count(*)::int from public.run_sheet_items where title = 'Flowers arrive'),
  1,
  'deleting a vendor keeps the run sheet item');
select pg_temp.expect_true(
  (select vendor_id is null from public.run_sheet_items where title = 'Flowers arrive'),
  'with its vendor link nulled rather than the row cascading away');
rollback;
