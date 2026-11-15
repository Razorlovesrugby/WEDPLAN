-- 0048_run_sheet_one_timeline.sql  (spec 50)
--
-- The run sheet becomes one flat list with a stored start and end on every
-- item, several assignees per item, and "starts after" kept as an optional
-- rule applied when a time changes.
--
-- Stored times are the truth. An item with a predecessor always satisfies
--   starts_at = predecessor.ends_at + offset_minutes
-- and the functions below are the only writers that maintain it.
--
-- `pinned`, `pinned_at`, `duration_minutes`, `owner`, `track` and `vendor_id`
-- stay in place and stop being read; a later migration drops them once the
-- backfill is verified (spec 50 decision 8). `pinned` is cleared here so a
-- once-pinned item can be given a predecessor under 0009's old checks.
--
-- Not edited: 0009, 0029, 0044, 0045. 0045's change_wedding_timezone() is
-- replaced at the end with `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. Stored times
-- ---------------------------------------------------------------------------
alter table public.run_sheet_items
  add column starts_at       timestamptz,
  add column ends_at         timestamptz,
  add column time_estimated  boolean not null default false;

-- An item no longer needs an event, and deleting an event no longer deletes
-- its items: the event is a label now.
alter table public.run_sheet_items
  drop constraint run_sheet_items_event_id_wedding_id_fkey;
alter table public.run_sheet_items
  alter column event_id drop not null;
alter table public.run_sheet_items
  add constraint run_sheet_items_event_id_wedding_id_fkey
    foreign key (event_id, wedding_id)
    references public.events (id, wedding_id)
    on delete set null (event_id);

-- ---------------------------------------------------------------------------
-- 2. Backfill
-- ---------------------------------------------------------------------------
-- Resolved exactly as v_run_sheet_items resolves them today. A chain whose
-- first item has no time takes a root time (the event's start, else the
-- wedding date at 09:00 in its timezone, else 09:00 today there), lasts 30
-- minutes unless it has its own duration, and every item in it is flagged
-- estimated. Links are kept: the rest of the chain resolves through them.
create temporary table _run_sheet_resolved as
with recursive chain as (
  select r.id,
         case when r.pinned then r.pinned_at else base.t end as s,
         case when r.pinned
              then r.pinned_at + make_interval(mins => r.duration_minutes)
              else base.t + make_interval(mins => case when r.duration_minutes > 0 then r.duration_minutes else 30 end)
         end as e,
         not r.pinned as est
    from public.run_sheet_items r
    join public.weddings w on w.id = r.wedding_id
    left join public.events ev on ev.id = r.event_id and ev.wedding_id = r.wedding_id
    cross join lateral (
      select coalesce(
        ev.starts_at,
        timezone(w.timezone, w.wedding_date + time '09:00'),
        timezone(w.timezone, timezone(w.timezone, now())::date + time '09:00')
      ) as t
    ) base
   where r.pinned or r.predecessor_id is null
  union all
  select r.id,
         c.e + make_interval(mins => r.offset_minutes),
         c.e + make_interval(mins => r.offset_minutes + r.duration_minutes),
         c.est
    from public.run_sheet_items r
    join chain c on c.id = r.predecessor_id
   where not r.pinned
)
select * from chain;

update public.run_sheet_items r
   set starts_at = c.s, ends_at = c.e, time_estimated = c.est
  from _run_sheet_resolved c
 where c.id = r.id;

-- Anything still without a time was in a predecessor loop (never reachable
-- through the app). Unlink it and give it a root time.
do $$
declare
  r record;
  v_root timestamptz;
begin
  for r in
    select i.id, i.duration_minutes, i.event_id, i.wedding_id
      from public.run_sheet_items i
     where i.starts_at is null
  loop
    select coalesce(
             (select ev.starts_at from public.events ev
               where ev.id = r.event_id and ev.wedding_id = r.wedding_id),
             timezone(w.timezone, w.wedding_date + time '09:00'),
             timezone(w.timezone, timezone(w.timezone, now())::date + time '09:00'))
      into v_root
      from public.weddings w
     where w.id = r.wedding_id;

    update public.run_sheet_items
       set predecessor_id = null,
           offset_minutes = 0,
           starts_at = v_root,
           ends_at = v_root + make_interval(mins => case when r.duration_minutes > 0 then r.duration_minutes else 30 end),
           time_estimated = true
     where id = r.id;
  end loop;
end;
$$;

-- A previously pinned item is now simply an item with no predecessor.
update public.run_sheet_items set pinned = false, pinned_at = null where pinned;

alter table public.run_sheet_items
  alter column starts_at set not null,
  alter column ends_at   set not null,
  add constraint run_sheet_items_span_check check (ends_at >= starts_at),
  add constraint run_sheet_items_offset_check check (offset_minutes between 0 and 1440);

create index run_sheet_items_starts_idx on public.run_sheet_items (wedding_id, starts_at);

-- ---------------------------------------------------------------------------
-- 3. Assignees
-- ---------------------------------------------------------------------------
create table public.run_sheet_item_assignees (
  id                    uuid primary key default gen_random_uuid(),
  wedding_id            uuid not null references public.weddings (id) on delete cascade,
  item_id               uuid not null,
  collaborator_user_id  uuid,
  guest_id              uuid,
  vendor_id             uuid,
  person_id             uuid,
  created_at            timestamptz not null default now(),
  foreign key (item_id, wedding_id)
    references public.run_sheet_items (id, wedding_id) on delete cascade,
  foreign key (wedding_id, collaborator_user_id)
    references public.collaborators (wedding_id, user_id) on delete cascade,
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (vendor_id, wedding_id)
    references public.vendors (id, wedding_id) on delete cascade,
  foreign key (person_id, wedding_id)
    references public.people (id, wedding_id) on delete cascade,
  check (num_nonnulls(collaborator_user_id, guest_id, vendor_id, person_id) = 1)
);

create index run_sheet_item_assignees_item_idx on public.run_sheet_item_assignees (item_id);
create unique index run_sheet_item_assignees_collab_uq
  on public.run_sheet_item_assignees (item_id, collaborator_user_id) where collaborator_user_id is not null;
create unique index run_sheet_item_assignees_guest_uq
  on public.run_sheet_item_assignees (item_id, guest_id) where guest_id is not null;
create unique index run_sheet_item_assignees_vendor_uq
  on public.run_sheet_item_assignees (item_id, vendor_id) where vendor_id is not null;
create unique index run_sheet_item_assignees_person_uq
  on public.run_sheet_item_assignees (item_id, person_id) where person_id is not null;

alter table public.run_sheet_item_assignees enable row level security;
alter table public.run_sheet_item_assignees force row level security;
create policy run_sheet_item_assignees_collaborator on public.run_sheet_item_assignees
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.run_sheet_item_assignees from anon;

-- The planner may work on it as on its parent (0044). The registry row and the
-- four additive policies are what 0044's loop would have generated.
insert into public.planner_table_access (table_name, access, note)
values ('run_sheet_item_assignees', 'write', null);

create policy run_sheet_item_assignees_planner_read on public.run_sheet_item_assignees
  for select to authenticated using (public.can_plan(wedding_id));
create policy run_sheet_item_assignees_planner_insert on public.run_sheet_item_assignees
  for insert to authenticated with check (public.can_plan(wedding_id));
create policy run_sheet_item_assignees_planner_update on public.run_sheet_item_assignees
  for update to authenticated
  using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id));
create policy run_sheet_item_assignees_planner_delete on public.run_sheet_item_assignees
  for delete to authenticated using (public.can_plan(wedding_id));

create trigger audit_row after insert or update or delete on public.run_sheet_item_assignees
  for each row execute function public.audit_row('id', '', '');

-- ---------------------------------------------------------------------------
-- 4. The vendor link and the owner text become assignees
-- ---------------------------------------------------------------------------
insert into public.run_sheet_item_assignees (wedding_id, item_id, vendor_id)
select r.wedding_id, r.id, r.vendor_id
  from public.run_sheet_items r
 where r.vendor_id is not null
on conflict do nothing;

-- `owner` text: one match among collaborators' display names, vendors, people
-- and guests (in that order, exact and case-insensitive) becomes an assignee.
-- No match, or several within a source, becomes one new person per distinct
-- name, assigned.
create temporary table _run_sheet_owner as
select r.id as item_id, r.wedding_id, btrim(r.owner) as name
  from public.run_sheet_items r
 where r.owner is not null and btrim(r.owner) <> '';

alter table _run_sheet_owner
  add column collab_user_id uuid, add column vendor_id uuid,
  add column person_id uuid, add column guest_id uuid, add column matched boolean not null default false;

-- Each source matches only when exactly one row carries that name.
update _run_sheet_owner o set collab_user_id = m.user_id, matched = true
  from (select c.wedding_id, lower(btrim(c.display_name)) as n, min(c.user_id::text)::uuid as user_id
          from public.collaborators c where c.display_name is not null
         group by 1, 2 having count(*) = 1) m
 where m.wedding_id = o.wedding_id and m.n = lower(o.name);

update _run_sheet_owner o set vendor_id = m.id, matched = true
  from (select v.wedding_id, lower(btrim(v.name)) as n, min(v.id::text)::uuid as id
          from public.vendors v group by 1, 2 having count(*) = 1) m
 where not o.matched and m.wedding_id = o.wedding_id and m.n = lower(o.name);

update _run_sheet_owner o set person_id = m.id, matched = true
  from (select p.wedding_id, lower(btrim(p.name)) as n, min(p.id::text)::uuid as id
          from public.people p where p.deleted_at is null group by 1, 2 having count(*) = 1) m
 where not o.matched and m.wedding_id = o.wedding_id and m.n = lower(o.name);

update _run_sheet_owner o set guest_id = m.id, matched = true
  from (select g.wedding_id, lower(btrim(coalesce(g.first_name, '') || ' ' || coalesce(g.last_name, ''))) as n,
               min(g.id::text)::uuid as id
          from public.guests g where g.deleted_at is null group by 1, 2 having count(*) = 1) m
 where not o.matched and m.wedding_id = o.wedding_id and m.n = lower(o.name);

-- One new person per distinct unmatched name, then point the rows at it.
insert into public.people (wedding_id, name)
select distinct on (o.wedding_id, lower(o.name)) o.wedding_id, o.name
  from _run_sheet_owner o
 where not o.matched
   and not exists (select 1 from public.people p
                    where p.wedding_id = o.wedding_id and lower(btrim(p.name)) = lower(o.name) and p.deleted_at is null);

update _run_sheet_owner o set person_id = p.id, matched = true
  from public.people p
 where not o.matched and p.wedding_id = o.wedding_id
   and lower(btrim(p.name)) = lower(o.name) and p.deleted_at is null;

insert into public.run_sheet_item_assignees (wedding_id, item_id, collaborator_user_id, guest_id, vendor_id, person_id)
select o.wedding_id, o.item_id, o.collab_user_id, o.guest_id, o.vendor_id, o.person_id
  from _run_sheet_owner o
 where o.matched
on conflict do nothing;

drop table _run_sheet_resolved;
drop table _run_sheet_owner;

-- ---------------------------------------------------------------------------
-- 5. The view: stored times, assignee count, same-assignee overlap
-- ---------------------------------------------------------------------------
drop view public.v_run_sheet_items;

create view public.v_run_sheet_items
with (security_invoker = true) as
with live as (
  -- Assignments to someone removed (soft-deleted) are kept but not shown.
  select a.*
    from public.run_sheet_item_assignees a
    left join public.guests g on g.id = a.guest_id and g.wedding_id = a.wedding_id
    left join public.people p on p.id = a.person_id and p.wedding_id = a.wedding_id
   where (a.guest_id is null or g.deleted_at is null)
     and (a.person_id is null or p.deleted_at is null)
)
select
  r.id, r.wedding_id, r.event_id, r.title, r.notes, r.location,
  r.guest_visible, r.sort_order, r.created_at, r.updated_at,
  r.starts_at, r.ends_at, r.predecessor_id, r.offset_minutes, r.time_estimated,
  (select count(*) from live a where a.item_id = r.id)::int as assignee_count,
  -- True when another item overlaps this one in time and shares an assignee.
  -- Touching items (one ends as the other starts) do not overlap.
  exists (
    select 1
      from live a
      join live b on b.wedding_id = a.wedding_id and b.item_id <> a.item_id
                 and (a.collaborator_user_id = b.collaborator_user_id
                   or a.guest_id = b.guest_id
                   or a.vendor_id = b.vendor_id
                   or a.person_id = b.person_id)
      join public.run_sheet_items o on o.id = b.item_id and o.wedding_id = b.wedding_id
     where a.item_id = r.id
       and o.starts_at < r.ends_at
       and o.ends_at > r.starts_at
  ) as conflict
from public.run_sheet_items r;

revoke all on public.v_run_sheet_items from anon;
grant select on public.v_run_sheet_items to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Writers. Security invoker, so RLS applies; one transaction each.
-- ---------------------------------------------------------------------------

-- Creates or updates an item, applies "starts after", replaces its assignee
-- set and carries the change to everything that follows it.
create or replace function public.save_run_sheet_item(
  p_wedding_id      uuid,
  p_item_id         uuid,
  p_title           text,
  p_notes           text,
  p_location        text,
  p_event_id        uuid,
  p_guest_visible   boolean,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_predecessor_id  uuid,
  p_offset_minutes  integer,
  p_assignees       jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id       uuid := p_item_id;
  v_old      public.run_sheet_items%rowtype;
  v_pred     public.run_sheet_items%rowtype;
  v_pred_id  uuid := p_predecessor_id;
  v_offset   integer := coalesce(p_offset_minutes, 0);
  v_start    timestamptz := p_starts_at;
  v_end      timestamptz := p_ends_at;
  v_span     interval;
  v_delta    interval;
  v_cursor   uuid;
  v_steps    integer := 0;
  v_el       jsonb;
  v_title    text := btrim(coalesce(p_title, ''));
begin
  if v_title = '' then
    raise exception 'Give the item a title';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Give the item a start and an end';
  end if;
  if p_ends_at < p_starts_at then
    raise exception 'The end cannot be before the start';
  end if;
  v_span := p_ends_at - p_starts_at;

  if p_item_id is not null then
    select * into v_old from public.run_sheet_items
     where id = p_item_id and wedding_id = p_wedding_id for update;
    if not found then
      raise exception 'That item no longer exists';
    end if;
  end if;

  if v_pred_id is not null then
    if v_pred_id = p_item_id then
      raise exception 'An item cannot start after itself';
    end if;
    select * into v_pred from public.run_sheet_items
     where id = v_pred_id and wedding_id = p_wedding_id;
    if not found then
      raise exception 'The item it should start after no longer exists';
    end if;

    -- Refuse a loop: walk up from the predecessor; reaching this item is one.
    if p_item_id is not null then
      v_cursor := v_pred.predecessor_id;
      while v_cursor is not null loop
        if v_cursor = p_item_id then
          raise exception 'Those items would start after each other in a loop';
        end if;
        v_steps := v_steps + 1;
        exit when v_steps > 10000;
        select predecessor_id into v_cursor from public.run_sheet_items where id = v_cursor;
      end loop;
    end if;

    if p_offset_minutes is null then
      -- A typed start: the gap is whatever lands it there.
      v_offset := round(extract(epoch from (p_starts_at - v_pred.ends_at)) / 60)::integer;
    end if;

    if v_offset < 0 then
      -- Earlier than the other item ends: no longer follows it.
      v_pred_id := null;
      v_offset := 0;
    elsif v_offset > 1440 then
      raise exception 'The gap can be at most 24 hours';
    else
      v_start := v_pred.ends_at + make_interval(mins => v_offset);
      v_end := v_start + v_span;
    end if;
  else
    v_offset := 0;
  end if;

  if p_item_id is null then
    insert into public.run_sheet_items
      (wedding_id, event_id, title, notes, location, guest_visible,
       starts_at, ends_at, predecessor_id, offset_minutes, duration_minutes)
    values
      (p_wedding_id, p_event_id, v_title, nullif(btrim(coalesce(p_notes, '')), ''),
       nullif(btrim(coalesce(p_location, '')), ''), coalesce(p_guest_visible, false),
       v_start, v_end, v_pred_id, v_offset,
       round(extract(epoch from (v_end - v_start)) / 60)::integer)
    returning id into v_id;
  else
    v_delta := v_end - v_old.ends_at;
    update public.run_sheet_items
       set event_id = p_event_id,
           title = v_title,
           notes = nullif(btrim(coalesce(p_notes, '')), ''),
           location = nullif(btrim(coalesce(p_location, '')), ''),
           guest_visible = coalesce(p_guest_visible, false),
           starts_at = v_start,
           ends_at = v_end,
           predecessor_id = v_pred_id,
           offset_minutes = v_offset,
           duration_minutes = round(extract(epoch from (v_end - v_start)) / 60)::integer,
           time_estimated = false
     where id = v_id and wedding_id = p_wedding_id;

    if v_delta <> interval '0' then
      -- Followers, and followers of followers, move by the change in this
      -- item's end. Gaps are kept; lengths never change.
      with recursive d as (
        select i.id from public.run_sheet_items i
         where i.wedding_id = p_wedding_id and i.predecessor_id = v_id
        union
        select i.id from public.run_sheet_items i
          join d on i.predecessor_id = d.id
         where i.wedding_id = p_wedding_id
      )
      update public.run_sheet_items f
         set starts_at = f.starts_at + v_delta,
             ends_at   = f.ends_at + v_delta
       where f.wedding_id = p_wedding_id and f.id in (select id from d);
    end if;
  end if;

  -- Replace the assignee set when one is given (null leaves it alone).
  -- Assignments to someone who has been removed (soft-deleted) are hidden from
  -- the editor, so they are not part of what it sends back and are left alone.
  if p_assignees is not null and jsonb_typeof(p_assignees) = 'array' then
    delete from public.run_sheet_item_assignees a
     where a.item_id = v_id and a.wedding_id = p_wedding_id
       and not exists (select 1 from public.guests g
                        where g.id = a.guest_id and g.wedding_id = a.wedding_id and g.deleted_at is not null)
       and not exists (select 1 from public.people p
                        where p.id = a.person_id and p.wedding_id = a.wedding_id and p.deleted_at is not null);

    for v_el in select * from jsonb_array_elements(p_assignees) loop
      case v_el ->> 'type'
        when 'collaborator' then
          insert into public.run_sheet_item_assignees (wedding_id, item_id, collaborator_user_id)
          values (p_wedding_id, v_id, (v_el ->> 'id')::uuid) on conflict do nothing;
        when 'guest' then
          insert into public.run_sheet_item_assignees (wedding_id, item_id, guest_id)
          values (p_wedding_id, v_id, (v_el ->> 'id')::uuid) on conflict do nothing;
        when 'vendor' then
          insert into public.run_sheet_item_assignees (wedding_id, item_id, vendor_id)
          values (p_wedding_id, v_id, (v_el ->> 'id')::uuid) on conflict do nothing;
        when 'person' then
          insert into public.run_sheet_item_assignees (wedding_id, item_id, person_id)
          values (p_wedding_id, v_id, (v_el ->> 'id')::uuid) on conflict do nothing;
        else
          raise exception 'Unknown assignee type %', v_el ->> 'type';
      end case;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_run_sheet_item(uuid, uuid, text, text, text, uuid, boolean, timestamptz, timestamptz, uuid, integer, jsonb)
  from public, anon;
grant execute on function public.save_run_sheet_item(uuid, uuid, text, text, text, uuid, boolean, timestamptz, timestamptz, uuid, integer, jsonb)
  to authenticated, service_role;

-- Moves an item, and everything that follows it, by a number of minutes.
create or replace function public.shift_run_sheet_item(
  p_wedding_id     uuid,
  p_item_id        uuid,
  p_delta_minutes  integer
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item    public.run_sheet_items%rowtype;
  v_delta   interval := make_interval(mins => p_delta_minutes);
  v_offset  integer;
begin
  select * into v_item from public.run_sheet_items
   where id = p_item_id and wedding_id = p_wedding_id for update;
  if not found then
    raise exception 'That item no longer exists';
  end if;
  if p_delta_minutes = 0 then
    return;
  end if;

  v_offset := 0;
  if v_item.predecessor_id is not null then
    v_offset := v_item.offset_minutes + p_delta_minutes;
    if v_offset < 0 then
      raise exception 'It cannot start before the item it follows ends';
    end if;
    if v_offset > 1440 then
      raise exception 'The gap can be at most 24 hours';
    end if;
  end if;

  update public.run_sheet_items
     set starts_at = starts_at + v_delta,
         ends_at = ends_at + v_delta,
         offset_minutes = v_offset,
         time_estimated = false
   where id = p_item_id and wedding_id = p_wedding_id;

  with recursive d as (
    select i.id from public.run_sheet_items i
     where i.wedding_id = p_wedding_id and i.predecessor_id = p_item_id
    union
    select i.id from public.run_sheet_items i
      join d on i.predecessor_id = d.id
     where i.wedding_id = p_wedding_id
  )
  update public.run_sheet_items f
     set starts_at = f.starts_at + v_delta,
         ends_at   = f.ends_at + v_delta
   where f.wedding_id = p_wedding_id and f.id in (select id from d);
end;
$$;

revoke all on function public.shift_run_sheet_item(uuid, uuid, integer) from public, anon;
grant execute on function public.shift_run_sheet_item(uuid, uuid, integer) to authenticated, service_role;

-- Deletes an item. Every follower keeps its stored time and is re-linked to the
-- deleted item's own predecessor when that gives a gap of 0 to 1440 minutes,
-- otherwise unlinked.
create or replace function public.delete_run_sheet_item(
  p_wedding_id  uuid,
  p_item_id     uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item  public.run_sheet_items%rowtype;
  v_pred  public.run_sheet_items%rowtype;
  v_have_pred boolean := false;
  f       record;
  v_gap   integer;
begin
  select * into v_item from public.run_sheet_items
   where id = p_item_id and wedding_id = p_wedding_id for update;
  if not found then
    raise exception 'That item no longer exists';
  end if;

  if v_item.predecessor_id is not null then
    select * into v_pred from public.run_sheet_items
     where id = v_item.predecessor_id and wedding_id = p_wedding_id;
    v_have_pred := found;
  end if;

  for f in
    select id, starts_at from public.run_sheet_items
     where wedding_id = p_wedding_id and predecessor_id = p_item_id
  loop
    v_gap := null;
    if v_have_pred then
      v_gap := round(extract(epoch from (f.starts_at - v_pred.ends_at)) / 60)::integer;
    end if;

    if v_gap is not null and v_gap between 0 and 1440 then
      update public.run_sheet_items
         set predecessor_id = v_pred.id, offset_minutes = v_gap
       where id = f.id and wedding_id = p_wedding_id;
    else
      update public.run_sheet_items
         set predecessor_id = null, offset_minutes = 0
       where id = f.id and wedding_id = p_wedding_id;
    end if;
  end loop;

  delete from public.run_sheet_items where id = p_item_id and wedding_id = p_wedding_id;
end;
$$;

revoke all on function public.delete_run_sheet_item(uuid, uuid) from public, anon;
grant execute on function public.delete_run_sheet_item(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. change_wedding_timezone(): the new wall-clock columns
-- ---------------------------------------------------------------------------
-- 0045's list, plus run_sheet_items.starts_at and ends_at.
create or replace function public.change_wedding_timezone(p_wedding_id uuid, p_timezone text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_old text;
begin
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'change_wedding_timezone: unknown timezone %', p_timezone;
  end if;

  select timezone into v_old from public.weddings where id = p_wedding_id for update;
  if v_old is null then
    raise exception 'change_wedding_timezone: no such wedding';
  end if;
  if v_old = p_timezone then
    return;
  end if;

  update public.weddings
     set rsvp_lock_at = (rsvp_lock_at at time zone v_old) at time zone p_timezone,
         timezone     = p_timezone
   where id = p_wedding_id;

  update public.events
     set starts_at = (starts_at at time zone v_old) at time zone p_timezone,
         ends_at   = (ends_at   at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id
     and (starts_at is not null or ends_at is not null);

  update public.run_sheet_items
     set pinned_at = (pinned_at at time zone v_old) at time zone p_timezone,
         starts_at = (starts_at at time zone v_old) at time zone p_timezone,
         ends_at   = (ends_at   at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id;

  update public.coach_runs
     set departs_at = (departs_at at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id and departs_at is not null;

  update public.coach_stops
     set pickup_at = (pickup_at at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id and pickup_at is not null;

  update public.seating_plans
     set reveal_at = (reveal_at at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id and reveal_at is not null;
end;
$$;

revoke all on function public.change_wedding_timezone(uuid, text) from public, anon;
grant execute on function public.change_wedding_timezone(uuid, text) to authenticated, service_role;
