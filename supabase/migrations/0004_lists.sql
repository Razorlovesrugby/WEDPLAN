-- ===========================================================================
-- 0004: Lists, with an auto-synced timeline
-- ===========================================================================
-- One primitive, not two. An earlier version of this migration split
-- "checklists" and "tasks" into separate tables joined by a manual
-- checklist_items.task_id link -- exactly the friction the planner asked
-- this feature not to have. Apple Reminders' model instead: any number of
-- freeform lists, any item in any list can carry a due date, and "the
-- timeline" is not a table anyone writes to -- it is every dated item
-- across every list, laid out chronologically. Add a date to anything,
-- anywhere, and it is on the timeline. Remove the date, it isn't. No sync
-- step, because there is nothing to keep in sync.
--
-- `list_templates` is global reference data: no wedding_id, readable by
-- every authenticated collaborator, writable by nobody through the API.
-- Instantiating a template COPIES its rows into `lists` / `list_sections` /
-- `list_items`. Never reference the template row directly -- templates get
-- corrected later, and a user's ticked-off list must not move underneath
-- them. This is also how the 175-item date-generated timeline seed works:
-- it is a list template like any other, whose items happen to carry
-- `offset_days` so generation can compute a real due_date from
-- `weddings.wedding_date`. There is no separate "task template" concept.
--
-- `0001`-`0003` are applied to the live project and frozen. This file only
-- adds; it never touches an earlier one.
-- ===========================================================================

create type list_kind as enum ('checklist', 'timeline', 'generic');

-- ---------------------------------------------------------------------------
-- list_templates  (global, no wedding_id)
-- ---------------------------------------------------------------------------
create table public.list_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  title       text not null,
  kind        list_kind not null default 'generic',
  sort_order  integer not null default 0,
  -- sections + items, shaped like supabase/templates/*.json. Items that
  -- carry an "offset_days" key are generated with a computed due_date;
  -- items that don't are plain checklist items. Same schema, same table,
  -- same screen -- the only difference is whether a date was set.
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  check (key <> ''),
  check (title <> ''),
  check (jsonb_typeof(payload) = 'object')
);

-- ---------------------------------------------------------------------------
-- lists
-- ---------------------------------------------------------------------------
create table public.lists (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  template_key text,    -- list_templates.key this was instantiated from, if any
  title        text not null,
  kind         list_kind not null default 'generic',
  color        text,
  icon         text,
  event_id     uuid,
  sort_order   integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete set null (event_id),
  check (title <> '')
);
create index lists_wedding_idx
  on public.lists (wedding_id, sort_order) where archived_at is null;
create trigger lists_touch before update on public.lists
  for each row execute function public.touch_updated_at();

create table public.list_sections (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  list_id     uuid not null,
  title       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (list_id, wedding_id)
    references public.lists (id, wedding_id) on delete cascade,
  check (title <> '')
);
create index list_sections_list_idx on public.list_sections (list_id, sort_order);

-- ---------------------------------------------------------------------------
-- list_items -- the one item type for both a decor checklist and a
-- generated timeline task. due_date is nullable and that nullability is the
-- whole feature: set it, the item is on the timeline; clear it, it isn't.
-- ---------------------------------------------------------------------------
create table public.list_items (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  list_id       uuid not null,
  section_id    uuid,
  title         text not null,
  notes         text,
  qty           integer check (qty is null or qty > 0),
  url           text,
  due_date      date,
  -- done_at, not a `done boolean` -- "when did we tick this" answers a
  -- question a boolean can't, for one extra column. Same pattern as
  -- invitations.sent_at / rsvps.responded_at in 0001.
  done_at       timestamptz,
  done_by       uuid references auth.users (id) on delete set null,
  flagged       boolean not null default false,
  -- 0 = none, ascending. Small integer rather than an enum so a future
  -- screen can sort by it directly without a case expression.
  priority      smallint not null default 0,
  snoozed_until date,
  sort_order    integer not null default 0,
  -- Set only for items materialised from a template (see list_templates
  -- above). Generation is idempotent, keyed on (wedding_id, template_key):
  -- re-running the same template for the same wedding updates the existing
  -- row's due_date rather than creating a duplicate. offset_days is copied
  -- from the template payload at generation time so a later wedding-date
  -- change can recompute due_date without re-reading the template.
  template_key  text,
  offset_days   integer,
  generated_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, template_key),
  foreign key (list_id, wedding_id)
    references public.lists (id, wedding_id) on delete cascade,
  foreign key (section_id, wedding_id)
    references public.list_sections (id, wedding_id) on delete set null (section_id),
  check (title <> ''),
  check (offset_days is null or offset_days <= 0)
);
create index list_items_list_idx on public.list_items (list_id, sort_order);
create index list_items_section_idx
  on public.list_items (section_id, sort_order) where section_id is not null;
-- The timeline query: every undone item with a due date, across every list,
-- for one wedding. This is the index that view leans on.
create index list_items_wedding_due_idx
  on public.list_items (wedding_id, due_date) where due_date is not null;
create index list_items_flagged_idx
  on public.list_items (wedding_id) where flagged and done_at is null;
create trigger list_items_touch before update on public.list_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- v_timeline_items -- the auto-sync. Not a table, so there is nothing to
-- keep in sync: any list_items row with a due_date is automatically here.
-- security_invoker = true so RLS on list_items still applies to whoever
-- queries the view (see 0003's v_households for the same pattern).
-- ---------------------------------------------------------------------------
create or replace view public.v_timeline_items
with (security_invoker = true) as
select
  li.id,
  li.wedding_id,
  li.list_id,
  l.title as list_title,
  l.color as list_color,
  l.kind as list_kind,
  l.event_id,
  li.section_id,
  li.title,
  li.notes,
  li.due_date,
  li.done_at,
  li.flagged,
  li.priority,
  li.snoozed_until,
  li.created_at,
  li.updated_at
from public.list_items li
join public.lists l on l.id = li.list_id and l.wedding_id = li.wedding_id
where li.due_date is not null
  and l.archived_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Templates: readable by any signed-in collaborator, writable by nobody
-- through the API. "Readable by all, writable by nobody" is deliberate --
-- the same shape as rsvp_token_attempts being service-role-only, but for
-- the opposite reason (this data is safe to read, not sensitive to expose).
alter table public.list_templates enable row level security;
alter table public.list_templates force row level security;
create policy list_templates_select on public.list_templates
  for select to authenticated using (true);
revoke all on public.list_templates from anon;
revoke insert, update, delete on public.list_templates from authenticated;

-- Tenant tables: same uniform loop as 0002. Adding a table to this array is
-- the whole cost of securing it.
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'lists',
    'list_sections',
    'list_items'
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
