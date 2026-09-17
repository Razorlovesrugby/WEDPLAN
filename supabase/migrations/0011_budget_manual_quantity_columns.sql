-- ===========================================================================
-- 0011: Budget — manual quantity x unit price (part 2: column + views)
-- ===========================================================================
-- Run this only after `0011_budget_manual_quantity.sql` has committed on its
-- own -- see that file's header for why the enum value had to be split out.
-- Everything below is what the original single-file 0011 contained past the
-- `alter type` line.
-- ===========================================================================

-- Nullable, meaningful only when quantity_basis = 'manual' -- same
-- "meaningful only for its own basis" convention unit_price already
-- follows. "Defaults to 1 when blank" (spec 6.1, section 4, decision 3) is
-- enforced at the action layer, not a database default: a default here
-- would also silently populate every non-manual row, which is inert but
-- pointless.
alter table public.budget_items
  add column quantity numeric(10, 2) check (quantity is null or quantity >= 0);

-- ---------------------------------------------------------------------------
-- v_budget_items -- replaced, not edited in 0010 (views carry no data of
-- their own, so redefining one is additive the same way a new column is).
-- Every existing output column keeps its exact position; `quantity` is
-- appended at the end, per CREATE OR REPLACE VIEW's own append-only rule.
-- ---------------------------------------------------------------------------
create or replace view public.v_budget_items
with (security_invoker = true) as
select
  bi.id,
  bi.wedding_id,
  bi.category_id,
  bi.event_id,
  bi.label,
  bi.vendor_name,
  bi.currency,
  bi.fx_rate,
  bi.quantity_basis,
  bi.unit_price,
  bi.estimated,
  bi.quoted,
  bi.contracted,
  bi.contracted_task_created,
  bi.notes,
  bi.created_at,
  bi.updated_at,
  cur.amount as computed_current,
  cur.amount * coalesce(bi.fx_rate, 1) as computed_current_base,
  coalesce(pay.paid, 0) as paid,
  coalesce(pay.paid_base, 0) as paid_base,
  cur.amount * coalesce(bi.fx_rate, 1) - coalesce(pay.paid_base, 0) as outstanding_base,
  bi.quantity
from public.budget_items bi
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
    when bi.quantity_basis = 'flat' then coalesce(bi.contracted, bi.quoted, bi.estimated, 0)
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
  select
    sum(p.amount) filter (where p.paid_at is not null) as paid,
    sum(p.amount * coalesce(p.fx_rate, 1)) filter (where p.paid_at is not null) as paid_base
  from public.payments p
  where p.budget_item_id = bi.id
) pay on true;

-- ---------------------------------------------------------------------------
-- v_budget_summary -- per-head figures exclude 'manual' (spec 6.1, section
-- 4, decision 4): a "12 centrepieces" line isn't a per-guest cost just
-- because it has a quantity. Only the filter's excluded-basis list changes;
-- every other column is identical to 0010's definition.
-- ---------------------------------------------------------------------------
create or replace view public.v_budget_summary
with (security_invoker = true) as
select
  w.id as wedding_id,
  coalesce(sum(vbi.estimated * coalesce(vbi.fx_rate, 1)), 0)::bigint as total_estimated,
  coalesce(sum(vbi.quoted * coalesce(vbi.fx_rate, 1)), 0)::bigint as total_quoted,
  coalesce(sum(vbi.contracted * coalesce(vbi.fx_rate, 1)), 0)::bigint as total_contracted,
  coalesce(sum(vbi.paid_base), 0)::bigint as total_paid,
  coalesce(sum(vbi.outstanding_base), 0)::bigint as total_outstanding,
  case
    when public.budget_head_count(w.id, null, 'adult') > 0
      then round(
        coalesce(sum(vbi.computed_current_base)
          filter (where vbi.quantity_basis not in ('flat', 'manual')), 0)
        / public.budget_head_count(w.id, null, 'adult'), 2)
    else null
  end as per_head_adult,
  case
    when public.budget_head_count(w.id, null, 'seat') > 0
      then round(
        coalesce(sum(vbi.computed_current_base)
          filter (where vbi.quantity_basis not in ('flat', 'manual')), 0)
        / public.budget_head_count(w.id, null, 'seat'), 2)
    else null
  end as per_head_seat
from public.weddings w
left join public.v_budget_items vbi on vbi.wedding_id = w.id
group by w.id;
