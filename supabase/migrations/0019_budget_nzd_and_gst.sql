-- ===========================================================================
-- 0019: Budget — NZD only (removing multi-currency/FX), and a GST toggle
-- ===========================================================================
-- See docs/specs/18-budget-gst.md, decided directly by the planner: every
-- wedding is NZD only, so the entire FX mechanism from spec 6 (section 3/5)
-- -- per-row `currency`, snapshotted `fx_rate`, the `fx_rates` cache table,
-- `getFxRate`'s live lookup against api.frankfurter.app -- is removed rather
-- than kept unused. In its place, a plain per-line GST toggle: `inclusive`
-- (today's number, unchanged) or `exclusive`, which adds a hardcoded 15% to
-- everything that sums the line.
--
-- `0010_budget.sql` / `0011_budget_manual_quantity_columns.sql` are this
-- session's own prior migrations and have never been applied to a live
-- project (docs/HANDOFF.md) -- so this drops columns/tables outright rather
-- than carrying a deprecation path; there is no real data to lose.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Drop the FX mechanism entirely.
-- ---------------------------------------------------------------------------
-- v_budget_summary depends on v_budget_items; both are replaced below, but
-- the column removals on the underlying tables have to happen first, and
-- CREATE OR REPLACE VIEW can't rename/drop an output column (Postgres:
-- "cannot change name of view column") -- same issue 0017 hit for
-- v_budget_item_tasks -- so both views are dropped and recreated fresh.
drop view if exists public.v_budget_summary;
drop view if exists public.v_budget_items;

drop table if exists public.fx_rates;

alter table public.budget_items
  drop column currency,
  drop column fx_rate;

alter table public.payments
  drop column currency,
  drop column fx_rate;

alter table public.weddings
  drop column base_currency;

-- ---------------------------------------------------------------------------
-- GST: a plain tick-box per line, hardcoded 15% when exclusive.
-- ---------------------------------------------------------------------------
create type public.budget_gst_treatment as enum ('inclusive', 'exclusive');

alter table public.budget_items
  add column gst_treatment public.budget_gst_treatment not null default 'inclusive';

-- ---------------------------------------------------------------------------
-- v_budget_items -- same shape as 0011's version, minus currency/fx_rate,
-- minus the "_base" suffix (there is only one currency now, so
-- computed_current/paid/outstanding ARE the base figures), plus the GST
-- uplift applied once, after the basis math and before nothing else --
-- there is no FX conversion left to order it against.
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
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint as computed_current,
  coalesce(pay.paid, 0) as paid,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint - coalesce(pay.paid, 0) as outstanding
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
  select sum(p.amount) filter (where p.paid_at is not null) as paid
  from public.payments p
  where p.budget_item_id = bi.id
) pay on true;

revoke all on public.v_budget_items from anon;
grant select on public.v_budget_items to authenticated;

-- ---------------------------------------------------------------------------
-- v_budget_summary -- same column names as before (no caller needs to
-- change), just no more fx multiplication -- every amount already is in
-- NZD, and the GST uplift already happened inside v_budget_items.
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
group by w.id;

revoke all on public.v_budget_summary from anon;
grant select on public.v_budget_summary to authenticated;
