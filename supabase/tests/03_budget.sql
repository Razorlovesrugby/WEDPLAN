-- ===========================================================================
-- Budget tests (spec 6)
-- ===========================================================================
-- Two things under test, same split as 01_tenancy.sql / 02_derived.sql:
--   1. Tenancy — the six new tables follow the same RLS + composite-FK shape
--      every other tenant table does.
--   2. Derived values — v_budget_items' computed_current/paid/outstanding
--      and v_budget_summary's totals/per-head math, against the wedding 1
--      seed's known tier-A counts (10 adults, 1 child, 11 seats — see
--      supabase/seed.sql and src/lib/budget.test.ts, which asserts the same
--      numbers against the pure JS mirror of this view's logic).
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_num(actual numeric, wanted numeric, label text)
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

-- ---------------------------------------------------------------------------
-- Fixtures: one category, six line items covering every quantity_basis, one
-- non-base-currency item, two payments. Inserted as service_role so the
-- fixture step itself is never gated on RLS; every assertion below re-reads
-- as an authenticated collaborator.
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue'),
  ('c1000000-0000-4000-8000-000000000002', :w2, 'Other wedding''s category');

insert into public.budget_items
  (id, wedding_id, category_id, label, currency, fx_rate, quantity_basis, unit_price, estimated, quoted, contracted)
values
  -- flat: falls back through contracted -> quoted -> estimated
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Venue hire', 'GBP', null, 'flat', null, 500000, 480000, 460000),
  -- per_adult: 10 tier-A adults * 6000p
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Adult meal', 'GBP', null, 'per_adult', 6000, null, null, null),
  -- per_child: 1 tier-A child * 3000p
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Child meal', 'GBP', null, 'per_child', 3000, null, null, null),
  -- per_seat: 11 tier-A seats * 500p
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Chair hire', 'GBP', null, 'per_seat', 500, null, null, null),
  -- consumption: components below
  ('b0000000-0000-4000-8000-000000000005', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Bar package', 'GBP', null, 'consumption', null, null, null, null),
  -- non-base currency: USD at a snapshotted 1.25 rate
  ('b0000000-0000-4000-8000-000000000006', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Photographer', 'USD', 1.25, 'flat', null, null, null, 100000);

insert into public.consumption_components
  (wedding_id, budget_item_id, label, guest_basis, servings_per_guest_per_hour, duration_hours, price_per_serving, wastage_buffer_pct)
values
  -- ceil(1.5 * 4 * 10 adults) = 60 servings * 500p
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Wine', 'per_adult', 1.5, 4, 500, 0),
  -- ceil(1 * 4 * 11 seats * 1.1 wastage) = ceil(48.4) = 49 servings * 150p
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Soft drinks', 'per_seat', 1, 4, 150, 0.1);

insert into public.payments (wedding_id, budget_item_id, amount, currency, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, 'GBP', now());
insert into public.payments (wedding_id, budget_item_id, amount, currency, fx_rate, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000006', 50000, 'USD', 1.25, now());

-- ---------------------------------------------------------------------------
-- 1. Tenancy — alex sees exactly these rows, nothing from wedding 2
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect((select count(*) from public.budget_categories where wedding_id = :w1), 1, 'alex sees 1 budget category');
select pg_temp.expect((select count(*) from public.budget_items where wedding_id = :w1), 6, 'alex sees 6 budget items');
select pg_temp.expect((select count(*) from public.budget_categories where wedding_id = :w2), 0, 'alex sees no categories from wedding 2');
select pg_temp.expect((select count(*) from public.v_budget_items where wedding_id = :w2), 0, 'alex sees no budget items from wedding 2 through the view either');

set local role service_role;
do $$
begin
  begin
    insert into public.budget_items (wedding_id, category_id, label, currency, quantity_basis)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002', 'Cross-tenant', 'GBP', 'flat');
    raise exception 'FAIL — a budget item pointing at another wedding''s category was accepted';
  exception when foreign_key_violation then
    raise notice '  ok  cross-wedding category FK rejected even for service_role';
  end;
end;
$$;

select set_config('request.jwt.claim.sub', :stranger, true);
set local role authenticated;
select pg_temp.expect((select count(*) from public.budget_items), 0, 'stranger sees no budget items at all');

set local role anon;
do $$
begin
  perform count(*) from public.budget_items;
  raise exception 'FAIL — anon could query budget_items';
exception
  when insufficient_privilege then
    raise notice '  ok  anon has no privilege on budget_items';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 2. Derived values — v_budget_items and v_budget_summary
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue');

insert into public.budget_items
  (id, wedding_id, category_id, label, currency, fx_rate, quantity_basis, unit_price, estimated, quoted, contracted, quantity)
values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Venue hire', 'GBP', null, 'flat', null, 500000, 480000, 460000, null),
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Adult meal', 'GBP', null, 'per_adult', 6000, null, null, null, null),
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Child meal', 'GBP', null, 'per_child', 3000, null, null, null, null),
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Chair hire', 'GBP', null, 'per_seat', 500, null, null, null, null),
  ('b0000000-0000-4000-8000-000000000005', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Bar package', 'GBP', null, 'consumption', null, null, null, null, null),
  ('b0000000-0000-4000-8000-000000000006', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Photographer', 'USD', 1.25, 'flat', null, null, null, 100000, null),
  -- spec 6.1: manual quantity x unit price, quantity explicit.
  ('b0000000-0000-4000-8000-000000000007', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Centrepieces', 'GBP', null, 'manual', 2500, null, null, null, 12),
  -- spec 6.1: manual with no quantity set — defaults to 1, per decision 3.
  ('b0000000-0000-4000-8000-000000000008', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Signage', 'GBP', null, 'manual', 1000, null, null, null, null);

insert into public.consumption_components
  (wedding_id, budget_item_id, label, guest_basis, servings_per_guest_per_hour, duration_hours, price_per_serving, wastage_buffer_pct)
values
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Wine', 'per_adult', 1.5, 4, 500, 0),
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Soft drinks', 'per_seat', 1, 4, 150, 0.1);

insert into public.payments (wedding_id, budget_item_id, amount, currency, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, 'GBP', now());
insert into public.payments (wedding_id, budget_item_id, amount, currency, fx_rate, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000006', 50000, 'USD', 1.25, now());

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

-- No RSVPs exist for wedding 1 in the seed, so every count below is
-- "invited" (tier A) rather than RSVP-confirmed — households a1..a6, per
-- src/lib/budget.test.ts's seedCounts comment: 10 adults, 1 child, 11 seats.
select pg_temp.expect(public.budget_head_count(:w1, null, 'adult')::bigint, 10, 'tier-A adult count is 10');
select pg_temp.expect(public.budget_head_count(:w1, null, 'child')::bigint,  1, 'tier-A child count is 1');
select pg_temp.expect(public.budget_head_count(:w1, null, 'seat')::bigint,  11, 'tier-A seat count is 11');

-- Flat: falls back through contracted -> quoted -> estimated, ignoring none of them as "the" number.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  460000, 'flat item''s computed_current is the contracted figure');
select pg_temp.expect(
  (select paid from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  200000, 'flat item paid is the sum of paid_at-not-null payments');
select pg_temp.expect_num(
  (select outstanding_base from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  260000, 'flat item outstanding_base is computed_current_base minus paid_base');

-- Per-unit items scale with the live tier-A count, ignoring estimated/quoted/contracted entirely.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  60000, 'per_adult item is unit_price * 10 adults');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  3000, 'per_child item is unit_price * 1 child');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000004'),
  5500, 'per_seat item is unit_price * 11 seats');

-- Consumption: each component computes and rounds up independently, then sums.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000005'),
  37350, 'consumption item sums its components (60*500 wine + 49*150 soft drinks)');

-- Non-base currency: computed_current stays in the item's own currency; _base applies fx_rate.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  100000, 'USD item''s computed_current is in USD, unconverted');
select pg_temp.expect_num(
  (select computed_current_base from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  125000, 'USD item''s computed_current_base applies the snapshotted 1.25 rate');
select pg_temp.expect_num(
  (select paid_base from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  62500, 'USD item''s paid_base applies the payment''s own snapshotted rate');
select pg_temp.expect_num(
  (select outstanding_base from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  62500, 'USD item''s outstanding_base is 125000 - 62500');

-- Manual (spec 6.1): quantity x unit_price, ignoring the guest count entirely.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000007'),
  30000, 'manual item is quantity (12) * unit_price (2500)');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000008'),
  1000, 'a manual item with no quantity set defaults to 1 (decision 3)');

-- v_budget_summary: totals in base_currency, per-head figures over every non-flat, non-manual line.
select pg_temp.expect((select total_estimated from public.v_budget_summary where wedding_id = :w1), 500000, 'total_estimated sums the one flat item''s estimated');
select pg_temp.expect((select total_quoted from public.v_budget_summary where wedding_id = :w1), 480000, 'total_quoted sums the one flat item''s quoted');
select pg_temp.expect((select total_contracted from public.v_budget_summary where wedding_id = :w1), 585000, 'total_contracted converts the USD item''s contracted figure into base_currency');
select pg_temp.expect((select total_paid from public.v_budget_summary where wedding_id = :w1), 262500, 'total_paid sums paid_base across both payments');
select pg_temp.expect((select total_outstanding from public.v_budget_summary where wedding_id = :w1), 459350, 'total_outstanding sums outstanding_base across all eight items, including both manual ones');
-- The four per-unit/consumption lines' computed_current_base: 60000 (adult meal) + 3000 (child meal) + 5500 (chair hire) + 37350 (bar) = 105850.
-- Unchanged by adding the two manual items above (30000 + 1000) — they are excluded from this sum by decision 4, proven by the total staying put while total_outstanding above moved.
select pg_temp.expect_num((select per_head_adult from public.v_budget_summary where wedding_id = :w1), 10585.00, 'per_head_adult excludes both manual lines — still the four non-flat/non-manual lines'' computed_current_base (105850) over 10 adults');
select pg_temp.expect_num((select per_head_seat from public.v_budget_summary where wedding_id = :w1), 9622.73, 'per_head_seat is the same total (105850) over 11 seats');
rollback;

-- ---------------------------------------------------------------------------
-- 3. v_reminders_due — an unpaid, dated payment behaves like an overdue task
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue');
insert into public.budget_items (id, wedding_id, category_id, label, vendor_name, currency, quantity_basis, contracted) values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001', 'Venue hire', 'The Old Barn', 'GBP', 'flat', 460000);
-- Unpaid, due — should surface. Unpaid, no due date — should not (nothing to chase yet).
insert into public.payments (wedding_id, budget_item_id, amount, currency, due_date) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, 'GBP', '2020-01-01'),
  (:w1, 'b0000000-0000-4000-8000-000000000001', 100000, 'GBP', null);
-- Paid, due — already settled, should not surface.
insert into public.payments (wedding_id, budget_item_id, amount, currency, due_date, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 50000, 'GBP', '2020-06-01', now());

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*) from public.v_reminders_due where wedding_id = :w1 and source = 'payment'),
  1, 'exactly one payment surfaces in v_reminders_due (unpaid + due, not the undated or already-paid ones)');
select pg_temp.expect_text(
  (select due_date::text from public.v_reminders_due where wedding_id = :w1 and source = 'payment'),
  '2020-01-01', 'the surfaced payment is the one due 2020-01-01');
select pg_temp.expect_text(
  (select title from public.v_reminders_due where wedding_id = :w1 and source = 'payment'),
  'The Old Barn', 'the payment''s title falls back to the budget line''s vendor_name');
rollback;

-- ---------------------------------------------------------------------------
-- 4. v_budget_item_tasks — direct links and whole-list links, deduplicated
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Flowers');
insert into public.budget_items (id, wedding_id, category_id, label, currency, quantity_basis) values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001', 'Flowers', 'GBP', 'flat');

-- One item linked directly; a whole list linked separately, whose one item
-- must appear too (marked linked_via_list) without being linked one by one.
insert into public.budget_item_tasks (wedding_id, budget_item_id, list_item_id) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 'b3111111-1111-4111-8111-111111111111');
insert into public.budget_item_lists (wedding_id, budget_item_id, list_id) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 'b1111111-1111-4111-8111-111111111111');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*) from public.v_budget_item_tasks where budget_item_id = 'b0000000-0000-4000-8000-000000000001'),
  2, 'both the directly-linked item and the linked list''s second item show up');
select pg_temp.expect(
  (select count(*) from public.v_budget_item_tasks
    where budget_item_id = 'b0000000-0000-4000-8000-000000000001' and link_source = 'direct'),
  1, 'exactly one row is the direct link');
select pg_temp.expect(
  (select count(*) from public.v_budget_item_tasks
    where budget_item_id = 'b0000000-0000-4000-8000-000000000001'
      and list_item_id = 'b3111111-1111-4111-8111-111111111111'),
  1, 'the directly-linked item is not duplicated even though its list is also linked');
rollback;

-- ---------------------------------------------------------------------------
-- 5. budget_item_sections and link_source priority (spec 16 §3, 0017)
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000002', :w1, 'Decor');
insert into public.budget_items (id, wedding_id, category_id, label, currency, quantity_basis) values
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000002', 'Ceremony decor', 'GBP', 'flat');

-- "Ceremony decor" (b2111111-...) has two items, per supabase/seed.sql:
-- b3111111-...-111111111111 and b3111111-...-222222222222. Linking the
-- section pulls in both, via_section.
insert into public.budget_item_sections (wedding_id, budget_item_id, section_id) values
  (:w1, 'b0000000-0000-4000-8000-000000000002', 'b2111111-1111-4111-8111-111111111111');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect(
  (select count(*) from public.v_budget_item_tasks where budget_item_id = 'b0000000-0000-4000-8000-000000000002'),
  2, 'both items in the linked section show up');
select pg_temp.expect(
  (select count(*) from public.v_budget_item_tasks
    where budget_item_id = 'b0000000-0000-4000-8000-000000000002' and link_source <> 'via_section'),
  0, 'both are sourced via_section, with nothing else linked yet');

-- Now also link one of the section's own items directly — direct should win
-- for that one row (same priority rule 0010 already used for direct vs.
-- via_list, generalised to a third source), the sibling item stays
-- via_section.
set local role service_role;
insert into public.budget_item_tasks (wedding_id, budget_item_id, list_item_id) values
  (:w1, 'b0000000-0000-4000-8000-000000000002', 'b3111111-1111-4111-8111-111111111111');

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect_text(
  (select link_source from public.v_budget_item_tasks
    where budget_item_id = 'b0000000-0000-4000-8000-000000000002'
      and list_item_id = 'b3111111-1111-4111-8111-111111111111'),
  'direct', 'direct wins over via_section for the same item');
select pg_temp.expect_text(
  (select link_source from public.v_budget_item_tasks
    where budget_item_id = 'b0000000-0000-4000-8000-000000000002'
      and list_item_id = 'b3111111-1111-4111-8111-222222222222'),
  'via_section', 'the sibling item, only in the linked section, stays via_section');

select pg_temp.expect(
  (select count(*) from public.budget_item_sections where wedding_id = :w2), 0,
  'alex sees no section links from wedding 2');

-- Composite FK stops what RLS cannot, same shape as 01_tenancy.sql's
-- cross-wedding list_item check: a wedding-2 section for a wedding-1
-- budget item is refused even for service_role.
set local role service_role;
do $$
declare
  wedding2_section_id uuid;
begin
  insert into public.list_sections (wedding_id, list_id, title)
  values ('22222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-0000000000ff', 'Secret section')
  returning id into wedding2_section_id;

  begin
    insert into public.budget_item_sections (wedding_id, budget_item_id, section_id)
    values ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', wedding2_section_id);
    raise exception 'FAIL — section link across weddings was accepted';
  exception
    when foreign_key_violation then
      raise notice '  ok  composite FK refused a cross-wedding section link';
  end;
end;
$$;
rollback;
