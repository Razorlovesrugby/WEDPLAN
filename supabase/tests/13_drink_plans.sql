-- ===========================================================================
-- Drink plans (docs/planning-spreadsheet-gaps.md §5, migration 0030)
-- ===========================================================================
-- The assertions worth having are the ones where a mistake buys the wrong
-- amount of alcohol, or quietly moves money:
--
--   1. The headcount must be LIVE. The sheet's calculator takes a guessed
--      number; this one reads the guest list, and if that ever stops being
--      true the feature has no reason to exist.
--   2. The share sums must be refused by the database, not checked by eye.
--      A split that adds to 110% produces a confident, wrong shopping list.
--   3. `manual_headcount` must be present when and only when it is used. A
--      number left behind by a previous source is a number that gets believed.
--   4. Deleting a budget line must never delete a plan, and a plan must never
--      be able to reach into the budget. They are linked for navigation only.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set chidi    '''9a000000-0000-4000-8000-000000000001'''

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

-- A plan for the whole wedding, on the sheet's own defaults.
create or replace function pg_temp.a_plan(src text default 'confirmed', manual int default null)
returns uuid language plpgsql as $$
declare id uuid;
begin
  insert into public.drink_plans
    (wedding_id, label, hours, intensity, champagne_toast, headcount_source, manual_headcount)
  values ('11111111-1111-4111-8111-111111111111', 'Reception bar', 5, 1.00, true,
          src::public.drink_headcount_source, manual)
  returning drink_plans.id into id;
  return id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The headcount is read from the guest list, not stored
-- ---------------------------------------------------------------------------
-- The seed carries no RSVPs at all, so budget_guest_population's "assume
-- everyone comes" branch applies and both sources agree at the tier-A adult
-- count of 10 (the same 10 asserted in 03_budget.sql). Children and infants
-- are excluded, which is the right drinking population and not an accident.
-- The insert is taken with \gset first: pg_temp.a_plan() writes a row, and a
-- function with side effects called inside a WHERE predicate is not ordered
-- against the view scan around it.
begin;
select pg_temp.a_plan('confirmed') as plan \gset
select pg_temp.expect(
  (select headcount from public.v_drink_plans where id = :'plan'),
  10, 'a confirmed plan reads the tier-A adult count from the guest list');
rollback;

begin;
select pg_temp.a_plan('invited') as plan \gset
select pg_temp.expect(
  (select headcount from public.v_drink_plans where id = :'plan'),
  10, 'an invited plan reads the same count while nobody has replied');
rollback;

-- ---------------------------------------------------------------------------
-- 2. An RSVP moves the shopping list. This is the whole feature.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.a_plan('confirmed') as confirmed_plan \gset
select pg_temp.a_plan('invited') as invited_plan \gset

-- One "yes" means the wedding now HAS RSVPs, so "assume everyone comes" stops
-- applying and confirmed counts only the guests who actually said yes.
insert into public.rsvps (wedding_id, guest_id, event_id, status, responded_at)
values (:w1, :chidi, :reception, 'yes', now());

select pg_temp.expect(
  (select headcount from public.v_drink_plans where id = :'confirmed_plan'),
  1, 'once one guest has replied, a confirmed plan counts only the yeses');

select pg_temp.expect(
  (select headcount from public.v_drink_plans where id = :'invited_plan'),
  10, 'an invited plan is unmoved by RSVPs — that is what the source means');
rollback;

-- ---------------------------------------------------------------------------
-- 3. A manual plan uses the typed number and nothing else
-- ---------------------------------------------------------------------------
-- For a plan made before the guest list exists. It must NOT drift toward the
-- live count, or "manual" would be a lie.
begin;
select pg_temp.a_plan('manual', 140) as plan \gset
select pg_temp.expect(
  (select headcount from public.v_drink_plans where id = :'plan'),
  140, 'a manual plan reports the typed headcount');
rollback;

-- ---------------------------------------------------------------------------
-- 4. manual_headcount is present when and only when it is used
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_fail(
  'insert into public.drink_plans (wedding_id, label, hours, headcount_source)
   values (''11111111-1111-4111-8111-111111111111'', ''No number'', 5, ''manual'')',
  'a manual plan with no headcount is refused');

select pg_temp.expect_fail(
  'insert into public.drink_plans
     (wedding_id, label, hours, headcount_source, manual_headcount)
   values (''11111111-1111-4111-8111-111111111111'', ''Leftover'', 5, ''confirmed'', 120)',
  'a live plan carrying a stale manual number is refused too');
rollback;

-- ---------------------------------------------------------------------------
-- 5. The share sums are the database's job, not the planner's eye
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_fail(
  'insert into public.drink_plans
     (wedding_id, label, hours, beer_share, wine_share, spirit_share)
   values (''11111111-1111-4111-8111-111111111111'', ''Adds to 110'', 5, 0.35, 0.25, 0.50)',
  'beer + wine + spirits must equal 1');

select pg_temp.expect_fail(
  'insert into public.drink_plans
     (wedding_id, label, hours, red_share, white_share, rose_share)
   values (''11111111-1111-4111-8111-111111111111'', ''Wine adds to 90'', 5, 0.40, 0.40, 0.10)',
  'red + white + rosé must equal 1 as well');

-- numeric is exact decimal, so the sheet's own defaults are accepted rather
-- than failing by a float hair. If this ever breaks, the column type changed.
select pg_temp.a_plan() as plan \gset
select pg_temp.expect_true(
  (select count(*) = 1 from public.drink_plans where id = :'plan'),
  'the sheet''s 25/25/50 and 40/40/20 defaults are accepted exactly');
rollback;

-- ---------------------------------------------------------------------------
-- 6. Hours and intensity are bounded
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect_fail(
  'insert into public.drink_plans (wedding_id, label, hours)
   values (''11111111-1111-4111-8111-111111111111'', ''Endless'', 25)',
  'a bar cannot run more than 24 hours');

select pg_temp.expect_fail(
  'insert into public.drink_plans (wedding_id, label, hours, intensity)
   values (''11111111-1111-4111-8111-111111111111'', ''Impossible'', 5, 0)',
  'intensity has to be greater than zero');
rollback;

-- ---------------------------------------------------------------------------
-- 7. Deleting money never deletes a plan, and a plan never reaches money
-- ---------------------------------------------------------------------------
-- The mirror of 12_vendors.sql §3. The budget owns what a drink costs; the
-- plan owns what to buy. Severing the link must cost neither of them.
begin;
insert into public.budget_categories (id, wedding_id, name, sort_order)
values ('bd000000-0000-4000-8000-000000000001', :w1, 'Drinks (fixture)', 950);

insert into public.budget_items (id, wedding_id, category_id, label, quantity_basis, contracted, gst_treatment)
values ('bd000000-0000-4000-8000-000000000002', :w1,
        'bd000000-0000-4000-8000-000000000001', 'Bar tab', 'flat', 450000, 'inclusive');

insert into public.drink_plans (id, wedding_id, label, hours, budget_item_id, event_id)
values ('bd000000-0000-4000-8000-000000000003', :w1, 'Linked bar', 5,
        'bd000000-0000-4000-8000-000000000002', :reception);

delete from public.budget_items where id = 'bd000000-0000-4000-8000-000000000002';

select pg_temp.expect(
  (select count(*)::int from public.drink_plans where id = 'bd000000-0000-4000-8000-000000000003'),
  1, 'deleting the budget line leaves the drink plan standing');

select pg_temp.expect_true(
  (select budget_item_id is null from public.drink_plans
    where id = 'bd000000-0000-4000-8000-000000000003'),
  'and nulls the link rather than cascading');

-- The same in the other direction: deleting the event keeps the plan too,
-- because a plan outliving its event is a plan, not an orphan.
delete from public.events where id = :reception;
select pg_temp.expect(
  (select count(*)::int from public.drink_plans
    where id = 'bd000000-0000-4000-8000-000000000003' and event_id is null),
  1, 'deleting the event nulls event_id and keeps the plan');
rollback;

-- A plan cannot borrow another wedding's event or budget line, service role
-- included — the composite foreign keys carry wedding_id for this reason.
begin;
select pg_temp.expect_fail(
  'insert into public.drink_plans (wedding_id, label, hours, event_id)
   values (''22222222-2222-4222-8222-222222222222'', ''Smuggled'', 5,
           ''e2222222-2222-4222-8222-222222222222'')',
  'a plan in wedding 2 cannot point at wedding 1''s event');
rollback;

-- ---------------------------------------------------------------------------
-- 8. Tenancy
-- ---------------------------------------------------------------------------
begin;
select pg_temp.a_plan() as mine \gset
select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;

select pg_temp.expect((select count(*)::int from public.drink_plans where wedding_id = :w1), 0,
  'the other wedding''s collaborator sees none of these plans');
select pg_temp.expect((select count(*)::int from public.v_drink_plans where wedding_id = :w1), 0,
  'and the view is scoped too, not just the table');
rollback;
