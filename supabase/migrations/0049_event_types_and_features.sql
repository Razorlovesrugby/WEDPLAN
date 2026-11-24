-- 0049_event_types_and_features.sql  (spec 51)
--
-- Event types are rows a wedding owns (nine seeded built-ins plus the
-- couple's own). A type only PRESETS an event's switches at creation; the
-- event's own switches are the truth and nothing reads the type to decide
-- behaviour.
--
-- Events gain three switches (asks_rsvp, has_seating, guest_facing) next to
-- the existing is_public / is_main. The three summary views stop counting
-- events that don't ask for replies, and the invites view drops events that
-- are not guest-facing.
--
-- Not edited: 0001, 0034, 0045. Their views and create_wedding() are replaced
-- in full below.

-- ---------------------------------------------------------------------------
-- 1. event_types
-- ---------------------------------------------------------------------------
create table public.event_types (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.weddings (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  -- Where a seeded type came from ('ceremony', 'other', ...). Read only to
  -- stop Other being hidden.
  builtin_key  text,
  asks_rsvp    boolean not null default true,
  has_seating  boolean not null default false,
  guest_facing boolean not null default true,
  is_main      boolean not null default false,
  sort_order   integer not null default 0,
  hidden_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, wedding_id),
  check (not (builtin_key = 'other' and hidden_at is not null)),
  check (not is_main or asks_rsvp),
  check (guest_facing or (not asks_rsvp and not is_main))
);
create unique index event_types_name_uq
  on public.event_types (wedding_id, lower(btrim(name)));
create unique index event_types_builtin_uq
  on public.event_types (wedding_id, builtin_key) where builtin_key is not null;
create trigger event_types_touch before update on public.event_types
  for each row execute function public.touch_updated_at();

alter table public.event_types enable row level security;
alter table public.event_types force row level security;
create policy event_types_collaborator on public.event_types
  for all to authenticated
  using (public.is_collaborator(wedding_id))
  with check (public.is_collaborator(wedding_id));
revoke all on public.event_types from anon;

-- The planner works on events (0044), so on their types too.
insert into public.planner_table_access (table_name, access, note)
values ('event_types', 'write', null);
create policy event_types_planner_read on public.event_types
  for select to authenticated using (public.can_plan(wedding_id));
create policy event_types_planner_insert on public.event_types
  for insert to authenticated with check (public.can_plan(wedding_id));
create policy event_types_planner_update on public.event_types
  for update to authenticated
  using (public.can_plan(wedding_id)) with check (public.can_plan(wedding_id));
create policy event_types_planner_delete on public.event_types
  for delete to authenticated using (public.can_plan(wedding_id));

create trigger audit_row after insert or update or delete on public.event_types
  for each row execute function public.audit_row('id', '', 'name');

-- ---------------------------------------------------------------------------
-- 2. seed_event_types(): the nine built-ins of spec 51 §4.2
-- ---------------------------------------------------------------------------
create or replace function public.seed_event_types(p_wedding_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from public.event_types where wedding_id = p_wedding_id) then
    return;
  end if;
  insert into public.event_types
    (wedding_id, name, builtin_key, asks_rsvp, has_seating, guest_facing, is_main, sort_order)
  values
    (p_wedding_id, 'Ceremony',               'ceremony',            true,  false, true,  true,  1),
    (p_wedding_id, 'Reception',              'reception',           true,  true,  true,  true,  2),
    (p_wedding_id, 'Ceremony & reception',   'ceremony_reception',  true,  true,  true,  true,  3),
    (p_wedding_id, 'Rehearsal dinner',       'rehearsal_dinner',    true,  true,  true,  false, 4),
    (p_wedding_id, 'Welcome drinks',         'welcome_drinks',      true,  false, true,  false, 5),
    (p_wedding_id, 'After party',            'after_party',         false, false, true,  false, 6),
    (p_wedding_id, 'Recovery brunch',        'recovery_brunch',     true,  false, true,  false, 7),
    (p_wedding_id, 'Getting ready / photos', 'getting_ready',       false, false, false, false, 8),
    (p_wedding_id, 'Other',                  'other',               true,  false, true,  false, 9)
  on conflict do nothing;
end;
$$;
-- Inserts into a table the caller's RLS already guards; not callable by anon.
revoke all on function public.seed_event_types(uuid) from public, anon;
grant execute on function public.seed_event_types(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. events: the type and the switches
-- ---------------------------------------------------------------------------
alter table public.events
  add column type_id      uuid,
  add column asks_rsvp    boolean not null default true,
  add column has_seating  boolean not null default false,
  add column guest_facing boolean not null default true;

-- Seed every existing wedding, then backfill (spec 51 §4.6).
select public.seed_event_types(w.id) from public.weddings w;

update public.events e
   set type_id = coalesce(
         (select t.id from public.event_types t
           where t.wedding_id = e.wedding_id
             and t.builtin_key = case lower(regexp_replace(btrim(e.name), '\s+', ' ', 'g'))
               when 'ceremony'         then 'ceremony'
               when 'reception'        then 'reception'
               when 'wedding'          then 'ceremony_reception'
               when 'rehearsal dinner' then 'rehearsal_dinner'
               when 'welcome drinks'   then 'welcome_drinks'
               when 'after party'      then 'after_party'
               else 'other' end),
         (select t.id from public.event_types t
           where t.wedding_id = e.wedding_id and t.builtin_key = 'other')),
       asks_rsvp = true,
       guest_facing = true,
       has_seating = exists (
         select 1 from public.seating_tables st where st.event_id = e.id);

alter table public.events alter column type_id set not null;
alter table public.events
  add constraint events_type_fk foreign key (type_id, wedding_id)
    references public.event_types (id, wedding_id);
create index events_type_idx on public.events (type_id);

alter table public.events
  add constraint events_main_asks_rsvp check (not is_main or asks_rsvp),
  add constraint events_guest_facing_check
    check (guest_facing or (not asks_rsvp and not is_main and not is_public));

-- An insert that names no type (the dev seed, older code paths, tests) gets
-- the wedding's Other, seeding the nine first if the wedding has none. The
-- switches stay at their column defaults.
create or replace function public.events_default_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.type_id is null then
    perform public.seed_event_types(new.wedding_id);
    select t.id into new.type_id
      from public.event_types t
     where t.wedding_id = new.wedding_id and t.builtin_key = 'other';
  end if;
  return new;
end;
$$;
create trigger events_default_type before insert on public.events
  for each row execute function public.events_default_type();

-- ---------------------------------------------------------------------------
-- 4. create_wedding(): seed the types, give the two starter events theirs
-- ---------------------------------------------------------------------------
-- 0045's body with the two starter events typed.
create or replace function public.create_wedding(
  p_owner        uuid,
  p_partner      uuid,
  p_name         text,
  p_date         date,
  p_timezone     text,
  p_currency     text,
  p_capacity     integer,
  p_owner_name   text,
  p_partner_name text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_wedding_id uuid;
begin
  if p_owner is null then
    raise exception 'create_wedding: an owner is required';
  end if;
  if p_partner is not null and p_partner = p_owner then
    raise exception 'create_wedding: the partner must be a different login';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'create_wedding: unknown timezone %', p_timezone;
  end if;

  -- One wedding per login in V1: loadWedding() takes the first it can see.
  if exists (select 1 from public.collaborators
              where user_id in (p_owner, p_partner)) then
    raise exception 'create_wedding: that login already has a wedding';
  end if;

  insert into public.weddings (name, wedding_date, timezone, currency, capacity)
  values (btrim(p_name), p_date, p_timezone, coalesce(p_currency, 'NZD'), p_capacity)
  returning id into v_wedding_id;

  insert into public.collaborators (wedding_id, user_id, role, display_name)
  values (v_wedding_id, p_owner, 'owner', nullif(btrim(coalesce(p_owner_name, '')), ''));

  if p_partner is not null then
    insert into public.collaborators (wedding_id, user_id, role, display_name)
    values (v_wedding_id, p_partner, 'partner', nullif(btrim(coalesce(p_partner_name, '')), ''));
  end if;

  perform public.seed_event_types(v_wedding_id);

  -- A ceremony and a reception: almost every wedding has both, and an
  -- invitation needs at least one event to point at. Switches follow the
  -- built-in types they take, except that only the ceremony starts as the
  -- main event (as before; the Reception type's own default is a preset).
  insert into public.events
    (wedding_id, name, is_public, sort_order, is_main, type_id, asks_rsvp, has_seating, guest_facing)
  select v_wedding_id, t.name, true, t.sort_order, t.builtin_key = 'ceremony', t.id, t.asks_rsvp, t.has_seating, t.guest_facing
    from public.event_types t
   where t.wedding_id = v_wedding_id and t.builtin_key in ('ceremony', 'reception');

  -- The spec's standard question set (the built-in decline note is added by
  -- 0023's trigger on weddings).
  insert into public.rsvp_questions (wedding_id, label, type, scope, required, sort_order) values
    (v_wedding_id, 'Song request',               'short_text', 'guest',     false, 1),
    (v_wedding_id, 'Do you need transport?',     'boolean',    'household', false, 2),
    (v_wedding_id, 'Do you need accommodation?', 'boolean',    'household', false, 3),
    (v_wedding_id, 'Message to the couple',      'long_text',  'household', false, 4);

  return v_wedding_id;
end;
$$;

revoke all on function public.create_wedding(uuid, uuid, text, date, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.create_wedding(uuid, uuid, text, date, text, text, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Views
-- ---------------------------------------------------------------------------
-- v_guest_event_invites: 0034's definition, with events that are not
-- guest-facing left out and `asks_rsvp` appended (a view may only append).
create or replace view public.v_guest_event_invites
with (security_invoker = true) as
select
  g.wedding_id,
  g.household_id,
  g.id                                   as guest_id,
  e.id                                   as event_id,
  coalesce(o.invited, he.invited, false) as invited,
  coalesce(he.invited, false)            as household_invited,
  o.invited                              as override,
  i.id                                   as invitation_id,
  i.sent_at,
  public.guest_excluded_from_counts(g.id) as excluded_from_counts,
  e.asks_rsvp
from public.guests g
join public.events e
  on e.wedding_id = g.wedding_id
 and e.guest_facing
left join lateral (
  select inv.id, inv.sent_at
  from public.invitations inv
  where inv.household_id = g.household_id
    and inv.deleted_at is null
  limit 1
) i on true
left join lateral (
  select true as invited
  from public.invitation_events iev
  where iev.invitation_id = i.id
    and iev.event_id = e.id
  limit 1
) he on true
left join public.guest_event_overrides o
  on o.guest_id = g.id
 and o.event_id = e.id
where g.deleted_at is null;

-- v_household_rsvp: 0034's definition; the RSVP counts (`r`) only look at
-- events that ask for replies. Who is invited is unchanged.
create or replace view public.v_household_rsvp
with (security_invoker = true) as
select
  h.id            as household_id,
  h.wedding_id,
  i.id            as invitation_id,
  i.sent_at,
  i.opened_at,
  i.channel,
  coalesce(r.total, 0)     as rsvp_total,
  coalesce(r.answered, 0)  as rsvp_answered,
  coalesce(r.yes, 0)       as rsvp_yes,
  coalesce(r.no, 0)        as rsvp_no,
  coalesce(r.maybe, 0)     as rsvp_maybe,
  case
    when coalesce(r.answered, 0) = 0             then 'none'
    when r.answered < r.total                    then 'partial'
    else 'complete'
  end as response_state,
  v.last_viewed_at,
  coalesce(v.view_count, 0) as view_count,
  s.std_last_viewed_at,
  coalesce(s.std_view_count, 0) as std_view_count,
  h.save_the_date_sent_at as std_sent_at,
  gc.guest_total,
  gc.unable_count
from public.households h
left join public.invitations i
  on i.household_id = h.id and i.deleted_at is null
left join lateral (
  select
    count(*)::int                                            as total,
    count(*) filter (where rs.status is not null
                       and rs.status <> 'pending')::int      as answered,
    count(*) filter (where rs.status = 'yes')::int           as yes,
    count(*) filter (where rs.status = 'no')::int            as no,
    count(*) filter (where rs.status = 'maybe')::int         as maybe
  from public.v_guest_event_invites vi
  left join public.rsvps rs
    on rs.guest_id = vi.guest_id and rs.event_id = vi.event_id
  where vi.household_id = h.id
    and vi.invited
    and vi.asks_rsvp
) r on true
left join lateral (
  select max(iv.viewed_at) as last_viewed_at, count(*)::int as view_count
  from public.invitation_views iv
  where iv.household_id = h.id
    and iv.source <> 'save_the_date'
) v on true
left join lateral (
  select max(iv.viewed_at) as std_last_viewed_at, count(*)::int as std_view_count
  from public.invitation_views iv
  where iv.household_id = h.id
    and iv.source = 'save_the_date'
) s on true
cross join lateral (
  select
    count(*)::int                                          as guest_total,
    count(*) filter (where g.unable_to_attend_at is not null)::int as unable_count
  from public.guests g
  where g.household_id = h.id
    and g.deleted_at is null
) gc
where h.deleted_at is null;

-- v_wedding_stats: 0034's definition; `rr` only looks at events that ask for
-- replies.
create or replace view public.v_wedding_stats
with (security_invoker = true) as
select
  w.id as wedding_id,
  w.capacity,
  hh.household_count,
  hh.above_cut_households,
  hh.above_cut_seats,
  gg.guest_count,
  gg.adult_count,
  gg.child_count,
  gg.infant_count,
  ii.invited_households,
  ii.opened_households,
  rr.attending_guests,
  rr.declined_guests,
  rr.maybe_guests,
  rr.outstanding_guests,
  case
    when w.capacity is null then null
    else w.capacity - rr.attending_guests
  end as seats_remaining,
  ss.silent_households
from public.weddings w
cross join lateral (
  select
    count(*)::int                                        as household_count,
    count(*) filter (where v.tier = 'A')::int            as above_cut_households,
    coalesce(sum(v.seat_count) filter (where v.tier = 'A'), 0)::int as above_cut_seats
  from public.v_households v
  where v.wedding_id = w.id
) hh
cross join lateral (
  select
    count(*)::int                                            as guest_count,
    count(*) filter (where g.age_band = 'adult')::int        as adult_count,
    count(*) filter (where g.age_band = 'child')::int        as child_count,
    count(*) filter (where g.age_band = 'infant')::int       as infant_count
  from public.guests g
  where g.wedding_id = w.id and g.deleted_at is null
) gg
cross join lateral (
  select
    count(*) filter (where i.sent_at is not null)::int    as invited_households,
    count(*) filter (where i.opened_at is not null)::int  as opened_households
  from public.invitations i
  where i.wedding_id = w.id and i.deleted_at is null
) ii
cross join lateral (
  select count(*)::int as silent_households
  from public.v_household_rsvp hr
  where hr.wedding_id = w.id
    and hr.sent_at is not null
    and (hr.opened_at is not null or hr.view_count > 0)
    and hr.response_state = 'none'
) ss
cross join lateral (
  select
    count(distinct vi.guest_id) filter (where rs.status = 'yes')::int    as attending_guests,
    count(distinct vi.guest_id) filter (where rs.status = 'no')::int     as declined_guests,
    count(distinct vi.guest_id) filter (where rs.status = 'maybe')::int  as maybe_guests,
    count(distinct vi.guest_id) filter (
      where (rs.status is null or rs.status = 'pending')
        and not vi.excluded_from_counts
    )::int                                                               as outstanding_guests
  from public.v_guest_event_invites vi
  left join public.rsvps rs
    on rs.guest_id = vi.guest_id and rs.event_id = vi.event_id
  where vi.wedding_id = w.id and vi.invited and vi.asks_rsvp
) rr;
