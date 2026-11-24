-- ===========================================================================
-- Event types and per-event features (spec 51, migration 0049)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''
\set ceremony  '''e1111111-1111-4111-8111-111111111111'''
\set reception '''e2222222-2222-4222-8222-222222222222'''
\set evening   '''e3333333-3333-4333-8333-333333333333'''

create or replace function pg_temp.expect(actual int, wanted int, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_text(actual text, wanted text, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- Run a statement that must be rejected with the given SQLSTATE.
create or replace function pg_temp.expect_error(stmt text, code text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL % — expected error %, none raised', label, code;
exception when others then
  if sqlstate = code then
    raise notice '  ok  %', label;
  elsif sqlstate = 'P0001' and sqlerrm like 'FAIL %' then
    raise;
  else
    raise exception 'FAIL % — expected %, got % (%)', label, code, sqlstate, sqlerrm;
  end if;
end;
$$;

-- Seed and backfill ---------------------------------------------------------
select pg_temp.expect(
  (select count(*)::int from public.event_types where wedding_id = :w1), 9,
  'every existing wedding got the nine built-in types');
-- The seed adds wedding 2 after the migration, so it has none until seeded.
select public.seed_event_types('22222222-2222-4222-8222-222222222222');
select pg_temp.expect(
  (select count(*)::int from public.event_types where wedding_id = :w2), 9,
  'seed_event_types gives a new wedding its own nine');
-- (The backfill ran on empty tables here: the dev seed inserts events after
-- the migrations, so they take Other through the default-type trigger.)
select pg_temp.expect_text(
  (select t.name from public.events e join public.event_types t on t.id = e.type_id where e.id = :ceremony),
  'Other', 'seeded events take Other through the default-type trigger');

-- seed_event_types is idempotent
select public.seed_event_types('11111111-1111-4111-8111-111111111111');
select pg_temp.expect(
  (select count(*)::int from public.event_types where wedding_id = :w1), 9,
  'seeding again adds nothing');

-- Checks --------------------------------------------------------------------
select pg_temp.expect_error(
  $$update public.event_types set hidden_at = now()
     where wedding_id = '11111111-1111-4111-8111-111111111111' and builtin_key = 'other'$$,
  '23514', 'Other cannot be hidden');
insert into public.event_types (wedding_id, name, sort_order)
values ('11111111-1111-4111-8111-111111111111', 'Mehndi', 10);
select pg_temp.expect_error(
  $$insert into public.event_types (wedding_id, name)
     values ('11111111-1111-4111-8111-111111111111', '  MEHNDI ')$$,
  '23505', 'names are unique per wedding, ignoring case and spacing');
insert into public.event_types (wedding_id, name)
values ('22222222-2222-4222-8222-222222222222', 'Mehndi');
select pg_temp.expect(
  (select count(*)::int from public.event_types where lower(name) = 'mehndi'), 2,
  'the same name is fine in another wedding');
select pg_temp.expect_error(
  $$insert into public.event_types (wedding_id, name, asks_rsvp, is_main)
     values ('11111111-1111-4111-8111-111111111111', 'Bad main', false, true)$$,
  '23514', 'a type whose default is main must ask for replies');
select pg_temp.expect_error(
  $$insert into public.event_types (wedding_id, name, guest_facing, asks_rsvp)
     values ('11111111-1111-4111-8111-111111111111', 'Bad private', false, true)$$,
  '23514', 'a not-guest-facing type cannot ask for replies');
select pg_temp.expect_error(
  $$insert into public.event_types (wedding_id, name) values ('11111111-1111-4111-8111-111111111111', '')$$,
  '23514', 'a type needs a name');
select pg_temp.expect_error(
  $$insert into public.event_types (wedding_id, name)
     values ('11111111-1111-4111-8111-111111111111', repeat('x', 41))$$,
  '23514', 'a type name is at most 40 characters');

-- Event checks --------------------------------------------------------------
begin;
update public.events set is_main = true, asks_rsvp = true where id = :ceremony;
select pg_temp.expect_error(
  $$update public.events set asks_rsvp = false where id = 'e1111111-1111-4111-8111-111111111111'$$,
  '23514', 'a main event must ask for replies');
select pg_temp.expect_error(
  $$update public.events set guest_facing = false where id = 'e1111111-1111-4111-8111-111111111111'$$,
  '23514', 'a main/asking/public event cannot be made not guest-facing alone');
rollback;

-- The type is required, and a type is never deleted from under an event
select pg_temp.expect_error(
  $$delete from public.event_types t using public.events e
     where e.type_id = t.id and e.id = 'e1111111-1111-4111-8111-111111111111'$$,
  '23503', 'a type in use cannot be deleted');

-- An insert without a type gets the wedding's Other (the dev seed relies on it)
begin;
insert into public.events (id, wedding_id, name)
values ('e9999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111', 'Untyped');
select pg_temp.expect_text(
  (select t.builtin_key from public.events e join public.event_types t on t.id = e.type_id
    where e.id = 'e9999999-9999-4999-8999-999999999999'),
  'other', 'an event inserted without a type gets Other');
rollback;

-- A type from another wedding is refused
select pg_temp.expect_error(
  $$update public.events set type_id = (select id from public.event_types
        where wedding_id = '22222222-2222-4222-8222-222222222222' limit 1)
     where id = 'e1111111-1111-4111-8111-111111111111'$$,
  '23503', 'an event cannot take another wedding''s type');

-- Views ---------------------------------------------------------------------
begin;
-- Two guests of one household invited to the reception; the reception stops asking.
select pg_temp.expect(
  (select count(*)::int from public.v_guest_event_invites where event_id = :reception and invited), 
  (select count(*)::int from public.v_guest_event_invites where event_id = :reception and invited and asks_rsvp),
  'v_guest_event_invites exposes asks_rsvp (all ask today)');
update public.events set guest_facing = false, asks_rsvp = false, is_main = false, is_public = false
 where id = :evening;
select pg_temp.expect(
  (select count(*)::int from public.v_guest_event_invites where event_id = :evening), 0,
  'a not-guest-facing event leaves v_guest_event_invites');
rollback;

begin;
-- Count what the main RSVP views see before and after an event stops asking.
create temp table _before as
  select (select sum(rsvp_total) from public.v_household_rsvp where wedding_id = '11111111-1111-4111-8111-111111111111') as rsvp_total,
         (select outstanding_guests + attending_guests + declined_guests + maybe_guests
            from public.v_wedding_stats where wedding_id = '11111111-1111-4111-8111-111111111111') as stats;
update public.events set asks_rsvp = false where id = :reception and not is_main;
update public.events set is_main = false where id = :reception;
update public.events set asks_rsvp = false where id = :reception;
select pg_temp.expect(
  (select (b.rsvp_total - (select sum(rsvp_total) from public.v_household_rsvp
            where wedding_id = '11111111-1111-4111-8111-111111111111'))::int
     from _before b),
  (select count(*)::int from public.v_guest_event_invites
    where event_id = :reception and invited and wedding_id = '11111111-1111-4111-8111-111111111111'),
  'v_household_rsvp stops counting an event that does not ask for replies');
rollback;
