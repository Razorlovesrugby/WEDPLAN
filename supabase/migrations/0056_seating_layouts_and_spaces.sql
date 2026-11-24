-- 0056_seating_layouts_and_spaces.sql  (spec 57 §15)
--
-- An event's seating becomes: layouts (one live, any number of drafts) made of
-- spaces (rooms), with tables, fixtures and seats belonging to a space and a
-- layout. Additive only, and the app behaves exactly as before:
--
--   * every event that has seating data gets one live layout "Main" and one
--     space, and its tables, fixtures and seats are pointed at them;
--   * BEFORE INSERT triggers fill the new columns, so the existing actions
--     (which know only event_id) keep working untouched;
--   * seating_plans keeps the room columns and stays authoritative for them;
--     a trigger copies them to the event's first space until a later
--     migration moves that authority;
--   * seat_assignments keeps its (guest_id, event_id) key. One seat per guest
--     per LAYOUT is added beside it and replaces it in the migration that lets
--     drafts exist.
--
-- Not edited: 0036, 0053.

-- ---------------------------------------------------------------------------
-- 1. Layouts and spaces
-- ---------------------------------------------------------------------------
create table public.seating_layouts (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  event_id    uuid not null,
  name        text not null check (name <> '' and length(name) <= 60),
  is_live     boolean not null default false,
  -- Part D. A collaborator's user id, as seating_snapshots.created_by is.
  locked_at   timestamptz,
  locked_by   uuid,
  -- Drafts only; the live layout can't be deleted.
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  unique (id, event_id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  check ((locked_at is null) = (locked_by is null)),
  check (not (is_live and deleted_at is not null))
);
-- Exactly one live layout per event.
create unique index seating_layouts_live_uq
  on public.seating_layouts (event_id) where is_live and deleted_at is null;
create index seating_layouts_event_idx on public.seating_layouts (wedding_id, event_id);
create trigger seating_layouts_touch before update on public.seating_layouts
  for each row execute function public.touch_updated_at();

create table public.seating_spaces (
  id                 uuid primary key default gen_random_uuid(),
  wedding_id         uuid not null,
  layout_id          uuid not null,
  name               text not null check (name <> '' and length(name) <= 60),
  sort_order         integer not null default 0,
  room_width_cm      integer not null default 2000 check (room_width_cm between 300 and 20000),
  room_depth_cm      integer not null default 1500 check (room_depth_cm between 300 and 20000),
  background_path    text,
  background_w_px    integer check (background_w_px > 0),
  background_h_px    integer check (background_h_px > 0),
  calibrated         boolean not null default false,
  background_opacity smallint not null default 45 check (background_opacity between 10 and 100),
  -- Walls, arcs, openings, markers, areas, labels, kept dimensions, in room
  -- centimetres. The shape is checked by src/lib/seating/drawing.ts before
  -- every write; the database bounds the type and the size.
  drawing            jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(drawing) = 'object' and pg_column_size(drawing) <= 262144),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, wedding_id),
  unique (id, layout_id, wedding_id),
  foreign key (layout_id, wedding_id)
    references public.seating_layouts (id, wedding_id) on delete cascade,
  check ((background_path is null) = (background_w_px is null)
     and (background_path is null) = (background_h_px is null))
);
create index seating_spaces_layout_idx on public.seating_spaces (wedding_id, layout_id, sort_order);
create trigger seating_spaces_touch before update on public.seating_spaces
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The live layout of an event, made on demand
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: it inserts under the caller's RLS, as the action that
-- caused it would have. Concurrent callers settle on one row through the
-- partial unique index.
create or replace function public.seating_live_layout(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_wedding uuid;
  v_name text;
begin
  select l.id into v_id from public.seating_layouts l
   where l.event_id = p_event_id and l.is_live and l.deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  select e.wedding_id, e.name into v_wedding, v_name from public.events e where e.id = p_event_id;
  if v_wedding is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  insert into public.seating_layouts (wedding_id, event_id, name, is_live)
  values (v_wedding, p_event_id, 'Main', true)
  on conflict (event_id) where is_live and deleted_at is null do nothing
  returning id into v_id;

  if v_id is null then
    select l.id into v_id from public.seating_layouts l
     where l.event_id = p_event_id and l.is_live and l.deleted_at is null;
    return v_id;
  end if;

  insert into public.seating_spaces (wedding_id, layout_id, name, room_width_cm, room_depth_cm,
                                     background_path, background_w_px, background_h_px, calibrated)
  select v_wedding, v_id, left(coalesce(nullif(v_name, ''), 'Room'), 60),
         coalesce(p.room_width_cm, 2000), coalesce(p.room_depth_cm, 1500),
         p.background_path, p.background_w_px, p.background_h_px, coalesce(p.calibrated, false)
    from (select 1) one
    left join public.seating_plans p on p.event_id = p_event_id;
  return v_id;
end;
$$;
revoke all on function public.seating_live_layout(uuid) from public, anon;
grant execute on function public.seating_live_layout(uuid) to authenticated;

-- A layout's first space: where a table or fixture goes when nothing says which.
create or replace function public.seating_first_space(p_layout_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id from public.seating_spaces s
   where s.layout_id = p_layout_id
   order by s.sort_order, s.created_at, s.id
   limit 1;
$$;
revoke all on function public.seating_first_space(uuid) from public, anon;
grant execute on function public.seating_first_space(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Point the existing rows at them
-- ---------------------------------------------------------------------------
alter table public.seating_tables   add column layout_id uuid, add column space_id uuid;
alter table public.seating_fixtures add column layout_id uuid, add column space_id uuid;
alter table public.seat_assignments add column layout_id uuid;

-- One live layout and one space per event that has any seating data. Created
-- by hand here (not through seating_live_layout) because a migration has no
-- caller whose RLS would apply, and it must see every wedding.
insert into public.seating_layouts (wedding_id, event_id, name, is_live)
select distinct x.wedding_id, x.event_id, 'Main', true
  from (
    select wedding_id, event_id from public.seating_plans
    union select wedding_id, event_id from public.seating_tables
    union select wedding_id, event_id from public.seating_fixtures
    union select wedding_id, event_id from public.seat_assignments
  ) x;

insert into public.seating_spaces (wedding_id, layout_id, name, room_width_cm, room_depth_cm,
                                   background_path, background_w_px, background_h_px, calibrated)
select l.wedding_id, l.id, left(coalesce(nullif(e.name, ''), 'Room'), 60),
       coalesce(p.room_width_cm, 2000), coalesce(p.room_depth_cm, 1500),
       p.background_path, p.background_w_px, p.background_h_px, coalesce(p.calibrated, false)
  from public.seating_layouts l
  join public.events e on e.id = l.event_id
  left join public.seating_plans p on p.event_id = l.event_id;

-- The backfill must not read as a person's edit: no updated_at change and no
-- audit rows for every table, fixture and seat in the system.
alter table public.seating_tables   disable trigger user;
alter table public.seating_fixtures disable trigger user;
alter table public.seat_assignments disable trigger user;

update public.seating_tables t
   set layout_id = s.layout_id, space_id = s.id
  from public.seating_spaces s
  join public.seating_layouts l on l.id = s.layout_id
 where l.event_id = t.event_id and l.is_live;

update public.seating_fixtures f
   set layout_id = s.layout_id, space_id = s.id
  from public.seating_spaces s
  join public.seating_layouts l on l.id = s.layout_id
 where l.event_id = f.event_id and l.is_live;

update public.seat_assignments a
   set layout_id = l.id
  from public.seating_layouts l
 where l.event_id = a.event_id and l.is_live;

alter table public.seating_tables   enable trigger user;
alter table public.seating_fixtures enable trigger user;
alter table public.seat_assignments enable trigger user;

alter table public.seating_tables   alter column layout_id set not null, alter column space_id set not null;
alter table public.seating_fixtures alter column layout_id set not null, alter column space_id set not null;
alter table public.seat_assignments alter column layout_id set not null;

-- A table or fixture lies in a space of ITS layout and event, whatever the
-- action forgets to check; a seat lies in the layout of its table.
alter table public.seating_tables
  add constraint seating_tables_space_fk foreign key (space_id, layout_id, wedding_id)
    references public.seating_spaces (id, layout_id, wedding_id) on delete cascade,
  add constraint seating_tables_layout_fk foreign key (layout_id, event_id, wedding_id)
    references public.seating_layouts (id, event_id, wedding_id) on delete cascade,
  add constraint seating_tables_id_layout_uq unique (id, layout_id, wedding_id);
alter table public.seating_fixtures
  add constraint seating_fixtures_space_fk foreign key (space_id, layout_id, wedding_id)
    references public.seating_spaces (id, layout_id, wedding_id) on delete cascade,
  add constraint seating_fixtures_layout_fk foreign key (layout_id, event_id, wedding_id)
    references public.seating_layouts (id, event_id, wedding_id) on delete cascade;
alter table public.seat_assignments
  add constraint seat_assignments_table_layout_fk foreign key (table_id, layout_id, wedding_id)
    references public.seating_tables (id, layout_id, wedding_id) on delete cascade;
-- Nobody sits in two places in one layout. (guest_id, event_id) stays the
-- primary key until drafts can exist.
create unique index seat_assignments_layout_guest_uq on public.seat_assignments (guest_id, layout_id);
create index seat_assignments_layout_idx on public.seat_assignments (wedding_id, layout_id);
create index seating_tables_space_idx on public.seating_tables (space_id);
create index seating_fixtures_space_idx on public.seating_fixtures (space_id);

-- ---------------------------------------------------------------------------
-- 4. Triggers that keep callers who only know event_id working
-- ---------------------------------------------------------------------------
create or replace function public.seating_item_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_layout uuid;
begin
  if new.space_id is null then
    v_layout := public.seating_live_layout(new.event_id);
    new.layout_id := v_layout;
    new.space_id := public.seating_first_space(v_layout);
  elsif new.layout_id is null then
    select s.layout_id into new.layout_id from public.seating_spaces s where s.id = new.space_id;
  end if;
  return new;
end;
$$;
create trigger seating_tables_defaults before insert on public.seating_tables
  for each row execute function public.seating_item_defaults();
create trigger seating_fixtures_defaults before insert on public.seating_fixtures
  for each row execute function public.seating_item_defaults();

create or replace function public.seat_assignment_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.layout_id is null then
    select t.layout_id into new.layout_id from public.seating_tables t where t.id = new.table_id;
  end if;
  return new;
end;
$$;
create trigger seat_assignments_defaults before insert on public.seat_assignments
  for each row execute function public.seat_assignment_defaults();

-- A plan always has a layout, and while seating_plans is still where the room
-- is edited, the event's first space follows it.
create or replace function public.seating_plans_follow()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_layout uuid;
begin
  v_layout := public.seating_live_layout(new.event_id);
  update public.seating_spaces s
     set room_width_cm = new.room_width_cm,
         room_depth_cm = new.room_depth_cm,
         background_path = new.background_path,
         background_w_px = new.background_w_px,
         background_h_px = new.background_h_px,
         calibrated = new.calibrated
   where s.id = public.seating_first_space(v_layout);
  return null;
end;
$$;
create trigger seating_plans_follow after insert or update on public.seating_plans
  for each row execute function public.seating_plans_follow();

-- ---------------------------------------------------------------------------
-- 5. Tenancy, planner access, audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['seating_layouts', 'seating_spaces'] loop
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

create trigger audit_row after insert or update or delete on public.seating_layouts
  for each row execute function public.audit_row('id', '', 'name');
create trigger audit_row after insert or update or delete on public.seating_spaces
  for each row execute function public.audit_row('id', '', 'name');

-- ---------------------------------------------------------------------------
-- 6. The state functions learn about layouts
-- ---------------------------------------------------------------------------
-- Until drafts exist an event has one layout, so seating_state() and
-- restore_seating_state() keep taking an event id and keep their version 1
-- payload; restore puts tables and fixtures back through the same triggers
-- that fill layout_id and space_id, now into the event's first space. Spaces,
-- layouts and the second space's contents arrive with version 2, in the
-- migration that lets a layout have drafts.
