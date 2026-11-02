-- ===========================================================================
-- Registry Contribute block (migration 0042, spec 38)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''
\set w2 '''22222222-2222-4222-8222-222222222222'''

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

-- A new registry is off, with no wording and the funds listed.
insert into public.registry_settings (wedding_id) values (:w1);
select pg_temp.expect_text(
  (select contribute_position from public.registry_settings where wedding_id = :w1), 'off',
  'a new registry has Contribute off');
select pg_temp.expect_text(
  (select contribute_button_only::text from public.registry_settings where wedding_id = :w1), 'false',
  'and lists the funds');

select pg_temp.expect_fails(
  $$update public.registry_settings set contribute_position = 'sideways' where wedding_id = '11111111-1111-4111-8111-111111111111'$$,
  'a position other than off/above/below is refused');
select pg_temp.expect_fails(
  $$update public.registry_settings set contribute_heading = repeat('x', 121) where wedding_id = '11111111-1111-4111-8111-111111111111'$$,
  'a heading over 120 characters is refused');
select pg_temp.expect_fails(
  $$update public.registry_settings set contribute_text = repeat('x', 601) where wedding_id = '11111111-1111-4111-8111-111111111111'$$,
  'a line over 600 characters is refused');

update public.registry_settings set contribute_position = 'above', contribute_heading = 'Prefer to contribute?',
  contribute_button_only = true where wedding_id = :w1;
select pg_temp.expect_text(
  (select contribute_position from public.registry_settings where wedding_id = :w1), 'above',
  'above is accepted');

-- The backfill rule from 0042, run on rows that had the old tick.
insert into public.registry_settings (wedding_id, show_funds) values (:w2, true);
update public.registry_settings set contribute_position = 'off' where wedding_id = :w2;
update public.registry_settings set contribute_position = 'below' where show_funds and wedding_id = :w2;
select pg_temp.expect_text(
  (select contribute_position from public.registry_settings where wedding_id = :w2), 'below',
  'the old show_funds tick maps to below');

\o
\echo '23_registry_contribute: ok'
