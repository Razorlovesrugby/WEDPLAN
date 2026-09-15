-- ===========================================================================
-- 0005: Task timeline
-- ===========================================================================
-- Second slice of the session-7 rebase (docs/specs/02-task-timeline.md).
-- Depends on 0004 (checklists) only for the optional checklist_item_id link
-- and the task_id column it adds back onto checklist_items -- the task
-- timeline itself works with checklists absent, event_id null, everything
-- optional except a title and a wedding.
--
-- `task_templates` is global reference data, same shape as
-- checklist_templates in 0004: no wedding_id, readable by every
-- authenticated collaborator, writable by nobody through the API.
-- ===========================================================================

create type task_status as enum ('pending', 'done', 'skipped');

-- ---------------------------------------------------------------------------
-- task_templates  (global, no wedding_id)
-- ---------------------------------------------------------------------------
create table public.task_templates (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  title        text not null,
  -- Negative: days before weddings.wedding_date. Storing an offset rather
  -- than a month bucket makes a date change a single integer add and works
  -- for any engagement length. Seeded range is -391 to -1.
  offset_days  integer not null,
  bucket       text not null,   -- display-only grouping, e.g. "13 months before"
  note         text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check (key <> ''),
  check (title <> ''),
  check (offset_days <= 0)
);
create index task_templates_offset_idx on public.task_templates (offset_days);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  wedding_id         uuid not null references public.weddings (id) on delete cascade,
  title              text not null,
  notes              text,
  due_date           date,
  status             task_status not null default 'pending',
  done_at            timestamptz,
  priority           integer not null default 0,
  event_id           uuid,
  checklist_item_id  uuid,
  -- task_templates.key this was generated from, if any. Generation is keyed
  -- on (wedding_id, template_key): idempotent and non-destructive -- see
  -- src/lib/tasks/generate.ts (not yet written, see docs/specs/02-task-timeline.md).
  template_key       text,
  offset_days        integer,   -- copied from the template at generation time
  generated_at       timestamptz,
  snoozed_until      date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, template_key),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete set null (event_id),
  foreign key (checklist_item_id, wedding_id)
    references public.checklist_items (id, wedding_id) on delete set null (checklist_item_id),
  check (title <> ''),
  check (status <> 'done' or done_at is not null)
);
create index tasks_wedding_due_idx
  on public.tasks (wedding_id, due_date) where status = 'pending';
create index tasks_checklist_item_idx
  on public.tasks (checklist_item_id) where checklist_item_id is not null;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- The other half of the checklist_items <-> tasks pair, added here (not in
-- 0004) because tasks did not exist yet: any checklist item can become a
-- dated, reminder-eligible task ("turn into a task" in the UI).
alter table public.checklist_items
  add column task_id uuid,
  add constraint checklist_items_task_fkey
    foreign key (task_id, wedding_id)
      references public.tasks (id, wedding_id) on delete set null (task_id);
create index checklist_items_task_idx
  on public.checklist_items (task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.task_templates enable row level security;
alter table public.task_templates force row level security;
create policy task_templates_select on public.task_templates
  for select to authenticated using (true);
revoke all on public.task_templates from anon;
revoke insert, update, delete on public.task_templates from authenticated;

alter table public.tasks enable row level security;
alter table public.tasks force row level security;
create policy tasks_collaborator on public.tasks for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.tasks from anon;
