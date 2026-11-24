-- 0052_shot_list.sql  (spec 52)
--
-- The shot list: sections (optionally tied to a run sheet item), shots, the
-- people in each, and three optional guest fields the photographer sees only
-- through a day link. The Shot list is a module of spec 54's day links.
--
-- (Spec 52 called this 0051; spec 54 took 0050 and 0051, so it is 0052.)

create type public.shot_kind   as enum ('group', 'moment', 'detail', 'portrait');
create type public.shot_status as enum ('todo', 'taken', 'skipped', 'later');

-- ---------------------------------------------------------------------------
-- 1. Guests: faces to know (§4.3). Shown only through day links.
-- ---------------------------------------------------------------------------
alter table public.guests
  add column relationship text check (relationship is null or char_length(relationship) <= 120),
  add column photo_path   text check (photo_path is null or char_length(photo_path) <= 300),
  -- The only guest note a day link ever shows; `notes` stays private.
  add column vendor_note  text check (vendor_note is null or char_length(vendor_note) <= 300);

-- ---------------------------------------------------------------------------
-- 2. Sections and shots
-- ---------------------------------------------------------------------------
create table public.shot_sections (
  id                uuid primary key default gen_random_uuid(),
  wedding_id        uuid not null references public.weddings (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  run_sheet_item_id uuid,
  location          text check (location is null or char_length(location) <= 200),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (run_sheet_item_id) references public.run_sheet_items (id) on delete set null
);
create index shot_sections_wedding_idx on public.shot_sections (wedding_id, sort_order);
create trigger shot_sections_touch before update on public.shot_sections
  for each row execute function public.touch_updated_at();

create table public.shots (
  id                          uuid primary key default gen_random_uuid(),
  wedding_id                  uuid not null references public.weddings (id) on delete cascade,
  section_id                  uuid not null,
  title                       text not null check (char_length(btrim(title)) between 1 and 160),
  kind                        public.shot_kind not null default 'group',
  must_have                   boolean not null default false,
  minutes                     integer not null default 2 check (minutes between 0 and 120),
  note                        text check (note is null or char_length(note) <= 500),
  shooter                     text check (shooter is null or shooter in ('lead', 'second')),
  reference_moodboard_item_id uuid,
  reference_path              text check (reference_path is null or char_length(reference_path) <= 300),
  sort_order                  integer not null default 0,
  status                      public.shot_status not null default 'todo',
  status_at                   timestamptz,
  status_by                   text check (status_by is null or char_length(status_by) <= 120),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (section_id, wedding_id) references public.shot_sections (id, wedding_id) on delete cascade
);
create index shots_section_idx on public.shots (section_id, sort_order);
create trigger shots_touch before update on public.shots
  for each row execute function public.touch_updated_at();

create table public.shot_people (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.weddings (id) on delete cascade,
  shot_id     uuid not null,
  guest_id    uuid,
  person_id   uuid,
  role        text check (role is null or char_length(btrim(role)) between 1 and 80),
  sort_order  integer not null default 0,
  foreign key (shot_id, wedding_id)   references public.shots (id, wedding_id)  on delete cascade,
  foreign key (guest_id, wedding_id)  references public.guests (id, wedding_id) on delete cascade,
  foreign key (person_id, wedding_id) references public.people (id, wedding_id) on delete cascade,
  check (num_nonnulls(guest_id, person_id, role) = 1)
);
create index shot_people_shot_idx on public.shot_people (shot_id, sort_order);
create unique index shot_people_guest_uq  on public.shot_people (shot_id, guest_id)  where guest_id is not null;
create unique index shot_people_person_uq on public.shot_people (shot_id, person_id) where person_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS, planner access, audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['shot_sections', 'shots', 'shot_people'] loop
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

create trigger audit_row after insert or update or delete on public.shot_sections
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.shots
  for each row execute function public.audit_row('id', '', 'title');
create trigger audit_row after insert or update or delete on public.shot_people
  for each row execute function public.audit_row('id', '', 'role');
