-- 0050_day_links.sql  (spec 54)
--
-- A private, phone-first link per run sheet assignee who has no login of their
-- own (vendor, guest or person), the state each assignee keeps for their part
-- of a task, and one append-only activity row per tap for spec 55's master.
--
-- Built in this migration: links, devices, activity, per-assignee state and
-- "Got it", task content (instructions, address, critical, steps, bring
-- list), day contacts, "Good to know", phone and email on people.
-- Not here yet (later parts of spec 54): reference photos and helper photos,
-- groups, leads and open tasks, announcements, push subscriptions, cues,
-- modules' columns.
--
-- Not edited: 0043, 0044, 0048.

-- ---------------------------------------------------------------------------
-- 1. people: a phone and an email (spec 54 §10.7)
-- ---------------------------------------------------------------------------
alter table public.people
  add column phone text check (phone is null or char_length(phone) <= 40),
  add column email text check (email is null or char_length(email) <= 200);

-- ---------------------------------------------------------------------------
-- 2. Day links
-- ---------------------------------------------------------------------------
create table public.day_links (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.weddings (id) on delete cascade,
  vendor_id       uuid,
  guest_id        uuid,
  person_id       uuid,
  -- "Sione (usher)": what audit rows and the master call the link.
  label           text not null check (char_length(btrim(label)) between 1 and 120),
  token_hash      text not null unique,
  token_encrypted text not null,
  modules         text[] not null default '{}',
  module_config   jsonb not null default '{}'::jsonb,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  -- "I'm here" (spec 54 §6.12): a tap, never a location.
  arrived_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (vendor_id, wedding_id) references public.vendors (id, wedding_id) on delete cascade,
  foreign key (guest_id, wedding_id)  references public.guests (id, wedding_id)  on delete cascade,
  foreign key (person_id, wedding_id) references public.people (id, wedding_id)  on delete cascade,
  check (num_nonnulls(vendor_id, guest_id, person_id) = 1),
  check (array_to_string(modules, ',') ~ '^([a-z_]{1,40}(,[a-z_]{1,40})*)?$')
);
-- One live link per assignee: making a new one revokes the old.
create unique index day_links_vendor_live_uq on public.day_links (vendor_id) where vendor_id is not null and revoked_at is null;
create unique index day_links_guest_live_uq  on public.day_links (guest_id)  where guest_id  is not null and revoked_at is null;
create unique index day_links_person_live_uq on public.day_links (person_id) where person_id is not null and revoked_at is null;
create index day_links_wedding_idx on public.day_links (wedding_id);
create trigger day_links_touch before update on public.day_links
  for each row execute function public.touch_updated_at();

create table public.day_link_devices (
  link_id         uuid not null references public.day_links (id) on delete cascade,
  wedding_id      uuid not null references public.weddings (id) on delete cascade,
  device_id       text not null check (device_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  first_opened_at timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  primary key (link_id, device_id)
);

-- ---------------------------------------------------------------------------
-- 3. Activity: one append-only row per tap
-- ---------------------------------------------------------------------------
create table public.day_activity (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  link_id      uuid references public.day_links (id) on delete set null,
  vendor_id    uuid,
  guest_id     uuid,
  person_id    uuid,
  item_id      uuid references public.run_sheet_items (id) on delete set null,
  kind         text not null check (kind ~ '^[a-z_]{1,40}$'),
  payload      jsonb not null default '{}'::jsonb,
  tapped_at    timestamptz not null default now(),
  received_at  timestamptz not null default now(),
  -- The master's reply to a `help` row.
  answered_at  timestamptz,
  answered_by  uuid,
  answer       text check (answer is null or char_length(answer) <= 500),
  foreign key (vendor_id, wedding_id) references public.vendors (id, wedding_id) on delete cascade,
  foreign key (guest_id, wedding_id)  references public.guests (id, wedding_id)  on delete cascade,
  foreign key (person_id, wedding_id) references public.people (id, wedding_id)  on delete cascade
);
create index day_activity_wedding_idx on public.day_activity (wedding_id, received_at desc);
create index day_activity_link_idx on public.day_activity (link_id, received_at desc);

-- Append-only except for the three answer columns.
create or replace function public.day_activity_append_only()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.wedding_id, new.link_id, new.vendor_id, new.guest_id, new.person_id,
      new.item_id, new.kind, new.payload, new.tapped_at, new.received_at)
     is distinct from
     (old.id, old.wedding_id, old.link_id, old.vendor_id, old.guest_id, old.person_id,
      old.item_id, old.kind, old.payload, old.tapped_at, old.received_at) then
    raise exception 'day_activity is append-only (only the answer columns may change)';
  end if;
  return new;
end;
$$;
create trigger day_activity_append_only before update on public.day_activity
  for each row execute function public.day_activity_append_only();

-- ---------------------------------------------------------------------------
-- 4. Each assignee's part of a task
-- ---------------------------------------------------------------------------
alter table public.run_sheet_item_assignees
  add column state            text not null default 'todo'
    check (state in ('todo', 'started', 'done', 'handed_back')),
  add column state_at         timestamptz,
  add column started_at       timestamptz,
  add column done_at          timestamptz,
  add column late_minutes     integer check (late_minutes is null or late_minutes between 1 and 600),
  add column handed_back_reason text check (handed_back_reason is null or char_length(handed_back_reason) <= 300),
  -- When the person last opened this task, for the "Changed" badge.
  add column seen_at          timestamptz,
  -- "Got it" (spec 54 §6.11); cleared when the task's time, place or
  -- instructions change.
  add column confirmed_at     timestamptz;

-- ---------------------------------------------------------------------------
-- 5. What a task holds for helpers (spec 54 §10.1)
-- ---------------------------------------------------------------------------
create table public.day_contacts (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 80),
  phone       text not null check (char_length(btrim(phone)) between 3 and 40),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, wedding_id)
);
create index day_contacts_wedding_idx on public.day_contacts (wedding_id, sort_order);

alter table public.run_sheet_items
  add column instructions text check (instructions is null or char_length(instructions) <= 2000),
  add column address      text check (address is null or char_length(address) <= 300),
  add column critical     boolean not null default false,
  add column contact_id   uuid,
  add foreign key (contact_id, wedding_id) references public.day_contacts (id, wedding_id) on delete set null (contact_id);

create table public.run_sheet_item_steps (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  item_id     uuid not null references public.run_sheet_items (id) on delete cascade,
  kind        text not null check (kind in ('step', 'bring')),
  text        text not null check (char_length(btrim(text)) between 1 and 200),
  sort_order  integer not null default 0,
  unique (id, wedding_id)
);
create index run_sheet_item_steps_item_idx on public.run_sheet_item_steps (item_id, kind, sort_order);

create table public.run_sheet_step_ticks (
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  step_id      uuid not null references public.run_sheet_item_steps (id) on delete cascade,
  assignee_id  uuid not null references public.run_sheet_item_assignees (id) on delete cascade,
  ticked_at    timestamptz not null default now(),
  primary key (step_id, assignee_id)
);

-- ---------------------------------------------------------------------------
-- 6. Good to know (spec 54 §6.14, §10.9)
-- ---------------------------------------------------------------------------
create table public.day_info_sections (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  heading     text not null check (char_length(btrim(heading)) between 1 and 80),
  body        text not null default '' check (char_length(body) <= 2000),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index day_info_sections_wedding_idx on public.day_info_sections (wedding_id, sort_order);
create trigger day_info_sections_touch before update on public.day_info_sections
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS, planner access and audit: the same shape on every new table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'day_links', 'day_link_devices', 'day_activity', 'day_contacts',
    'run_sheet_item_steps', 'run_sheet_step_ticks', 'day_info_sections'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_collaborator(wedding_id)) with check (public.is_collaborator(wedding_id))',
      t || '_collaborator', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('insert into public.planner_table_access (table_name, access, note) values (%L, %L, null)', t, 'write');
    execute format('create policy %I on public.%I for select to authenticated using (public.can_plan(wedding_id))', t || '_planner_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_plan(wedding_id))', t || '_planner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id))', t || '_planner_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_plan(wedding_id))', t || '_planner_delete', t);
  end loop;
end;
$$;

-- Audit what the couple configures; day_activity is its own record and the
-- step ticks and devices are noise.
create trigger audit_row after insert or update or delete on public.day_links
  for each row execute function public.audit_row('id', 'token_hash,token_encrypted', 'label');
create trigger audit_row after insert or update or delete on public.day_contacts
  for each row execute function public.audit_row('id', '', 'label');
create trigger audit_row after insert or update or delete on public.run_sheet_item_steps
  for each row execute function public.audit_row('id', '', 'text');
create trigger audit_row after insert or update or delete on public.day_info_sections
  for each row execute function public.audit_row('id', '', 'heading');
