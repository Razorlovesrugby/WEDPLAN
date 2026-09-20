-- ===========================================================================
-- 0020: Budget — an overall budget, percentage allocations, and
--       allocation-derived estimates
-- ===========================================================================
-- See docs/specs/19-budget-allocation-percentages.md, all six open questions
-- answered 2026-09-20 (section 12).
--
-- Spec 6 built the budget bottom-up: type what a thing costs, totals add
-- themselves up. This adds the top-down direction -- one overall budget, a
-- percentage per category, a percentage per line of its own category's
-- target -- and joins the two: a line with an allocation but no typed
-- estimate uses its allocation AS its estimate, computed on read.
--
-- Nothing here writes into estimated/quoted/contracted. That is the whole
-- design (spec section 2, section 4): the allocation is a fallback resolved
-- in the view, never a default stored on save, so changing the overall
-- budget moves every derived estimate at once and clearing a typed estimate
-- falls straight back to the allocation with nothing stale left behind.
--
-- Append-only, per docs/HANDOFF.md section 8. Three columns, no new tables,
-- so the RLS `tenant_tables` array is untouched -- all three sit on tables
-- that are already tenant-scoped and already policed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- The first money column on `weddings`. Minor units (cents), NZD, like every
-- other money column since 0019. Null means "no overall budget set", which
-- is how every existing row starts and is a first-class state: without it
-- every derived figure below is null and every line behaves exactly as it
-- does today.
alter table public.weddings
  add column total_budget integer check (total_budget is null or total_budget >= 0);

-- Percent of weddings.total_budget. numeric rather than integer because
-- "12.5%" is a thing a planner will type; numeric rather than float for the
-- same no-float-rounding reason every money column is an integer.
alter table public.budget_categories
  add column allocation_pct numeric(5, 2)
    check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 100));

-- Percent of THIS ITEM'S CATEGORY's target amount, not of the overall
-- budget. 80% of Drinks, not 80% of the wedding.
alter table public.budget_items
  add column allocation_pct numeric(5, 2)
    check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 100));

-- ---------------------------------------------------------------------------
-- Views: drop in dependency order, recreate.
-- ---------------------------------------------------------------------------
-- Appending columns would technically survive CREATE OR REPLACE VIEW, but
-- v_budget_summary's new columns are not all at the end and Postgres refuses
-- to reorder a view's output columns -- the same wall 0019 and 0017 hit.
-- Drop-and-recreate is the pattern this repo already has working twice.
drop view if exists public.v_budget_summary;
drop view if exists public.v_budget_items;

-- ---------------------------------------------------------------------------
-- v_budget_items -- 0019's view plus four allocation columns, and one change
-- to `computed_current`: the flat basis's fallback ladder ends at
-- `effective_estimated` rather than `estimated`, so a line with an
-- allocation and no typed estimate shows its planned number instead of zero.
-- Every other basis is untouched: a per_adult line is still unit_price x
-- live count, and an allocation on it is a comparison target only.
-- ---------------------------------------------------------------------------
create view public.v_budget_items
with (security_invoker = true) as
select
  bi.id,
  bi.wedding_id,
  bi.category_id,
  bi.event_id,
  bi.label,
  bi.vendor_name,
  bi.quantity_basis,
  bi.unit_price,
  bi.estimated,
  bi.quoted,
  bi.contracted,
  bi.gst_treatment,
  bi.contracted_task_created,
  bi.notes,
  bi.created_at,
  bi.updated_at,
  bi.quantity,
  bi.allocation_pct,
  alloc.allocated_amount,
  eff.effective_estimated,
  case
    when bi.estimated is not null then 'entered'
    when alloc.allocated_amount is not null then 'allocation'
    else 'none'
  end as estimate_source,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint as computed_current,
  coalesce(pay.paid, 0) as paid,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint - coalesce(pay.paid, 0) as outstanding
from public.budget_items bi
-- This line's target: a share of its category's target, which is itself a
-- share of the overall budget. Null unless all three inputs exist. Rounded
-- at both steps, in minor units, so it is always a whole number of cents --
-- which is also why a category's line allocations can land a cent or two
-- off the category's own target.
left join lateral (
  select round(round(w.total_budget * bc.allocation_pct / 100.0) * bi.allocation_pct / 100.0)::bigint
           as allocated_amount
  from public.weddings w
  join public.budget_categories bc
    on bc.id = bi.category_id and bc.wedding_id = bi.wedding_id
  where w.id = bi.wedding_id
    and w.total_budget is not null
    and bc.allocation_pct is not null
    and bi.allocation_pct is not null
) alloc on true
-- An overall budget is a number out of a bank account, so it is a
-- GST-inclusive figure (spec section 12, decision 4). A GST-exclusive line
-- grosses up by 15% below, so its derived estimate divides by 1.15 first --
-- otherwise the line would sit 15% over its own allocation by construction.
-- Integer minor units can't always round-trip that exactly; the result lands
-- on the allocation to within a cent.
left join lateral (
  select coalesce(
    bi.estimated,
    case
      when bi.gst_treatment = 'exclusive' then round(alloc.allocated_amount / 1.15)::bigint
      else alloc.allocated_amount
    end
  ) as effective_estimated
) eff on true
left join lateral (
  select sum(
    ceil(
      cc.servings_per_guest_per_hour * cc.duration_hours *
      public.budget_head_count(bi.wedding_id, bi.event_id,
        case cc.guest_basis when 'per_adult' then 'adult' else 'seat' end) *
      (1 + cc.wastage_buffer_pct)
    ) * cc.price_per_serving
  ) as total
  from public.consumption_components cc
  where cc.budget_item_id = bi.id
) comp on true
left join lateral (
  select (case
    when bi.quantity_basis = 'consumption' then coalesce(comp.total, 0)
    when bi.quantity_basis = 'flat' then coalesce(bi.contracted, bi.quoted, eff.effective_estimated, 0)
    when bi.quantity_basis = 'manual' then coalesce(bi.quantity, 1) * coalesce(bi.unit_price, 0)
    else round(coalesce(bi.unit_price, 0) * public.budget_head_count(bi.wedding_id, bi.event_id,
      case bi.quantity_basis
        when 'per_adult' then 'adult'
        when 'per_child' then 'child'
        else 'seat'
      end))
  end)::bigint as amount
) cur on true
left join lateral (
  select sum(p.amount) filter (where p.paid_at is not null) as paid
  from public.payments p
  where p.budget_item_id = bi.id
) pay on true;

revoke all on public.v_budget_items from anon;
grant select on public.v_budget_items to authenticated;

-- ---------------------------------------------------------------------------
-- v_budget_category_totals -- the rollup the whole feature exists for: what
-- this category was meant to cost, what it currently costs, and the gap,
-- expressed both ways (spec section 12, decision 2).
--
--   variance_pct        -- over/under this category's OWN allocation
--   share_of_budget_pct -- what it is ACTUALLY taking of the whole budget,
--                          against the allocation_pct it was meant to take
--
-- `allocation_only_count` is what stops a forecast being mistaken for a firm
-- number: how many of these lines are still showing their allocation
-- because nobody has typed an estimate yet (decision 1).
-- ---------------------------------------------------------------------------
create view public.v_budget_category_totals
with (security_invoker = true) as
with per_category as (
  select
    bc.wedding_id,
    bc.id as category_id,
    bc.name,
    bc.sort_order,
    bc.allocation_pct,
    w.total_budget,
    case
      when w.total_budget is not null and bc.allocation_pct is not null
        then round(w.total_budget * bc.allocation_pct / 100.0)::bigint
    end as allocated_amount,
    coalesce(sum(vbi.effective_estimated), 0)::bigint as total_estimated,
    coalesce(sum(vbi.computed_current), 0)::bigint as total_current,
    coalesce(sum(vbi.paid), 0)::bigint as total_paid,
    coalesce(sum(vbi.outstanding), 0)::bigint as total_outstanding,
    count(vbi.id)::bigint as item_count,
    count(*) filter (where vbi.estimate_source = 'allocation')::bigint as allocation_only_count
  from public.budget_categories bc
  join public.weddings w on w.id = bc.wedding_id
  left join public.v_budget_items vbi
    on vbi.category_id = bc.id and vbi.wedding_id = bc.wedding_id
  group by bc.wedding_id, bc.id, bc.name, bc.sort_order, bc.allocation_pct, w.total_budget
)
select
  wedding_id,
  category_id,
  name,
  sort_order,
  allocation_pct,
  allocated_amount,
  total_estimated,
  total_current,
  total_paid,
  total_outstanding,
  total_current - allocated_amount as variance_amount,
  case
    when allocated_amount is not null and allocated_amount > 0
      then round((total_current - allocated_amount) * 100.0 / allocated_amount, 2)
  end as variance_pct,
  case
    when total_budget is not null and total_budget > 0
      then round(total_current * 100.0 / total_budget, 2)
  end as share_of_budget_pct,
  item_count,
  allocation_only_count
from per_category;

revoke all on public.v_budget_category_totals from anon;
grant select on public.v_budget_category_totals to authenticated;

-- ---------------------------------------------------------------------------
-- v_budget_summary -- 0019's view plus the wedding-level allocation figures.
-- Every existing column keeps its name and meaning, so no current caller
-- changes.
--
-- unallocated_amount is computed from the category target AMOUNTS, not from
-- their percentages, so per-category rounding remainders land here rather
-- than silently disappearing.
-- ---------------------------------------------------------------------------
create view public.v_budget_summary
with (security_invoker = true) as
select
  w.id as wedding_id,
  coalesce(sum(vbi.estimated), 0)::bigint as total_estimated,
  coalesce(sum(vbi.quoted), 0)::bigint as total_quoted,
  coalesce(sum(vbi.contracted), 0)::bigint as total_contracted,
  coalesce(sum(vbi.paid), 0)::bigint as total_paid,
  coalesce(sum(vbi.outstanding), 0)::bigint as total_outstanding,
  w.total_budget,
  cat.total_allocated_pct,
  cat.total_allocated_amount,
  case
    when w.total_budget is not null
      then w.total_budget - coalesce(cat.total_allocated_amount, 0)
  end as unallocated_amount,
  coalesce(sum(vbi.computed_current), 0)::bigint as total_current,
  case
    when w.total_budget is not null
      then coalesce(sum(vbi.computed_current), 0)::bigint - w.total_budget
  end as budget_variance,
  case
    when public.budget_head_count(w.id, null, 'adult') > 0
      then round(
        coalesce(sum(vbi.computed_current)
          filter (where vbi.quantity_basis not in ('flat', 'manual')), 0)
        / public.budget_head_count(w.id, null, 'adult'), 2)
    else null
  end as per_head_adult,
  case
    when public.budget_head_count(w.id, null, 'seat') > 0
      then round(
        coalesce(sum(vbi.computed_current)
          filter (where vbi.quantity_basis not in ('flat', 'manual')), 0)
        / public.budget_head_count(w.id, null, 'seat'), 2)
    else null
  end as per_head_seat
from public.weddings w
left join public.v_budget_items vbi on vbi.wedding_id = w.id
left join lateral (
  select
    sum(bc.allocation_pct) as total_allocated_pct,
    sum(round(w.total_budget * bc.allocation_pct / 100.0))::bigint as total_allocated_amount
  from public.budget_categories bc
  where bc.wedding_id = w.id
) cat on true
group by w.id, w.total_budget, cat.total_allocated_pct, cat.total_allocated_amount;

revoke all on public.v_budget_summary from anon;
grant select on public.v_budget_summary to authenticated;
