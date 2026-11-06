-- 0045_onboarding_timezone_currency.sql  (spec 40)
--
-- Three small things, one file:
--
--   1. weddings.currency — a LABEL, not a conversion. Every amount stays an
--      integer number of hundredths exactly as before; changing this changes
--      the symbol the app prints and nothing else (spec 40 §8, Q6). The check
--      is only "three uppercase letters"; the app validates the code against
--      Intl's own list.
--
--   2. create_wedding() — the one way a new couple's wedding is made, by the
--      /start onboarding action (via the service role) and by bootstrap.sql
--      (in the SQL editor). It replaces the hand-run INSERTs bootstrap used to
--      carry. SECURITY INVOKER and executable by service_role only, the same
--      shape as claim_registry_item(): the service role bypasses RLS, so the
--      function can insert the wedding row that `weddings` (no INSERT policy,
--      deliberately) would refuse a signed-in user.
--
--      It makes NO site rows. The site builder's empty state offers the starter
--      layouts (STARTER_LAYOUTS) and is a better first screen than a fixed set
--      of blocks written here; bootstrap.sql's old `site_content` rows were
--      unread since 0025 anyway.
--
--   3. change_wedding_timezone() — correcting the timezone keeps wall-clock
--      times as typed (spec 40 §7.4, Q5): a ceremony entered as 2:00 pm under
--      the wrong zone is still 2:00 pm under the right one. SECURITY INVOKER,
--      so it runs under the caller's RLS: a collaborator can change only their
--      own wedding, and a planner (no policy on `weddings`) can't at all.
--
-- No new table, so planner_table_access (0044) is unchanged.

-- ---------------------------------------------------------------------------
-- 1. Currency
-- ---------------------------------------------------------------------------
alter table public.weddings
  add column currency text not null default 'NZD';

alter table public.weddings
  add constraint weddings_currency_code check (currency ~ '^[A-Z]{3}$');

-- The planner's view of the wedding (0044) appends the column so it doesn't
-- silently lag the table. The planner sees no money; the symbol is harmless.
create or replace view public.v_wedding_basics as
select
  w.id,
  w.name,
  w.slug,
  w.wedding_date,
  w.timezone,
  w.capacity,
  w.rsvp_lock_at,
  w.invite_send_on,
  w.reminder_window_days,
  w.created_at,
  w.updated_at,
  w.currency
from public.weddings w
where public.can_plan(w.id);

-- ---------------------------------------------------------------------------
-- 2. create_wedding()
-- ---------------------------------------------------------------------------
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

  -- A ceremony and a reception: almost every wedding has both, and an
  -- invitation needs at least one event to point at.
  insert into public.events (wedding_id, name, is_public, sort_order, is_main) values
    (v_wedding_id, 'Ceremony',  true, 1, true),
    (v_wedding_id, 'Reception', true, 2, false);

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
-- 3. change_wedding_timezone()
-- ---------------------------------------------------------------------------
-- Every planner-entered wall-clock timestamptz is rewritten so it reads the
-- same in the new zone as it did in the old one. System timestamps
-- (created_at, sent_at, viewed_at, done_at, paid_at, ...) are real instants
-- and are not touched; they simply display in the new zone. Dates (due_date,
-- wedding_date, invite_send_on) are dates and do not move.
--
-- The list was re-grepped against every migration for spec 40's build:
--   weddings.rsvp_lock_at, events.starts_at / ends_at,
--   run_sheet_items.pinned_at, coach_runs.departs_at, coach_stops.pickup_at,
--   seating_plans.reveal_at.
-- A new planner-entered wall-clock column belongs here too.
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

  -- Under the caller's RLS: a wedding they can't see reads as no row.
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
     set pinned_at = (pinned_at at time zone v_old) at time zone p_timezone
   where wedding_id = p_wedding_id and pinned_at is not null;

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
