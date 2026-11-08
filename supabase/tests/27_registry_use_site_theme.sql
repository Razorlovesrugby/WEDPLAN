-- ===========================================================================
-- Registry "use invitation theme" switch (migration 0046, spec 44)
-- ===========================================================================
\set ON_ERROR_STOP on
\o /dev/null

\set w1 '''11111111-1111-4111-8111-111111111111'''

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

-- Off by default, so nothing a guest sees changes until the couple turns it on.
insert into public.registry_settings (wedding_id, palette, type_pairing) values (:w1, 'sage', 'modern')
  on conflict (wedding_id) do update set palette = 'sage', type_pairing = 'modern';
select pg_temp.expect_text(
  (select use_site_theme::text from public.registry_settings where wedding_id = :w1), 'false',
  'a registry does not follow the invitation by default');

-- Turning it on keeps the registry's own choices, so turning it off restores them.
update public.registry_settings set use_site_theme = true where wedding_id = :w1;
select pg_temp.expect_text(
  (select use_site_theme::text || ' ' || palette || ' ' || type_pairing from public.registry_settings where wedding_id = :w1),
  'true sage modern',
  'switching on keeps the palette and pairing that were chosen');

select pg_temp.expect_fails(
  $sql$update public.registry_settings set use_site_theme = null where wedding_id = '11111111-1111-4111-8111-111111111111'$sql$,
  'the switch is never null');

-- The change is audited like every other registry setting.
select pg_temp.expect_text(
  (select (count(*) > 0)::text from public.audit_log
    where table_name = 'registry_settings' and wedding_id = :w1 and action = 'update'
      and changed ? 'use_site_theme'),
  'true',
  'turning it on is audited');

\o
\echo '27_registry_use_site_theme: ok'
