-- ===========================================================================
-- 0004: Checklists
-- ===========================================================================
-- First slice of the session-7 rebase (docs/specs/01-checklists.md). Ships
-- alone, on purpose: no dependency on the task timeline, vendors or budget.
--
-- `checklist_templates` is global reference data: no wedding_id, readable by
-- every authenticated collaborator, writable by nobody through the API
-- (service role only, at seed time). Instantiating a template COPIES rows
-- into the tenant tables below. Never reference the template row directly:
-- templates get corrected later, and a user's ticked-off list must not move
-- underneath them.
--
-- `0001`-`0003` are applied to the live project and frozen. This file only
-- adds; it never touches an earlier one.
-- ===========================================================================

create type checklist_kind as enum ('decor', 'stationery', 'registry', 'generic');

-- ---------------------------------------------------------------------------
-- checklist_templates  (global, no wedding_id)
-- ---------------------------------------------------------------------------
create table public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  title       text not null,
  kind        checklist_kind not null default 'generic',
  sort_order  integer not null default 0,
  -- sections + items, shaped like supabase/templates/checklists.json
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  check (key <> ''),
  check (title <> ''),
  check (jsonb_typeof(payload) = 'object')
);

-- ---------------------------------------------------------------------------
-- checklists
-- ---------------------------------------------------------------------------
create table public.checklists (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  template_key text,    -- checklist_templates.key this was instantiated from, if any
  title        text not null,
  kind         checklist_kind not null default 'generic',
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
create index checklists_wedding_idx
  on public.checklists (wedding_id, sort_order) where archived_at is null;
create trigger checklists_touch before update on public.checklists
  for each row execute function public.touch_updated_at();

create table public.checklist_sections (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  checklist_id  uuid not null,
  title         text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (checklist_id, wedding_id)
    references public.checklists (id, wedding_id) on delete cascade,
  check (title <> '')
);
create index checklist_sections_checklist_idx
  on public.checklist_sections (checklist_id, sort_order);

-- No task_id here. The task timeline (0005) adds it with an ALTER once
-- `tasks` exists — checklists must not depend on a migration that hasn't
-- shipped yet.
create table public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  checklist_id  uuid not null,
  section_id    uuid,
  title         text not null,
  notes         text,
  qty           integer check (qty is null or qty > 0),
  url           text,
  -- done_at, not a `done boolean` -- "when did we tick this" answers a
  -- question a boolean can't, for one extra column. Same pattern as
  -- invitations.sent_at / rsvps.responded_at in 0001.
  done_at       timestamptz,
  done_by       uuid references auth.users (id) on delete set null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (checklist_id, wedding_id)
    references public.checklists (id, wedding_id) on delete cascade,
  foreign key (section_id, wedding_id)
    references public.checklist_sections (id, wedding_id) on delete set null (section_id),
  check (title <> '')
);
create index checklist_items_checklist_idx
  on public.checklist_items (checklist_id, sort_order);
create index checklist_items_section_idx
  on public.checklist_items (section_id, sort_order) where section_id is not null;
create trigger checklist_items_touch before update on public.checklist_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Readable by any signed-in collaborator, writable by nobody through the
-- API. "Readable by all, writable by nobody" is deliberate -- the same shape
-- as rsvp_token_attempts being service-role-only, but for the opposite
-- reason (this data is safe to read, not sensitive to expose).
alter table public.checklist_templates enable row level security;
alter table public.checklist_templates force row level security;
create policy checklist_templates_select on public.checklist_templates
  for select to authenticated using (true);
revoke all on public.checklist_templates from anon;
revoke insert, update, delete on public.checklist_templates from authenticated;

-- Tenant tables: same uniform loop as 0002. Adding a table to this array is
-- the whole cost of securing it.
do $$
declare
  t text;
  tenant_tables constant text[] := array[
    'checklists',
    'checklist_sections',
    'checklist_items'
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
