-- 0043_people.sql  (spec 39, part B)
--
-- "People": everyone a task can be handed to, whether or not they have a
-- login. The wedding planner is not on WedPlan, so until now they could not be
-- assigned anything — `list_items.assigned_to` points at auth.users.
--
-- `assigned_to` and everything that reads it stay exactly as they are (the two
-- collaborators). A task is assigned to a collaborator OR to a person, never
-- both (a check). `user_id` and `access` are created now, null / 'none', so
-- part C (0044) adds no column: a person with a login and access = 'planner'
-- is the planner login.
--
-- `access` is text with a check, NOT an enum value, so there is no 55P04
-- (a new enum value cannot be used in the transaction that adds it).
--
-- Soft delete only. A removed person's tasks keep their name.
create table public.people (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  user_id     uuid references auth.users (id) on delete set null,
  access      text not null default 'none',
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, user_id),
  check (char_length(btrim(name)) between 1 and 80),
  check (access in ('none', 'planner')),
  -- A planner grant without a login is meaningless.
  check (access = 'none' or user_id is not null)
);
create index people_wedding_idx on public.people (wedding_id, sort_order, created_at);
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

alter table public.people enable row level security;
alter table public.people force row level security;
create policy people_collaborator on public.people
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.people from anon;

-- ---------------------------------------------------------------------------
-- Assignment
-- ---------------------------------------------------------------------------
alter table public.list_items
  add column assigned_person_id uuid;

-- Composite, so a person can only be on a task in their own wedding.
alter table public.list_items
  add constraint list_items_assigned_person_fk
    foreign key (assigned_person_id, wedding_id)
    references public.people (id, wedding_id)
    on delete set null (assigned_person_id);

alter table public.list_items
  add constraint list_items_one_assignee
    check (assigned_to is null or assigned_person_id is null);

create index list_items_person_idx
  on public.list_items (wedding_id, assigned_person_id)
  where assigned_person_id is not null;

-- ---------------------------------------------------------------------------
-- Audit (18_audit_log.sql fails if a table is neither audited nor excepted)
-- ---------------------------------------------------------------------------
create trigger audit_row after insert or update or delete on public.people
  for each row execute function public.audit_row('id', '', 'name');
