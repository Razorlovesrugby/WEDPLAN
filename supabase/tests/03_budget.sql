-- ===========================================================================
-- Budget tests (spec 6)
-- ===========================================================================
-- Two things under test, same split as 01_tenancy.sql / 02_derived.sql:
--   1. Tenancy — the six new tables follow the same RLS + composite-FK shape
--      every other tenant table does.
--   2. Derived values — v_budget_items' computed_current/paid/outstanding
--      (including the spec 18 GST uplift) and v_budget_summary's
--      totals/per-head math, against the wedding 1 seed's known tier-A
--      counts (10 adults, 1 child, 11 seats — see supabase/seed.sql and
--      src/lib/budget.test.ts, which asserts the same numbers against the
--      pure JS mirror of this view's logic).
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
-- GST-exclusive item, two payments. Inserted as service_role so the fixture
-- step itself is never gated on RLS; every assertion below re-reads as an
-- authenticated collaborator.
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue'),
  ('c1000000-0000-4000-8000-000000000002', :w2, 'Other wedding''s category');

insert into public.budget_items
  (id, wedding_id, category_id, label, quantity_basis, unit_price, estimated, quoted, contracted, gst_treatment)
values
  -- flat: falls back through contracted -> quoted -> estimated
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Venue hire', 'flat', null, 500000, 480000, 460000, 'inclusive'),
  -- per_adult: 10 tier-A adults * 6000c
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Adult meal', 'per_adult', 6000, null, null, null, 'inclusive'),
  -- per_child: 1 tier-A child * 3000c
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Child meal', 'per_child', 3000, null, null, null, 'inclusive'),
  -- per_seat: 11 tier-A seats * 500c
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Chair hire', 'per_seat', 500, null, null, null, 'inclusive'),
  -- consumption: components below
  ('b0000000-0000-4000-8000-000000000005', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Bar package', 'consumption', null, null, null, null, 'inclusive'),
  -- GST-exclusive (spec 18): 100000 contracted grosses up to 115000
  ('b0000000-0000-4000-8000-000000000006', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Photographer', 'flat', null, null, null, 100000, 'exclusive');

insert into public.consumption_components
  (wedding_id, budget_item_id, label, guest_basis, servings_per_guest_per_hour, duration_hours, price_per_serving, wastage_buffer_pct)
values
  -- ceil(1.5 * 4 * 10 adults) = 60 servings * 500c
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Wine', 'per_adult', 1.5, 4, 500, 0),
  -- ceil(1 * 4 * 11 seats * 1.1 wastage) = ceil(48.4) = 49 servings * 150c
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Soft drinks', 'per_seat', 1, 4, 150, 0.1);

insert into public.payments (wedding_id, budget_item_id, amount, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, now()),
  (:w1, 'b0000000-0000-4000-8000-000000000006', 50000, now());

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
    insert into public.budget_items (wedding_id, category_id, label, quantity_basis)
    values ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002', 'Cross-tenant', 'flat');
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
  (id, wedding_id, category_id, label, quantity_basis, unit_price, estimated, quoted, contracted, quantity, gst_treatment)
values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Venue hire', 'flat', null, 500000, 480000, 460000, null, 'inclusive'),
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Adult meal', 'per_adult', 6000, null, null, null, null, 'inclusive'),
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Child meal', 'per_child', 3000, null, null, null, null, 'inclusive'),
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Chair hire', 'per_seat', 500, null, null, null, null, 'inclusive'),
  ('b0000000-0000-4000-8000-000000000005', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Bar package', 'consumption', null, null, null, null, null, 'inclusive'),
  -- spec 18: GST-exclusive flat item — 100000 contracted grosses up to 115000.
  ('b0000000-0000-4000-8000-000000000006', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Photographer', 'flat', null, null, null, 100000, null, 'exclusive'),
  -- spec 6.1: manual quantity x unit price, quantity explicit.
  ('b0000000-0000-4000-8000-000000000007', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Centrepieces', 'manual', 2500, null, null, null, 12, 'inclusive'),
  -- spec 6.1: manual with no quantity set — defaults to 1, per decision 3.
  ('b0000000-0000-4000-8000-000000000008', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Signage', 'manual', 1000, null, null, null, null, 'inclusive'),
  -- spec 18: GST-exclusive per_adult item — 6000 * 10 adults = 40000, grosses up to 46000.
  ('b0000000-0000-4000-8000-000000000009', :w1, 'c1000000-0000-4000-8000-000000000001',
   'DJ', 'per_adult', 4000, null, null, null, null, 'exclusive');

insert into public.consumption_components
  (wedding_id, budget_item_id, label, guest_basis, servings_per_guest_per_hour, duration_hours, price_per_serving, wastage_buffer_pct)
values
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Wine', 'per_adult', 1.5, 4, 500, 0),
  (:w1, 'b0000000-0000-4000-8000-000000000005', 'Soft drinks', 'per_seat', 1, 4, 150, 0.1);

insert into public.payments (wedding_id, budget_item_id, amount, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, now()),
  (:w1, 'b0000000-0000-4000-8000-000000000006', 50000, now());

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
select pg_temp.expect(
  (select outstanding from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  260000, 'flat item outstanding is computed_current minus paid');

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

-- spec 18: GST-exclusive flat item — the raw contracted figure stays as typed, but computed_current/outstanding gross up by 15%.
select pg_temp.expect(
  (select contracted from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  100000, 'GST-exclusive item''s stored contracted figure is untouched — only computed_current grosses up');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  115000, 'GST-exclusive item''s computed_current is contracted (100000) * 1.15');
select pg_temp.expect(
  (select outstanding from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  65000, 'GST-exclusive item''s outstanding is 115000 - 50000 paid');

-- Manual (spec 6.1): quantity x unit_price, ignoring the guest count entirely.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000007'),
  30000, 'manual item is quantity (12) * unit_price (2500)');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000008'),
  1000, 'a manual item with no quantity set defaults to 1 (decision 3)');

-- spec 18: GST-exclusive per_adult item — the uplift applies to every basis, not just flat.
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000009'),
  46000, 'GST-exclusive per_adult item is (unit_price 4000 * 10 adults = 40000) * 1.15');

-- v_budget_summary: totals in NZD, per-head figures over every non-flat, non-manual line.
select pg_temp.expect((select total_estimated from public.v_budget_summary where wedding_id = :w1), 500000, 'total_estimated sums the one flat item''s estimated');
select pg_temp.expect((select total_quoted from public.v_budget_summary where wedding_id = :w1), 480000, 'total_quoted sums the one flat item''s quoted');
select pg_temp.expect((select total_contracted from public.v_budget_summary where wedding_id = :w1), 560000, 'total_contracted sums raw contracted figures (460000 + 100000) — never GST-grossed');
select pg_temp.expect((select total_paid from public.v_budget_summary where wedding_id = :w1), 250000, 'total_paid sums paid across both payments (200000 + 50000)');
select pg_temp.expect((select total_outstanding from public.v_budget_summary where wedding_id = :w1), 507850, 'total_outstanding sums outstanding across all nine items');
-- The five per-unit/consumption lines' computed_current: 60000 (adult meal) + 3000 (child meal) + 5500 (chair hire) + 37350 (bar) + 46000 (GST-exclusive DJ) = 151850.
-- Unchanged by the two manual items (30000 + 1000) or the GST-exclusive flat item — all excluded from this sum by decision 4 / the flat exclusion.
select pg_temp.expect_num((select per_head_adult from public.v_budget_summary where wedding_id = :w1), 15185.00, 'per_head_adult excludes flat and manual lines — the five remaining lines'' computed_current (151850) over 10 adults');
select pg_temp.expect_num((select per_head_seat from public.v_budget_summary where wedding_id = :w1), 13804.55, 'per_head_seat is the same total (151850) over 11 seats');
rollback;

-- ---------------------------------------------------------------------------
-- 3. v_reminders_due — an unpaid, dated payment behaves like an overdue task
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.budget_categories (id, wedding_id, name) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue');
insert into public.budget_items (id, wedding_id, category_id, label, vendor_name, quantity_basis, contracted) values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001', 'Venue hire', 'The Old Barn', 'flat', 460000);
-- Unpaid, due — should surface. Unpaid, no due date — should not (nothing to chase yet).
insert into public.payments (wedding_id, budget_item_id, amount, due_date) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 200000, '2020-01-01'),
  (:w1, 'b0000000-0000-4000-8000-000000000001', 100000, null);
-- Paid, due — already settled, should not surface.
insert into public.payments (wedding_id, budget_item_id, amount, due_date, paid_at) values
  (:w1, 'b0000000-0000-4000-8000-000000000001', 50000, '2020-06-01', now());

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
insert into public.budget_items (id, wedding_id, category_id, label, quantity_basis) values
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001', 'Flowers', 'flat');

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
insert into public.budget_items (id, wedding_id, category_id, label, quantity_basis) values
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000002', 'Ceremony decor', 'flat');

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

-- ---------------------------------------------------------------------------
-- 5. Allocations (spec 19) — an overall budget, a percentage per category,
--    a percentage per line, and the derived estimate that falls out of them
-- ---------------------------------------------------------------------------
-- The fixture is the spec's own worked example: a $40,000 budget with Venue
-- allocated 12% ($4,800) and currently totalling $5,100 — 6.25% over its own
-- allocation, taking 12.75% of the budget against the 12% planned.
begin;
set local role service_role;

update public.weddings set total_budget = 4000000 where id = :w1;

insert into public.budget_categories (id, wedding_id, name, allocation_pct) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue',  12),
  ('c1000000-0000-4000-8000-000000000002', :w1, 'Drinks',  8),
  -- No percentage: every derived figure below it must stay null rather than
  -- defaulting to zero.
  ('c1000000-0000-4000-8000-000000000003', :w1, 'Extras', null);

insert into public.budget_items
  (id, wedding_id, category_id, label, quantity_basis, unit_price, estimated, gst_treatment, allocation_pct)
values
  -- Venue: 90% of $4,800 = $4,320, nothing typed — the allocation IS the estimate.
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Venue hire', 'flat', null, null, 'inclusive', 90),
  -- A typed estimate wins over the 5% allocation ($240).
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Ceremony chairs', 'flat', null, 30000, 'inclusive', 5),
  -- GST-exclusive: allocated $480 all-in, so the derived estimate divides by
  -- 1.15 first and computed_current lands back on $480.
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Photographer', 'flat', null, null, 'exclusive', 10),
  -- Drinks: a per_adult line with an allocation — the allocation is a
  -- comparison target only and must NOT feed computed_current.
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000002',
   'Alcohol', 'per_adult', 6000, null, 'inclusive', 80),
  ('b0000000-0000-4000-8000-000000000005', :w1, 'c1000000-0000-4000-8000-000000000002',
   'Glassware hire', 'flat', null, null, 'inclusive', 10),
  -- In the unallocated category: no target, but a typed estimate still works.
  ('b0000000-0000-4000-8000-000000000006', :w1, 'c1000000-0000-4000-8000-000000000003',
   'Fireworks', 'flat', null, 15000, 'inclusive', 50);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

-- v_budget_items: the two-step percentage, and the derived estimate.
select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  432000, 'a line''s allocation is its % of its category''s % of the overall budget (90% of 12% of 4000000)');
select pg_temp.expect(
  (select effective_estimated from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  432000, 'with nothing typed, the allocation IS the effective estimate');
select pg_temp.expect_text(
  (select estimate_source from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  'allocation', 'and estimate_source says so');
select pg_temp.expect(
  (select estimated from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  null, 'nothing was written into the stored estimated column');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  432000, 'a flat line with no real number falls back to its allocation rather than zero');

select pg_temp.expect(
  (select effective_estimated from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  30000, 'a typed estimate wins over the allocation');
select pg_temp.expect_text(
  (select estimate_source from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  'entered', 'and estimate_source says entered');
select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  24000, 'the allocation is still computed alongside it, as the comparison target');

-- spec 19 section 12, decision 4: the overall budget is GST-inclusive, so an
-- exclusive line's derived estimate divides by 1.15 and grosses back up onto
-- its allocation instead of sitting 15% over it.
select pg_temp.expect(
  (select effective_estimated from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  41739, 'a GST-exclusive line''s derived estimate is its allocation (48000) / 1.15');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  48000, 'which grosses back up onto the allocation itself, not 15% above it');

-- The allocation never feeds a basis that recomputes live.
select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000004'),
  256000, 'a per_adult line still gets an allocation (80% of Drinks'' 320000)');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000004'),
  60000, 'but its computed_current is still unit_price * 10 adults — a target, not an input');

-- An unallocated category leaves every derived figure null, not zero.
select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  null, 'a line in a category with no % has no allocation, even with a % of its own');
select pg_temp.expect_text(
  (select estimate_source from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000006'),
  'entered', 'its typed estimate is still its estimate');

-- v_budget_category_totals — the spec's worked example, both readings of
-- "over or under as a %".
select pg_temp.expect(
  (select allocated_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  480000, 'Venue''s target is 12% of the 4000000 budget');
select pg_temp.expect(
  (select total_current from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  510000, 'Venue currently totals 432000 + 30000 + 48000');
select pg_temp.expect(
  (select total_estimated from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  503739, 'total_estimated sums effective_estimated, derived figures included (432000 + 30000 + 41739)');
select pg_temp.expect(
  (select variance_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  30000, 'Venue is 30000 over its allocation');
select pg_temp.expect_num(
  (select variance_pct from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  6.25, 'which is 6.25% over its own allocation');
select pg_temp.expect_num(
  (select share_of_budget_pct from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  12.75, 'and 12.75% of the whole budget, against the 12% planned');
select pg_temp.expect(
  (select allocation_only_count from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  2, 'two of Venue''s three lines are still running on their allocation');
select pg_temp.expect(
  (select item_count from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  3, 'out of three lines in the category');

select pg_temp.expect(
  (select total_current from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000002'),
  92000, 'Drinks totals the live per_adult figure (60000) plus the derived glassware estimate (32000)');
select pg_temp.expect(
  (select variance_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000002'),
  -228000, 'Drinks is well under its 320000 target');

select pg_temp.expect(
  (select allocated_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000003'),
  null, 'an unallocated category has no target');
select pg_temp.expect(
  (select variance_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000003'),
  null, 'and so no variance — null, never zero');
select pg_temp.expect(
  (select total_current from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000003'),
  15000, 'though its lines still total normally');

-- v_budget_summary — the wedding-level figures.
select pg_temp.expect((select total_budget from public.v_budget_summary where wedding_id = :w1), 4000000, 'summary echoes the overall budget');
select pg_temp.expect_num((select total_allocated_pct from public.v_budget_summary where wedding_id = :w1), 20.00, 'the categories have claimed 20% between them');
select pg_temp.expect((select total_allocated_amount from public.v_budget_summary where wedding_id = :w1), 800000, 'which is 800000 of the budget');
select pg_temp.expect((select unallocated_amount from public.v_budget_summary where wedding_id = :w1), 3200000, 'leaving 3200000 unallocated — from the amounts, not the percentages');
select pg_temp.expect((select total_current from public.v_budget_summary where wedding_id = :w1), 617000, 'total_current sums every line''s computed_current (510000 + 92000 + 15000)');
select pg_temp.expect((select budget_variance from public.v_budget_summary where wedding_id = :w1), -3383000, 'the wedding is 3383000 under its overall budget');

-- Removing the overall budget degrades every line to its pre-spec-19
-- behaviour rather than to zeroes.
set local role service_role;
update public.weddings set total_budget = null where id = :w1;
set local role authenticated;

select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  null, 'with no overall budget, a line has no allocation');
select pg_temp.expect_text(
  (select estimate_source from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  'none', 'and no estimate at all');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  0, 'so its computed_current is 0 again — exactly what it was before this feature');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  30000, 'a line with a typed estimate is untouched by any of it');
select pg_temp.expect(
  (select allocated_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  null, 'and the category rollup has no target to compare against');
select pg_temp.expect((select unallocated_amount from public.v_budget_summary where wedding_id = :w1), null, 'nor does the summary');
rollback;

-- ---------------------------------------------------------------------------
-- 6. A zero in estimated/quoted/contracted is not a figure (0021)
-- ---------------------------------------------------------------------------
-- Reported from the running app: a line quoted at $7,700 with a typed 0 in
-- `contracted` reported a current figure of $0 and read as "$4,900 under its
-- allocation (100%)" when it was in fact $2,800 over. The 0 outranked the
-- quote in coalesce(contracted, quoted, estimated).
begin;
set local role service_role;

update public.weddings set total_budget = 5000000 where id = :w1;

insert into public.budget_categories (id, wedding_id, name, allocation_pct) values
  ('c1000000-0000-4000-8000-000000000001', :w1, 'Venue', 14);

insert into public.budget_items
  (id, wedding_id, category_id, label, quantity_basis, estimated, quoted, contracted, allocation_pct)
values
  -- The screenshot's line, exactly: 70% of Venue's 14% of 5000000 = 490000.
  ('b0000000-0000-4000-8000-000000000001', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Reception', 'flat', 770000, 770000, 0, 70),
  -- A zero quote must not mask a real estimate either.
  ('b0000000-0000-4000-8000-000000000002', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Ceremony', 'flat', 300000, 0, null, null),
  -- A zero estimate falls through to the line's allocation, exactly as an
  -- empty one does: 10% of 700000.
  ('b0000000-0000-4000-8000-000000000003', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Signage', 'flat', 0, null, null, 10),
  -- Everything genuinely empty still totals zero, not something invented.
  ('b0000000-0000-4000-8000-000000000004', :w1, 'c1000000-0000-4000-8000-000000000001',
   'Undecided', 'flat', 0, 0, 0, null);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;

select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  770000, 'a zero contracted does not mask the quote beneath it');
select pg_temp.expect(
  (select contracted from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  0, 'the stored 0 is left exactly as it was — this is a read-side fix, not a write');
select pg_temp.expect(
  (select outstanding from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  770000, 'outstanding follows the corrected current figure');
select pg_temp.expect(
  (select allocated_amount from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000001'),
  490000, 'and its allocation is unchanged at 70% of 700000');

select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000002'),
  300000, 'a zero quote does not mask the estimate beneath it');

select pg_temp.expect_text(
  (select estimate_source from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  'allocation', 'a zero estimate is not an entered estimate');
select pg_temp.expect(
  (select effective_estimated from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  70000, 'so the line falls through to its allocation (10% of 700000)');
select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000003'),
  70000, 'and its current figure is that allocation');

select pg_temp.expect(
  (select computed_current from public.v_budget_items where id = 'b0000000-0000-4000-8000-000000000004'),
  0, 'a line where every figure really is empty still totals zero');

-- The category rollup the screenshot showed as "$0.00 of $7,000.00 ·
-- $7,000.00 under (100%)" now reports the line as over its target.
select pg_temp.expect(
  (select total_current from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  1140000, 'the category totals the corrected figures (770000 + 300000 + 70000 + 0)');
select pg_temp.expect(
  (select variance_amount from public.v_budget_category_totals where category_id = 'c1000000-0000-4000-8000-000000000001'),
  440000, 'and is over its 700000 target, not 100% under it');
rollback;
