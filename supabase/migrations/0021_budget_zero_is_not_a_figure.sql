-- ===========================================================================
-- 0021: Budget — a zero in estimated/quoted/contracted is not a figure
-- ===========================================================================
-- A bug fix to the fallback ladder spec 6 §3 introduced and spec 19 extended,
-- reported from the running app (docs/specs/19-budget-allocation-percentages.md
-- §14):
--
--   Reception — allocated $4,900, estimated $7,700, quoted $7,700,
--   contracted $0.00, current $0.00, "$4,900.00 under its allocation (100%)"
--
-- The line was $2,800 OVER its allocation. `contracted` held a real 0 (the
-- planner typed one), and `coalesce(contracted, quoted, estimated)` treats 0
-- as a perfectly good number, so the zero masked a live $7,700 quote. Every
-- total downstream inherited it: the category rollup read "$0.00 of
-- $7,000.00 · $7,000.00 under (100%)", and the wedding total was short by
-- the same amount.
--
-- The rest of the app already treats 0 as unset — the item editor renders a
-- stored 0 as an empty field, and saving that empty field writes null — so
-- the ladder was the one place disagreeing with everything around it. Each
-- rung is now skipped when it is null OR zero.
--
-- `nullif(x, 0)` is the whole change. Column names, types and order are
-- untouched, so this is a CREATE OR REPLACE rather than the drop-and-recreate
-- 0019/0020 needed: v_budget_category_totals and v_budget_summary both select
-- from this view and pick the corrected figures up without being rebuilt.
--
-- Nothing is written to the tables. A row that already holds a 0 keeps it and
-- simply behaves as unset; new writes normalise 0 to null in
-- src/server/actions/budget.ts, so the state stops being reachable.
-- ===========================================================================

create or replace view public.v_budget_items
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
    -- A zero estimate is not an entered estimate, so the line falls through
    -- to its allocation exactly as an empty one does.
    when nullif(bi.estimated, 0) is not null then 'entered'
    when alloc.allocated_amount is not null then 'allocation'
    else 'none'
  end as estimate_source,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint as computed_current,
  coalesce(pay.paid, 0) as paid,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint - coalesce(pay.paid, 0) as outstanding
from public.budget_items bi
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
left join lateral (
  select coalesce(
    nullif(bi.estimated, 0),
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
    -- "The best number we currently have" means the best REAL number: a 0
    -- left in contracted can no longer mask the quote beneath it.
    when bi.quantity_basis = 'flat'
      then coalesce(nullif(bi.contracted, 0), nullif(bi.quoted, 0), eff.effective_estimated, 0)
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
