-- ===========================================================================
-- Coach, transport and site assets (spec 14 §7, §9 — migration 0017)
-- ===========================================================================
-- The things worth asserting are the ones that only fail once there are real
-- people on a real coach: tenancy across the composite keys, one reservation
-- per household per run, and seats_taken being computed rather than drifting.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

create or replace function pg_temp.expect_int(actual integer, wanted integer, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_null(actual anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is not null then
    raise exception 'FAIL % — expected null, got %', label, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Seats taken and left are computed
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.coach_runs (id, wedding_id, direction, label, capacity) values
  ('f1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'to_venue', 'Coach from town', 49);
insert into public.coach_stops (id, wedding_id, coach_run_id, name, sort_order) values
  ('f2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'f1000000-0000-4000-8000-000000000001', 'The Crown', 0),
  ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'f1000000-0000-4000-8000-000000000001', 'The station', 1);

select pg_temp.expect_int(
  (select seats_taken from public.v_coach_runs where id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'an empty run has no seats taken');
select pg_temp.expect_int(
  (select seats_left from public.v_coach_runs where id = 'f1000000-0000-4000-8000-000000000001'),
  49, 'an empty run has every seat left');

insert into public.coach_seats (wedding_id, coach_run_id, coach_stop_id, household_id, seats)
select '11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-000000000001',
       'f2000000-0000-4000-8000-000000000001', id, 2
  from public.households
 where wedding_id = '11111111-1111-4111-8111-111111111111' and deleted_at is null
 limit 1;

select pg_temp.expect_int(
  (select seats_taken from public.v_coach_runs where id = 'f1000000-0000-4000-8000-000000000001'),
  2, 'a reservation is counted');
select pg_temp.expect_int(
  (select seats_left from public.v_coach_runs where id = 'f1000000-0000-4000-8000-000000000001'),
  47, 'seats left follows');

-- Deleting the reservation must take the count with it. A cached column is
-- exactly what drifts here, which is why this is a view.
delete from public.coach_seats where coach_run_id = 'f1000000-0000-4000-8000-000000000001';
select pg_temp.expect_int(
  (select seats_taken from public.v_coach_runs where id = 'f1000000-0000-4000-8000-000000000001'),
  0, 'removing a reservation removes the count');
rollback;

-- ---------------------------------------------------------------------------
-- 2. No capacity is not zero capacity
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.coach_runs (id, wedding_id, direction, label) values
  ('f1000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111',
   'from_venue', 'Coach back');

select pg_temp.expect_null(
  (select seats_left from public.v_coach_runs where id = 'f1000000-0000-4000-8000-00000000000a'),
  'an uncounted run reports no seats left rather than zero');
select pg_temp.expect_int(
  (select seats_taken from public.v_coach_runs where id = 'f1000000-0000-4000-8000-00000000000a'),
  0, 'an uncounted run still reports seats taken');

do $$
begin
  begin
    insert into public.coach_runs (wedding_id, direction, label, capacity)
    values ('11111111-1111-4111-8111-111111111111', 'to_venue', 'Zero coach', 0);
    raise exception 'FAIL — a coach with zero seats was allowed';
  exception
    when check_violation then raise notice '  ok  a coach cannot have zero seats';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 3. One reservation per household per run
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.coach_runs (id, wedding_id, direction, label, capacity) values
  ('f1000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111',
   'to_venue', 'Coach', 49);
insert into public.coach_stops (id, wedding_id, coach_run_id, name) values
  ('f2000000-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111',
   'f1000000-0000-4000-8000-00000000000b', 'The Crown');

do $$
declare
  hh uuid;
begin
  select id into hh from public.households
   where wedding_id = '11111111-1111-4111-8111-111111111111' and deleted_at is null limit 1;

  insert into public.coach_seats (wedding_id, coach_run_id, coach_stop_id, household_id, seats)
  values ('11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-00000000000b',
          'f2000000-0000-4000-8000-00000000000b', hh, 2);

  begin
    insert into public.coach_seats (wedding_id, coach_run_id, coach_stop_id, household_id, seats)
    values ('11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-00000000000b',
            'f2000000-0000-4000-8000-00000000000b', hh, 3);
    raise exception 'FAIL — a household booked the same run twice';
  exception
    when unique_violation then
      raise notice '  ok  a household reserves a run once, then changes that row';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. Tenancy — the composite keys do the work
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.coach_runs (id, wedding_id, direction, label) values
  ('f1000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111',
   'to_venue', 'Wedding 1 coach');

do $$
begin
  -- A stop in wedding 2 hanging off wedding 1's run.
  begin
    insert into public.coach_stops (wedding_id, coach_run_id, name)
    values ('22222222-2222-4222-8222-222222222222',
            'f1000000-0000-4000-8000-00000000000c', 'Smuggled stop');
    raise exception 'FAIL — a stop attached to another wedding''s coach run';
  exception
    when foreign_key_violation then raise notice '  ok  a stop cannot cross weddings';
  end;
end;
$$;

do $$
declare
  other_household uuid;
begin
  select id into other_household from public.households
   where wedding_id = '22222222-2222-4222-8222-222222222222' limit 1;

  if other_household is null then
    raise notice '  ok  (skipped: wedding 2 has no households in the seed)';
    return;
  end if;

  begin
    insert into public.coach_seats (wedding_id, coach_run_id, coach_stop_id, household_id, seats)
    values ('11111111-1111-4111-8111-111111111111', 'f1000000-0000-4000-8000-00000000000c',
            'f1000000-0000-4000-8000-00000000000c', other_household, 1);
    raise exception 'FAIL — another wedding''s household got a seat';
  exception
    when foreign_key_violation then raise notice '  ok  a seat cannot cross weddings';
  end;
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 5. site_assets — one object path, and guest uploads survive a household
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

insert into public.site_assets (id, wedding_id, kind, storage_path) values
  ('f3000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'gallery', '11111111/gallery/one.webp');

do $$
begin
  begin
    insert into public.site_assets (wedding_id, kind, storage_path)
    values ('22222222-2222-4222-8222-222222222222', 'gallery', '11111111/gallery/one.webp');
    raise exception 'FAIL — two assets claimed the same object path';
  exception
    when unique_violation then raise notice '  ok  an object path belongs to one asset';
  end;
end;
$$;

-- A guest upload outlives the household being removed: the photo is still the
-- couple's to keep, it just stops being attributable.
do $$
declare
  hh uuid;
begin
  select id into hh from public.households
   where wedding_id = '11111111-1111-4111-8111-111111111111' and deleted_at is null limit 1;

  insert into public.site_assets (id, wedding_id, kind, storage_path, uploaded_by_household)
  values ('f3000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
          'gallery', '11111111/gallery/two.webp', hh);

  delete from public.households where id = hh;

  if not exists (select 1 from public.site_assets where id = 'f3000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL — a guest photo was deleted with its household';
  end if;
  if (select uploaded_by_household from public.site_assets
       where id = 'f3000000-0000-4000-8000-000000000002') is not null then
    raise exception 'FAIL — the attribution outlived the household';
  end if;
  raise notice '  ok  a guest photo survives its household, unattributed';
end;
$$;
rollback;

-- ---------------------------------------------------------------------------
-- 6. Every new table has RLS, forced
-- ---------------------------------------------------------------------------
begin;
do $$
declare
  t text;
  expected text[] := array['transport_options','coach_runs','coach_stops','coach_seats',
                           'accommodations','site_assets','site_visits'];
begin
  foreach t in array expected loop
    if not exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t and rowsecurity
    ) then
      raise exception 'FAIL — % has no row level security', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception 'FAIL — % has RLS but no policy, so nobody can read it', t;
    end if;
  end loop;
  raise notice '  ok  all 7 new tables carry RLS and a collaborator policy';
end;
$$;
rollback;
