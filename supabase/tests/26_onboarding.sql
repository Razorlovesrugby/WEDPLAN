-- ===========================================================================
-- Onboarding, timezone and currency (migration 0045, spec 40)
-- ===========================================================================
-- create_wedding() is the only way a self-serve couple gets a wedding, so the
-- failures that matter are: a signed-in user calling it directly, a second
-- wedding for a login that has one, and a new wedding another account can see.
-- change_wedding_timezone() must keep wall-clock times and leave instants be.
\set ON_ERROR_STOP on
\o /dev/null

\set alex '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''
\set newowner '''eeeeeeee-0000-4000-8000-000000000005'''
\set newpartner '''eeeeeeee-0000-4000-8000-000000000006'''
\set w1 '''11111111-1111-4111-8111-111111111111'''

create or replace function pg_temp.expect(actual bigint, wanted bigint, label text)
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

create or replace function pg_temp.expect_fails(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL % — it was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL %' then raise; end if;
  raise notice '  ok  %', p_label;
end;
$$;

grant execute on function pg_temp.expect(bigint, bigint, text) to public;
grant execute on function pg_temp.expect_text(text, text, text) to public;
grant execute on function pg_temp.expect_fails(text, text) to public;

insert into auth.users (id, email) values
  (:newowner, 'new-owner@example.test'),
  (:newpartner, 'new-partner@example.test');

-- ---------------------------------------------------------------------------
-- 1. Currency
-- ---------------------------------------------------------------------------
select pg_temp.expect_text((select currency from public.weddings where id = :w1), 'NZD',
  'an existing wedding is NZD');
select pg_temp.expect_fails($$update public.weddings set currency = 'nzd' where id = '11111111-1111-4111-8111-111111111111'$$,
  'a lower-case currency code is refused');
select pg_temp.expect_fails($$update public.weddings set currency = 'DOLLARS' where id = '11111111-1111-4111-8111-111111111111'$$,
  'a currency that is not three letters is refused');

-- ---------------------------------------------------------------------------
-- 2. create_wedding() — who may call it
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :newowner, false);
select pg_temp.expect_fails(
  $$select public.create_wedding('eeeeeeee-0000-4000-8000-000000000005', null, 'Sneaky', null,
      'Pacific/Auckland', 'NZD', null, 'Me', null)$$,
  'a signed-in user cannot call create_wedding');
reset role;

set role anon;
select pg_temp.expect_fails(
  $$select public.create_wedding('eeeeeeee-0000-4000-8000-000000000005', null, 'Sneaky', null,
      'Pacific/Auckland', 'NZD', null, 'Me', null)$$,
  'anon cannot call create_wedding');
reset role;

-- ---------------------------------------------------------------------------
-- 3. create_wedding() — what it makes
-- ---------------------------------------------------------------------------
set role service_role;
create temp table made as
  select public.create_wedding(:newowner, :newpartner, 'Robin & Kai', '2027-03-20',
           'Pacific/Auckland', 'AUD', 80, 'Robin', 'Kai') as id;
grant select on made to authenticated;
reset role;

select pg_temp.expect((select count(*) from public.weddings w join made m on m.id = w.id), 1,
  'the wedding exists');
select pg_temp.expect_text((select w.timezone || ' ' || w.currency || ' ' || w.capacity
                              from public.weddings w join made m on m.id = w.id),
  'Pacific/Auckland AUD 80', 'timezone, currency and capacity are as given');
select pg_temp.expect((select count(*) from public.weddings w join made m on m.id = w.id
                        where w.slug is not null), 1,
  'the slug is filled in by the existing trigger');
select pg_temp.expect_text((select string_agg(c.role || ':' || c.display_name, ',' order by c.role)
                              from public.collaborators c join made m on m.id = c.wedding_id),
  'owner:Robin,partner:Kai', 'owner and partner collaborators carry their names');
select pg_temp.expect((select count(*) from public.events e join made m on m.id = e.wedding_id), 2,
  'ceremony and reception');
select pg_temp.expect((select count(*) from public.events e join made m on m.id = e.wedding_id
                        where e.is_main), 1, 'exactly one main event');
select pg_temp.expect((select count(*) from public.rsvp_questions q join made m on m.id = q.wedding_id), 5,
  'four standard questions plus the built-in decline note');
select pg_temp.expect((select count(*) from public.site_blocks b join made m on m.id = b.wedding_id), 0,
  'no site rows: the builder''s empty state offers the starter layouts');

set role service_role;
select pg_temp.expect_fails(
  $$select public.create_wedding('eeeeeeee-0000-4000-8000-000000000005', null, 'Again', null,
      'Pacific/Auckland', 'NZD', null, null, null)$$,
  'a login that already has a wedding cannot get a second');
select pg_temp.expect_fails(
  $$select public.create_wedding('aaaaaaaa-0000-4000-8000-000000000001', null, 'Again', null,
      'Pacific/Auckland', 'NZD', null, null, null)$$,
  'nor can an existing couple''s login');
select pg_temp.expect_fails(
  $$select public.create_wedding('cccccccc-0000-4000-8000-000000000003', null, 'Bad zone', null,
      'Pacific/Atlantis', 'NZD', null, null, null)$$,
  'an unknown timezone is refused');
select pg_temp.expect_fails(
  $$select public.create_wedding('cccccccc-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003',
      'Same person', null, 'Pacific/Auckland', 'NZD', null, null, null)$$,
  'owner and partner must be different logins');
reset role;

-- Isolation: the new couple see only their wedding; an existing couple and a
-- stranger don't see it.
set role authenticated;
select set_config('request.jwt.claim.sub', :newowner, false);
select pg_temp.expect((select count(*) from public.weddings), 1, 'the new owner sees exactly one wedding');
select pg_temp.expect((select count(*) from public.weddings w join made m on m.id = w.id), 1,
  '... and it is theirs');
select set_config('request.jwt.claim.sub', :alex, false);
select pg_temp.expect((select count(*) from public.weddings w join made m on m.id = w.id), 0,
  'another couple cannot see the new wedding');
select pg_temp.expect((select count(*) from public.events e join made m on m.id = e.wedding_id), 0,
  '... nor its events');
select set_config('request.jwt.claim.sub', :stranger, false);
select pg_temp.expect((select count(*) from public.weddings w join made m on m.id = w.id), 0,
  'a stranger cannot see the new wedding');
reset role;

-- ---------------------------------------------------------------------------
-- 4. change_wedding_timezone()
-- ---------------------------------------------------------------------------
-- A ceremony typed as 14:00 under the wrong zone (Europe/London), a run sheet
-- anchor, a coach, a stop, a seating reveal and an RSVP lock. One system
-- timestamp (a list item's done_at) must NOT move.
update public.weddings set timezone = 'Europe/London',
       rsvp_lock_at = '2027-02-01 17:00 Europe/London'
 where id = (select id from made);
update public.events set starts_at = '2027-03-20 14:00 Europe/London',
                         ends_at   = '2027-03-20 15:00 Europe/London'
 where wedding_id = (select id from made) and name = 'Ceremony';
insert into public.coach_runs (id, wedding_id, direction, label, departs_at)
values ('c0a00000-0000-4000-8000-000000000001', (select id from made), 'to_venue', 'Coach', '2027-03-20 12:30 Europe/London');
insert into public.coach_stops (wedding_id, coach_run_id, name, pickup_at)
values ((select id from made), 'c0a00000-0000-4000-8000-000000000001', 'Hotel', '2027-03-20 12:45 Europe/London');
insert into public.lists (id, wedding_id, title)
values ('1a000000-0000-4000-8000-000000000045', (select id from made), 'Tz test');
insert into public.list_items (wedding_id, list_id, title, status, done_at)
values ((select id from made), '1a000000-0000-4000-8000-000000000045', 'Done thing', 'done', '2027-01-10 09:00 UTC');

-- A stranger can't change it (RLS hides the wedding).
set role authenticated;
select set_config('request.jwt.claim.sub', :stranger, false);
select pg_temp.expect_fails(
  format($$select public.change_wedding_timezone(%L, 'Pacific/Auckland')$$, (select id from made)),
  'a stranger cannot change another wedding''s timezone');

select set_config('request.jwt.claim.sub', :newowner, false);
select pg_temp.expect_fails(
  format($$select public.change_wedding_timezone(%L, 'Mars/Olympus')$$, (select id from made)),
  'an unknown timezone is refused');
select public.change_wedding_timezone((select id from made), 'Pacific/Auckland');
reset role;

select pg_temp.expect_text((select timezone from public.weddings where id = (select id from made)),
  'Pacific/Auckland', 'the timezone changed');
select pg_temp.expect_text(
  (select to_char(starts_at at time zone 'Pacific/Auckland', 'HH24:MI') || '-' ||
          to_char(ends_at at time zone 'Pacific/Auckland', 'HH24:MI')
     from public.events where wedding_id = (select id from made) and name = 'Ceremony'),
  '14:00-15:00', 'the ceremony still reads 14:00-15:00 in the new zone');
select pg_temp.expect_text(
  (select to_char(rsvp_lock_at at time zone 'Pacific/Auckland', 'YYYY-MM-DD HH24:MI')
     from public.weddings where id = (select id from made)),
  '2027-02-01 17:00', 'the RSVP lock keeps its wall-clock time');
select pg_temp.expect_text(
  (select to_char(departs_at at time zone 'Pacific/Auckland', 'HH24:MI')
     from public.coach_runs where id = 'c0a00000-0000-4000-8000-000000000001'),
  '12:30', 'the coach keeps its departure time');
select pg_temp.expect_text(
  (select to_char(pickup_at at time zone 'Pacific/Auckland', 'HH24:MI')
     from public.coach_stops where coach_run_id = 'c0a00000-0000-4000-8000-000000000001'),
  '12:45', 'the stop keeps its pickup time');
select pg_temp.expect_text(
  (select to_char(done_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
     from public.list_items where list_id = '1a000000-0000-4000-8000-000000000045'),
  '2027-01-10 09:00', 'a system timestamp (done_at) is a real instant and does not move');

\o
\echo '26_onboarding: ok'
