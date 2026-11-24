-- 0051_day_links_rest.sql  (spec 54, the rest of §11)
--
-- 0050 landed the foundation. This adds what the remaining parts of spec 54
-- need: reference photos and helper photos, groups, leads and open tasks,
-- announcements, push subscriptions and the reminder log, cues, modules'
-- columns, and the per-wedding switch for the day-before email.
--
-- Not edited: 0050.
-- Note: specs 52, 53 and 55 planned migrations 0051+ on the assumption 0050 held
-- all of spec 54; their numbers move up by one.

-- ---------------------------------------------------------------------------
-- 1. Wedding switch: the day-before email (§6.15), on by default
-- ---------------------------------------------------------------------------
alter table public.weddings
  add column day_before_email boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Task columns: photo on done, modules, cues, open tasks
-- ---------------------------------------------------------------------------
alter table public.run_sheet_items
  add column photo_on_done   boolean not null default false,
  add column opens_module    text check (opens_module is null or opens_module ~ '^[a-z_]{1,40}$'),
  add column opens_config    jsonb,
  add column is_cue          boolean not null default false,
  add column cue_called_at   timestamptz,
  add column open_to_group_id uuid,
  add column open_places     integer check (open_places is null or open_places between 1 and 20),
  add check (open_to_group_id is null or open_places is not null);

alter table public.run_sheet_item_assignees
  add column is_lead boolean not null default false;
create unique index run_sheet_item_assignees_lead_uq
  on public.run_sheet_item_assignees (item_id) where is_lead;

-- ---------------------------------------------------------------------------
-- 3. Groups of helpers (§10.2)
-- ---------------------------------------------------------------------------
create table public.helper_groups (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, wedding_id)
);
create unique index helper_groups_name_uq on public.helper_groups (wedding_id, lower(btrim(name)));

create table public.helper_group_members (
  id                    uuid primary key default gen_random_uuid(),
  wedding_id            uuid not null references public.weddings (id) on delete cascade,
  group_id              uuid not null,
  collaborator_user_id  uuid,
  guest_id              uuid,
  vendor_id             uuid,
  person_id             uuid,
  foreign key (group_id, wedding_id) references public.helper_groups (id, wedding_id) on delete cascade,
  foreign key (wedding_id, collaborator_user_id) references public.collaborators (wedding_id, user_id) on delete cascade,
  foreign key (guest_id, wedding_id)  references public.guests (id, wedding_id)  on delete cascade,
  foreign key (vendor_id, wedding_id) references public.vendors (id, wedding_id) on delete cascade,
  foreign key (person_id, wedding_id) references public.people (id, wedding_id)  on delete cascade,
  check (num_nonnulls(collaborator_user_id, guest_id, vendor_id, person_id) = 1)
);
create unique index helper_group_members_guest_uq  on public.helper_group_members (group_id, guest_id)  where guest_id is not null;
create unique index helper_group_members_vendor_uq on public.helper_group_members (group_id, vendor_id) where vendor_id is not null;
create unique index helper_group_members_person_uq on public.helper_group_members (group_id, person_id) where person_id is not null;
create unique index helper_group_members_collab_uq on public.helper_group_members (group_id, collaborator_user_id) where collaborator_user_id is not null;

alter table public.run_sheet_items
  add foreign key (open_to_group_id, wedding_id) references public.helper_groups (id, wedding_id) on delete set null (open_to_group_id);

-- ---------------------------------------------------------------------------
-- 4. Photos (§6.10)
-- ---------------------------------------------------------------------------
create table public.run_sheet_item_files (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  item_id     uuid not null references public.run_sheet_items (id) on delete cascade,
  path        text not null check (char_length(path) between 1 and 300),
  mime_type   text not null check (char_length(mime_type) between 3 and 100),
  caption     text check (caption is null or char_length(caption) <= 200),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, wedding_id)
);
create index run_sheet_item_files_item_idx on public.run_sheet_item_files (item_id, sort_order);

alter table public.day_activity
  add column photo_path text check (photo_path is null or char_length(photo_path) <= 300);
-- The append-only guard (0050) must cover the new column.
create or replace function public.day_activity_append_only()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.wedding_id, new.link_id, new.vendor_id, new.guest_id, new.person_id,
      new.item_id, new.kind, new.payload, new.tapped_at, new.received_at, new.photo_path)
     is distinct from
     (old.id, old.wedding_id, old.link_id, old.vendor_id, old.guest_id, old.person_id,
      old.item_id, old.kind, old.payload, old.tapped_at, old.received_at, old.photo_path) then
    raise exception 'day_activity is append-only (only the answer columns may change)';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Announcements (§6.13)
-- ---------------------------------------------------------------------------
create table public.day_announcements (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  audience    text not null check (audience in ('everyone', 'group', 'link')),
  group_id    uuid,
  link_id     uuid references public.day_links (id) on delete cascade,
  text        text not null check (char_length(btrim(text)) between 1 and 500),
  important   boolean not null default false,
  sent_by     uuid,
  sent_at     timestamptz not null default now(),
  foreign key (group_id, wedding_id) references public.helper_groups (id, wedding_id) on delete cascade,
  check ((audience = 'group') = (group_id is not null)),
  check ((audience = 'link') = (link_id is not null))
);
create index day_announcements_wedding_idx on public.day_announcements (wedding_id, sent_at desc);

create table public.day_announcement_reads (
  announcement_id  uuid not null references public.day_announcements (id) on delete cascade,
  link_id          uuid not null references public.day_links (id) on delete cascade,
  wedding_id       uuid not null references public.weddings (id) on delete cascade,
  seen_at          timestamptz not null default now(),
  acknowledged_at  timestamptz,
  primary key (announcement_id, link_id)
);

-- ---------------------------------------------------------------------------
-- 6. Web push and the reminder log (§6.15)
-- ---------------------------------------------------------------------------
create table public.day_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  link_id     uuid not null references public.day_links (id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 1000),
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index day_push_subscriptions_link_idx on public.day_push_subscriptions (link_id);

-- One row per reminder sent, so the every-minute job never sends twice.
create table public.day_reminder_log (
  link_id     uuid not null references public.day_links (id) on delete cascade,
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  dedupe_key  text not null check (char_length(dedupe_key) <= 200),
  kind        text not null check (kind in ('day_before_email', 'push_10_min')),
  sent_at     timestamptz not null default now(),
  primary key (link_id, dedupe_key)
);

-- ---------------------------------------------------------------------------
-- 7. Claiming an open task (§10.2), atomically
-- ---------------------------------------------------------------------------
-- A group member taps "I'll do it". Takes a place if one is left, adds them to
-- the task, and closes the task to claims when the last place goes. Returns
-- 'claimed', 'full', 'not_open', 'not_in_group' or 'already'.
create or replace function public.claim_open_task(
  p_wedding_id uuid, p_item_id uuid,
  p_vendor_id uuid, p_guest_id uuid, p_person_id uuid
) returns text
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_group  uuid;
  v_places integer;
begin
  select open_to_group_id, open_places into v_group, v_places
    from public.run_sheet_items
   where id = p_item_id and wedding_id = p_wedding_id
   for update;
  if v_group is null then
    return 'not_open';
  end if;
  if not exists (
    select 1 from public.helper_group_members m
     where m.group_id = v_group and m.wedding_id = p_wedding_id
       and (m.vendor_id = p_vendor_id or m.guest_id = p_guest_id or m.person_id = p_person_id)
  ) then
    return 'not_in_group';
  end if;
  if exists (
    select 1 from public.run_sheet_item_assignees a
     where a.item_id = p_item_id
       and (a.vendor_id = p_vendor_id or a.guest_id = p_guest_id or a.person_id = p_person_id)
  ) then
    return 'already';
  end if;
  if v_places is null or v_places < 1 then
    return 'full';
  end if;

  insert into public.run_sheet_item_assignees (wedding_id, item_id, vendor_id, guest_id, person_id)
  values (p_wedding_id, p_item_id, p_vendor_id, p_guest_id, p_person_id);

  if v_places = 1 then
    update public.run_sheet_items set open_to_group_id = null, open_places = null where id = p_item_id;
  else
    update public.run_sheet_items set open_places = v_places - 1 where id = p_item_id;
  end if;
  return 'claimed';
end;
$$;
revoke all on function public.claim_open_task(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_open_task(uuid, uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS, planner access and audit, as in 0050
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'helper_groups', 'helper_group_members', 'run_sheet_item_files',
    'day_announcements', 'day_announcement_reads', 'day_push_subscriptions', 'day_reminder_log'
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

create trigger audit_row after insert or update or delete on public.helper_groups
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.run_sheet_item_files
  for each row execute function public.audit_row('id', '', 'caption');
create trigger audit_row after insert or update or delete on public.day_announcements
  for each row execute function public.audit_row('id', '', 'text');
