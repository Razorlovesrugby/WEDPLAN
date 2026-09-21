-- ===========================================================================
-- 0029_vendors.sql — spec 8
--
-- The smallest useful vendor record: who they are, how to reach them, what
-- was said, and which budget lines they are responsible for.
--
-- `budget_items.vendor_name` has been free text since spec 6, with a note
-- calling itself "the natural migration target for a real FK once a vendor
-- CRM ships". This is that target. The text column STAYS — see §4 of the
-- spec, and the three reasons in the comment on `budget_items.vendor_id`.
--
-- THE ENUM IS IN THIS FILE, deliberately. The 55P04 trap `0011` taught this
-- repo is `alter type ... add value` followed by a use of that value in the
-- same transaction. `create type` has no such problem — `0017` creates three
-- enums and uses all three in the same script, and the single-transaction
-- check passes on it. Splitting this one would be cargo-culting 0024.
--
-- Money: nothing here has a money column. Every figure on a vendor page is
-- summed from spec 6's views. A vendor with a price in two places is a vendor
-- with two prices that disagree.
-- ===========================================================================

create type public.vendor_stage as enum (
  'researching',
  'enquiry_sent',
  'quote_received',
  'shortlisted',
  'booked',
  'deposit_paid',
  'complete',
  -- The eighth, beyond the platform spec's seven: the vendor who quoted
  -- double, whose record you keep precisely so you do not email them again
  -- in three weeks having forgotten.
  'declined'
);

-- ---------------------------------------------------------------------------
-- vendor_categories
-- ---------------------------------------------------------------------------
-- A taxonomy of its own rather than a reuse of `budget_categories` (spec 8
-- Answered, question 1). The spec argued the other way — two lists drift —
-- and the planner chose this after that argument was put, for a reason the
-- argument did not have an answer to: a vendor you are still researching has
-- no budget line, and therefore no budget category to be filed under.
--
-- The one concession to the drift: the backfill at the bottom of this file
-- seeds these from each wedding's existing budget category NAMES, so the two
-- lists start aligned. Nothing syncs them afterwards and nothing should — a
-- sync would be the single taxonomy by the back door, with a worse failure
-- mode than honest divergence.
create table public.vendor_categories (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, name),
  check (name <> '')
);
create index vendor_categories_wedding_idx
  on public.vendor_categories (wedding_id, sort_order);
create trigger vendor_categories_touch before update on public.vendor_categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
-- `gut_score` is smallint 1-5, checked. Free text would be unsortable and a
-- numeric invites a 3.7 nobody can justify. `price_band` from the platform
-- spec is deliberately absent (question 6): real numbers live on budget
-- lines, and a ££ band next to "$3,200 contracted" is noise.
--
-- `archived_at` is the soft delete, matching `lists.archived_at`. Archive is
-- the control a planner should reach for; delete is behind a confirm that
-- counts what it is about to destroy.
create table public.vendors (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.weddings (id) on delete cascade,
  name           text not null,
  category_id    uuid,
  stage          public.vendor_stage not null default 'researching',
  website        text,
  email          text,
  phone          text,
  address        text,
  notes          text,
  source         text,
  recommended_by text,
  gut_score      smallint,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (category_id, wedding_id)
    references public.vendor_categories (id, wedding_id) on delete set null (category_id),
  check (name <> ''),
  check (gut_score is null or (gut_score >= 1 and gut_score <= 5))
);
create index vendors_wedding_idx on public.vendors (wedding_id, name)
  where archived_at is null;
create index vendors_category_idx on public.vendors (category_id)
  where category_id is not null;
create trigger vendors_touch before update on public.vendors
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- vendor_contacts
-- ---------------------------------------------------------------------------
-- A table rather than two columns on `vendors`, because the venue you book
-- and the venue coordinator who answers on the day are routinely different
-- people, and the second one is the one you need at 6am.
--
-- At most one primary per vendor, enforced by a PARTIAL UNIQUE INDEX rather
-- than only in the action: `v_vendors` joins on it expecting one row, so two
-- primaries would silently duplicate every vendor on /vendors instead of
-- failing loudly.
create table public.vendor_contacts (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  vendor_id   uuid not null,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (vendor_id, wedding_id)
    references public.vendors (id, wedding_id) on delete cascade,
  check (name <> '')
);
create unique index vendor_contacts_one_primary
  on public.vendor_contacts (vendor_id) where is_primary;
create index vendor_contacts_vendor_idx
  on public.vendor_contacts (vendor_id, sort_order);
create trigger vendor_contacts_touch before update on public.vendor_contacts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- vendor_notes
-- ---------------------------------------------------------------------------
-- The dated log (question 3 — "both": this, plus `vendors.notes` for the
-- one-liner). Plain text, no markdown, no attachments, no mentions.
-- `created_at` is the note's date; a note about last Tuesday says so in its
-- body.
--
-- `author_id` references auth.users and nulls on delete — a collaborator
-- leaving must not take the record of what a florist said with them.
create table public.vendor_notes (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  vendor_id   uuid not null,
  body        text not null,
  pinned      boolean not null default false,
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (vendor_id, wedding_id)
    references public.vendors (id, wedding_id) on delete cascade,
  check (body <> '')
);
create index vendor_notes_vendor_idx
  on public.vendor_notes (vendor_id, pinned desc, created_at desc);
create trigger vendor_notes_touch before update on public.vendor_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- budget_items.vendor_id, and run_sheet_items.vendor_id
-- ---------------------------------------------------------------------------
-- `on delete set null` on both, and it is the whole point: a deleted vendor
-- must NEVER take a budget line — and by extension a payment schedule — with
-- it. Deleting a vendor must never delete money.
alter table public.budget_items add column vendor_id uuid;
alter table public.budget_items add constraint budget_items_vendor_fk
  foreign key (vendor_id, wedding_id)
  references public.vendors (id, wedding_id) on delete set null (vendor_id);
create index budget_items_vendor_idx on public.budget_items (vendor_id)
  where vendor_id is not null;

-- Question 10, answered the other way from the recommendation: `0009`'s own
-- comment anticipated this. `owner` stays as free text beside it, for the
-- "Dad" and "the best man" who are never going to be vendor records.
alter table public.run_sheet_items add column vendor_id uuid;
alter table public.run_sheet_items add constraint run_sheet_items_vendor_fk
  foreign key (vendor_id, wedding_id)
  references public.vendors (id, wedding_id) on delete set null (vendor_id);
create index run_sheet_items_vendor_idx on public.run_sheet_items (vendor_id)
  where vendor_id is not null;

-- ---------------------------------------------------------------------------
-- v_budget_items — the linked vendor's LIVE name
-- ---------------------------------------------------------------------------
-- NOTE ON ORDER: this redefinition comes BEFORE v_vendors, which reads
-- `v_budget_items.vendor_id`. Creating v_vendors first fails with
-- "column bi.vendor_id does not exist" — the view it depends on is still the
-- old one at that point.
-- `vendor_name` keeps its name, type and position (6th), so `create or
-- replace view` is legal and EVERY EXISTING CALLER KEEPS WORKING UNTOUCHED —
-- the budget row, the payment calendar, the links popup and the
-- contracted-follow-up task title all still read `vendor_name` and now get
-- the linked vendor's live name when there is one. A rename on /vendors
-- shows up on /budget with no sync step and no trigger.
--
-- `vendor_id` is APPENDED as the last column, which is the only kind of
-- change `create or replace view` permits.
--
-- Reproduced verbatim from 0021 apart from those two lines. Re-deriving it
-- would risk silently changing the money.
create or replace view public.v_budget_items
with (security_invoker = true) as
select
  bi.id,
  bi.wedding_id,
  bi.category_id,
  bi.event_id,
  bi.label,
  coalesce(ven.name, bi.vendor_name) as vendor_name,
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
    when nullif(bi.estimated, 0) is not null then 'entered'
    when alloc.allocated_amount is not null then 'allocation'
    else 'none'
  end as estimate_source,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint as computed_current,
  coalesce(pay.paid, 0) as paid,
  round(cur.amount * case when bi.gst_treatment = 'exclusive' then 1.15 else 1 end)::bigint - coalesce(pay.paid, 0) as outstanding,
  bi.vendor_id
from public.budget_items bi
left join public.vendors ven
  on ven.id = bi.vendor_id and ven.wedding_id = bi.wedding_id
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

-- ---------------------------------------------------------------------------
-- v_vendors
-- ---------------------------------------------------------------------------
-- What /vendors needs in one row each, so the list is one query rather than
-- N+1. This view does NO money arithmetic of its own beyond sum() — every
-- figure comes from v_budget_items, which is the only thing in this schema
-- allowed to decide what a budget line currently costs.
create view public.v_vendors with (security_invoker = true) as
select
  v.id,
  v.wedding_id,
  v.name,
  v.category_id,
  v.stage,
  v.website,
  v.email,
  v.phone,
  v.address,
  v.notes,
  v.source,
  v.recommended_by,
  v.gut_score,
  v.archived_at,
  v.created_at,
  v.updated_at,
  vc.name as category_name,
  pc.name as primary_contact_name,
  pc.email as primary_contact_email,
  pc.phone as primary_contact_phone,
  coalesce(counts.contact_count, 0)::integer as contact_count,
  coalesce(notes.note_count, 0)::integer as note_count,
  notes.last_note_at,
  coalesce(money.budget_line_count, 0)::integer as budget_line_count,
  coalesce(money.committed, 0)::bigint as committed,
  coalesce(money.paid, 0)::bigint as paid,
  coalesce(money.outstanding, 0)::bigint as outstanding,
  money.next_payment_due,
  coalesce(tasks.open_task_count, 0)::integer as open_task_count
from public.vendors v
left join public.vendor_categories vc
  on vc.id = v.category_id and vc.wedding_id = v.wedding_id
left join public.vendor_contacts pc
  on pc.vendor_id = v.id and pc.wedding_id = v.wedding_id and pc.is_primary
left join lateral (
  select count(*) as contact_count
  from public.vendor_contacts c
  where c.vendor_id = v.id
) counts on true
left join lateral (
  select count(*) as note_count, max(n.created_at) as last_note_at
  from public.vendor_notes n
  where n.vendor_id = v.id
) notes on true
left join lateral (
  select
    count(*) as budget_line_count,
    sum(bi.computed_current) as committed,
    sum(bi.paid) as paid,
    sum(bi.outstanding) as outstanding,
    (select min(p.due_date)
       from public.payments p
       join public.budget_items bi2
         on bi2.id = p.budget_item_id and bi2.wedding_id = p.wedding_id
      where bi2.vendor_id = v.id and p.paid_at is null and p.due_date is not null
    ) as next_payment_due
  from public.v_budget_items bi
  where bi.vendor_id = v.id
) money on true
left join lateral (
  select count(*) as open_task_count
  from public.v_budget_item_tasks t
  join public.budget_items bi3
    on bi3.id = t.budget_item_id and bi3.wedding_id = v.wedding_id
  where bi3.vendor_id = v.id and t.done_at is null
) tasks on true;

comment on view public.v_vendors is
  'One row per vendor for /vendors (spec 8 §3). Money is summed from '
  'v_budget_items and computed nowhere else.';

revoke all on public.v_vendors from anon;
grant select on public.v_vendors to authenticated;

-- ---------------------------------------------------------------------------
-- v_reminders_due — the same rename, in the weekly digest
-- ---------------------------------------------------------------------------
-- Its payment branch titles rows `coalesce(bi.vendor_name, bi.label)` straight
-- off `budget_items`, bypassing v_budget_items entirely — so without this the
-- digest would keep mailing the OLD free-text name after a rename. Column
-- list unchanged.
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
  coalesce(ven.name, bi.vendor_name, bi.label) as title,
  p.due_date,
  coalesce(bc.name, 'Budget') as list_title,
  null::text as list_color,
  null::date as snoozed_until,
  'not_started'::list_item_status as status,
  'payment'::text as source
from public.payments p
join public.budget_items bi on bi.id = p.budget_item_id and bi.wedding_id = p.wedding_id
left join public.vendors ven on ven.id = bi.vendor_id and ven.wedding_id = bi.wedding_id
left join public.budget_categories bc on bc.id = bi.category_id and bc.wedding_id = bi.wedding_id
where p.paid_at is null
  and p.due_date is not null;

-- ---------------------------------------------------------------------------
-- Seed vendor_categories from the budget's own category names
-- ---------------------------------------------------------------------------
-- The one concession to question 1's cost (see this file's header and the
-- spec's "Answered"). The two lists start aligned instead of the vendor one
-- starting empty and being invented separately. They diverge freely from
-- here, which is what was asked for.
insert into public.vendor_categories (wedding_id, name, sort_order)
select bc.wedding_id, bc.name, bc.sort_order
from public.budget_categories bc
on conflict (wedding_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['vendor_categories', 'vendors', 'vendor_contacts', 'vendor_notes'] loop
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
