-- ===========================================================================
-- 0010: Budget management
-- ===========================================================================
-- See docs/specs/06-budget-management.md. Categories and line items on the
-- platform spec's four-number model (estimated, quoted, contracted, paid --
-- paid always derived from payments, never typed), a per-unit costing
-- mechanism that scales with the live guest count, a consumption-based
-- calculator for alcohol/catering packages priced by serving, live FX
-- conversion snapshotted per row, and a payment-due sync into the existing
-- reminders digest (v_reminders_due, replacing v_timeline_items as what the
-- digest and dashboard tiles read -- /timeline itself is unaffected). Also
-- ships the manual budget-line <-> task/list linking from spec 6 section 7
-- in the same migration, since both halves of the spec share this file's
-- "0010_budget.sql" name and neither is useful released alone.
--
-- `0001`-`0009` are applied to the live project and frozen (0008/0009 belong
-- to spec 5, decided but not yet built as of this file -- this feature has
-- no dependency on either). This file only adds.
-- ===========================================================================

create type budget_quantity_basis as enum ('flat', 'per_adult', 'per_child', 'per_seat', 'consumption');
create type budget_guest_basis as enum ('per_adult', 'per_seat');

-- ---------------------------------------------------------------------------
-- budget_categories
-- ---------------------------------------------------------------------------
create table public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (name <> '')
);
create index budget_categories_wedding_idx on public.budget_categories (wedding_id, sort_order);
create trigger budget_categories_touch before update on public.budget_categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- budget_items
-- ---------------------------------------------------------------------------
-- Every money column is an integer in minor units (pence/cents), same
-- convention this schema would use for any currency amount -- avoids float
-- rounding on a running total. `paid` is deliberately NOT a column here; see
-- v_budget_items below.
create table public.budget_items (
  id                      uuid primary key default gen_random_uuid(),
  wedding_id              uuid not null references public.weddings (id) on delete cascade,
  category_id             uuid not null,
  event_id                uuid,
  label                   text not null,
  vendor_name             text,
  currency                char(3) not null,
  -- Units of weddings.base_currency per 1 unit of this row's own currency.
  -- Null/1 when currency already matches base_currency. A snapshot taken at
  -- entry/edit time (src/server/queries/fx.ts), not recomputed on read.
  fx_rate                 numeric(18, 8),
  quantity_basis          budget_quantity_basis not null default 'flat',
  -- Minor units. Only meaningful for a per_adult/per_child/per_seat item --
  -- null for flat (the three snapshot columns below are entered directly)
  -- and for consumption (component rows carry their own pricing instead).
  unit_price              integer check (unit_price is null or unit_price >= 0),
  estimated               integer check (estimated is null or estimated >= 0),
  quoted                  integer check (quoted is null or quoted >= 0),
  contracted              integer check (contracted is null or contracted >= 0),
  -- Flips true the moment the planner accepts or dismisses the follow-up
  -- prompt (section 6) -- either answer means "don't ask again for this line".
  contracted_task_created boolean not null default false,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (category_id, wedding_id)
    references public.budget_categories (id, wedding_id) on delete restrict,
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete set null (event_id),
  check (label <> ''),
  check (currency ~ '^[A-Z]{3}$'),
  check (quantity_basis <> 'consumption' or unit_price is null)
);
create index budget_items_wedding_idx on public.budget_items (wedding_id, category_id);
create index budget_items_event_idx on public.budget_items (event_id) where event_id is not null;
create trigger budget_items_touch before update on public.budget_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- consumption_components -- one row per drink/food type within a
-- consumption-mode budget_items row (e.g. "Wine", "Beer", "Soft drinks").
-- ---------------------------------------------------------------------------
create table public.consumption_components (
  id                            uuid primary key default gen_random_uuid(),
  wedding_id                    uuid not null,
  budget_item_id                uuid not null,
  label                         text not null,
  guest_basis                   budget_guest_basis not null,
  servings_per_guest_per_hour   numeric(6, 2) not null check (servings_per_guest_per_hour >= 0),
  duration_hours                numeric(5, 2) not null check (duration_hours >= 0),
  price_per_serving             integer not null check (price_per_serving >= 0),
  wastage_buffer_pct            numeric(4, 3) not null default 0 check (wastage_buffer_pct >= 0),
  sort_order                    integer not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete cascade,
  check (label <> '')
);
create index consumption_components_item_idx
  on public.consumption_components (budget_item_id, sort_order);
create trigger consumption_components_touch before update on public.consumption_components
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- payments -- a schedule per line item. "Paid" is paid_at is not null,
-- matching invitations.sent_at / rsvps.responded_at's existing
-- "timestamp, not boolean" convention.
-- ---------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.weddings (id) on delete cascade,
  budget_item_id  uuid not null,
  due_date        date,
  amount          integer not null check (amount >= 0),
  currency        char(3) not null,
  fx_rate         numeric(18, 8),
  paid_at         timestamptz,
  reference       text,
  paid_by         text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete cascade,
  check (currency ~ '^[A-Z]{3}$')
);
create index payments_item_idx on public.payments (budget_item_id);
create index payments_due_idx
  on public.payments (wedding_id, due_date) where paid_at is null and due_date is not null;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- fx_rates -- global reference data, same shape as list_templates: no
-- wedding_id, shared across every wedding, readable by any authenticated
-- collaborator, written only by the server-role lookup path (getFxRate),
-- never by the tenant policy loop below.
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  base_currency   char(3) not null,
  quote_currency  char(3) not null,
  rate            numeric(18, 8) not null check (rate > 0),
  as_of           date not null,
  fetched_at      timestamptz not null default now(),
  primary key (base_currency, quote_currency, as_of)
);

-- ---------------------------------------------------------------------------
-- Section 7: manual, many-to-many linking to tasks and lists
-- ---------------------------------------------------------------------------
create table public.budget_item_tasks (
  wedding_id      uuid not null,
  budget_item_id  uuid not null,
  list_item_id    uuid not null,
  created_at      timestamptz not null default now(),
  primary key (budget_item_id, list_item_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete cascade,
  foreign key (list_item_id, wedding_id)
    references public.list_items (id, wedding_id) on delete cascade
);
create index budget_item_tasks_item_idx on public.budget_item_tasks (list_item_id);

create table public.budget_item_lists (
  wedding_id      uuid not null,
  budget_item_id  uuid not null,
  list_id         uuid not null,
  created_at      timestamptz not null default now(),
  primary key (budget_item_id, list_id),
  foreign key (budget_item_id, wedding_id)
    references public.budget_items (id, wedding_id) on delete cascade,
  foreign key (list_id, wedding_id)
    references public.lists (id, wedding_id) on delete cascade
);
create index budget_item_lists_list_idx on public.budget_item_lists (list_id);

-- ===========================================================================
-- Guest-count helpers, shared by v_budget_items and v_budget_summary
-- ===========================================================================
-- Which headcount drives a per-head figure (spec 6, section 10, decision 1):
-- RSVP-confirmed once any RSVP exists for the wedding, otherwise invited
-- (top-tier, i.e. v_households.tier = 'A') counts. /guests/rank's own figure
-- always uses invited counts regardless of RSVP data -- that's a separate,
-- simpler call made directly at the query site (src/server/queries/rank.ts
-- equivalent), not through this function.
--
-- Plain SQL functions, not security definer: called from within
-- security_invoker views, so RLS on guests/households/rsvps/invitations
-- still applies to whoever queries the view.
create or replace function public.budget_wedding_has_rsvps(p_wedding_id uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.rsvps where wedding_id = p_wedding_id);
$$;

-- One row per guest in the wedding's top tier (or, when p_event_id is set,
-- whose household's invitation covers that event), with `attending` set per
-- the RSVP-confirmed/invited rule above. p_force_invited bypasses the
-- RSVP-confirmed branch entirely — /guests/rank's own per-seat figure always
-- uses invited counts, never RSVP counts, regardless of what /budget and the
-- dashboard show elsewhere (spec 6, section 10, decision 1).
create or replace function public.budget_guest_population(
  p_wedding_id uuid, p_event_id uuid, p_force_invited boolean default false
)
returns table (guest_id uuid, age_band public.age_band, attending boolean)
language sql
stable
as $$
  select
    g.id,
    g.age_band,
    case
      when p_force_invited then true
      when not public.budget_wedding_has_rsvps(p_wedding_id) then true
      when p_event_id is not null then exists (
        select 1 from public.rsvps rs
        where rs.guest_id = g.id and rs.event_id = p_event_id and rs.status = 'yes'
      )
      else exists (
        select 1 from public.rsvps rs where rs.guest_id = g.id and rs.status = 'yes'
      )
    end as attending
  from public.guests g
  join public.v_households h on h.id = g.household_id and h.wedding_id = g.wedding_id
  where g.wedding_id = p_wedding_id
    and g.deleted_at is null
    and h.tier = 'A'
    and (
      p_event_id is null
      or exists (
        select 1
        from public.invitations i
        join public.invitation_events ie
          on ie.invitation_id = i.id and ie.wedding_id = i.wedding_id
        where i.household_id = h.id
          and i.wedding_id = p_wedding_id
          and i.deleted_at is null
          and ie.event_id = p_event_id
      )
    );
$$;

-- p_basis is 'adult' | 'child' | 'seat' (seat = adult + child, infants never
-- carry a cost basis of their own -- spec 6 section 10, decision 2).
create or replace function public.budget_head_count(
  p_wedding_id uuid, p_event_id uuid, p_basis text, p_force_invited boolean default false
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when p_basis = 'adult' and age_band = 'adult' then 1
      when p_basis = 'child' and age_band = 'child' then 1
      when p_basis = 'seat' and age_band in ('adult', 'child') then 1
      else 0
    end
  ), 0)
  from public.budget_guest_population(p_wedding_id, p_event_id, p_force_invited)
  where attending;
$$;

-- Convenience wrapper over budget_head_count for the client-side live preview
-- (the item editor and consumption component editor compute the same total
-- as the server while the planner is still typing, src/lib/budget.ts) — one
-- RPC call for all three counts rather than three.
create or replace function public.budget_guest_counts(
  p_wedding_id uuid, p_event_id uuid default null, p_force_invited boolean default false
)
returns table (adult numeric, child numeric, seat numeric)
language sql
stable
as $$
  select
    public.budget_head_count(p_wedding_id, p_event_id, 'adult', p_force_invited),
    public.budget_head_count(p_wedding_id, p_event_id, 'child', p_force_invited),
    public.budget_head_count(p_wedding_id, p_event_id, 'seat', p_force_invited);
$$;

revoke execute on function public.budget_guest_counts(uuid, uuid, boolean) from public, anon;
grant execute on function public.budget_guest_counts(uuid, uuid, boolean) to authenticated;

-- ===========================================================================
-- v_budget_items
-- ===========================================================================
-- `computed_current` is "the best number we currently have," in the row's OWN
-- currency, never collapsing estimated/quoted/contracted into one stored
-- figure (platform spec's explicit warning): a per-unit or consumption item
-- ignores those three entirely and recomputes live; a flat item falls back
-- through contracted -> quoted -> estimated. estimated/quoted/contracted stay
-- their own independent snapshots regardless of basis (spec 6, section 3).
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
  cur.amount * coalesce(bi.fx_rate, 1) - coalesce(pay.paid_base, 0) as outstanding_base
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

-- ===========================================================================
-- v_budget_summary -- one row per wedding, all in base_currency
-- ===========================================================================
-- per_head_adult / per_head_seat: sum of computed_current_base across every
-- non-flat line (per-unit and consumption -- section 2's "total of every
-- per-unit and consumption line, divided by headcount"), divided by the
-- wedding's own adult/seat count under the same RSVP-confirmed/invited rule
-- above. Both are exposed since a catering quote is sometimes quoted per
-- adult and sometimes per seat; /guests/rank reads per_head_seat.
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
        coalesce(sum(vbi.computed_current_base) filter (where vbi.quantity_basis <> 'flat'), 0)
        / public.budget_head_count(w.id, null, 'adult'), 2)
    else null
  end as per_head_adult,
  case
    when public.budget_head_count(w.id, null, 'seat') > 0
      then round(
        coalesce(sum(vbi.computed_current_base) filter (where vbi.quantity_basis <> 'flat'), 0)
        / public.budget_head_count(w.id, null, 'seat'), 2)
    else null
  end as per_head_seat
from public.weddings w
left join public.v_budget_items vbi on vbi.wedding_id = w.id
group by w.id;

-- ===========================================================================
-- v_reminders_due -- union of spec 1's v_timeline_items and unpaid payments
-- ===========================================================================
-- Spec 2's digest and dashboard tiles switch from v_timeline_items to this
-- view (source swap only, see src/server/queries/lists.ts). /timeline itself
-- is unaffected -- it stays list-items-only, since a payment isn't a task to
-- check off.
create or replace view public.v_reminders_due
with (security_invoker = true) as
select
  t.id,
  t.wedding_id,
  t.title,
  t.due_date,
  t.list_title,
  t.list_color,
  t.snoozed_until,
  t.status,
  'list_item'::text as source
from public.v_timeline_items t
union all
select
  p.id,
  p.wedding_id,
  coalesce(bi.vendor_name, bi.label) as title,
  p.due_date,
  coalesce(bc.name, 'Budget') as list_title,
  null::text as list_color,
  null::date as snoozed_until,
  'not_started'::list_item_status as status,
  'payment'::text as source
from public.payments p
join public.budget_items bi on bi.id = p.budget_item_id and bi.wedding_id = p.wedding_id
left join public.budget_categories bc on bc.id = bi.category_id and bc.wedding_id = bi.wedding_id
where p.paid_at is null
  and p.due_date is not null;

-- ===========================================================================
-- v_budget_item_tasks -- every list_item linked to a budget line, whether
-- directly or via its list, deduplicated (spec 6, section 7)
-- ===========================================================================
-- A row that is BOTH directly linked and a member of a linked list collapses
-- to one row, direct winning (bool_and is false as soon as any source is
-- direct/false) — the more specific fact, and the only way to keep this
-- view's own promise that a task "counts once whether it's linked directly
-- or via its list".
create or replace view public.v_budget_item_tasks
with (security_invoker = true) as
select
  x.budget_item_id,
  li.id as list_item_id,
  li.list_id,
  l.title as list_title,
  li.title,
  li.notes,
  li.due_date,
  li.status,
  li.done_at,
  bool_and(x.linked_via_list) as linked_via_list
from (
  select budget_item_id, list_item_id, false as linked_via_list
  from public.budget_item_tasks
  union all
  select bil.budget_item_id, li2.id as list_item_id, true as linked_via_list
  from public.budget_item_lists bil
  join public.list_items li2 on li2.list_id = bil.list_id and li2.wedding_id = bil.wedding_id
) x
join public.list_items li on li.id = x.list_item_id
join public.lists l on l.id = li.list_id and l.wedding_id = li.wedding_id
group by x.budget_item_id, li.id, li.list_id, l.title, li.title, li.notes, li.due_date, li.status, li.done_at;

-- ===========================================================================
-- RLS
-- ===========================================================================

-- fx_rates: readable by all, writable by nobody through the API -- same
-- "safe to read, not writable by a tenant" shape as list_templates.
alter table public.fx_rates enable row level security;
alter table public.fx_rates force row level security;
create policy fx_rates_select on public.fx_rates
  for select to authenticated using (true);
revoke all on public.fx_rates from anon;
revoke insert, update, delete on public.fx_rates from authenticated;

do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'budget_categories',
    'budget_items',
    'consumption_components',
    'payments',
    'budget_item_tasks',
    'budget_item_lists'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %1$I on public.%2$I for all to authenticated '
      'using (public.is_collaborator(wedding_id)) '
      'with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

revoke all on public.v_budget_items, public.v_budget_summary, public.v_reminders_due,
  public.v_budget_item_tasks from anon;
grant select on public.v_budget_items, public.v_budget_summary, public.v_reminders_due,
  public.v_budget_item_tasks to authenticated;

revoke execute on function public.budget_wedding_has_rsvps(uuid) from public, anon;
grant execute on function public.budget_wedding_has_rsvps(uuid) to authenticated;
revoke execute on function public.budget_guest_population(uuid, uuid, boolean) from public, anon;
grant execute on function public.budget_guest_population(uuid, uuid, boolean) to authenticated;
revoke execute on function public.budget_head_count(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.budget_head_count(uuid, uuid, text, boolean) to authenticated;
