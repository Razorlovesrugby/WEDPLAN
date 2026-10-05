-- ===========================================================================
-- Site photographs: how to draw them (migration 0032)
-- ===========================================================================
-- Three things, each of which would be a quiet bug rather than a loud one:
--
--   1. The constraints refuse what the renderer must never be handed — a
--      colour that is not a hex triplet ends up in a `style` attribute, a
--      focal point outside 0..1 becomes a nonsense `object-position`, and a
--      variant width nobody generated becomes a 404 in a `srcset`.
--   2. Rows that predate the migration keep working with no change at all.
--   3. Tenancy is untouched: another couple's session can neither read nor
--      change this wedding's image settings.
-- ===========================================================================

\set ON_ERROR_STOP on
\o /dev/null

\set w1       '''11111111-1111-4111-8111-111111111111'''
\set w2       '''22222222-2222-4222-8222-222222222222'''
\set alex     '''aaaaaaaa-0000-4000-8000-000000000001'''
\set stranger '''cccccccc-0000-4000-8000-000000000003'''

create or replace function pg_temp.expect(actual int, wanted int, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — expected %, got %', label, wanted, actual;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.expect_fail(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ok  %', label;
    return;
  end;
  raise exception 'FAIL % — the statement was allowed', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 + 2. Constraints, and the old rows
-- ---------------------------------------------------------------------------
begin;
set local role service_role;

-- A photograph uploaded before the migration: none of the new columns set.
insert into public.site_assets (id, wedding_id, storage_path)
values ('51000000-0000-4000-8000-000000000001', :w1, 'site/legacy.webp');
select pg_temp.expect(
  (select cardinality(variants) from public.site_assets where storage_path = 'site/legacy.webp'),
  0, 'an existing photograph has no variants, which means "the original only"');
select pg_temp.expect(
  (select count(*)::int from public.site_assets
    where storage_path = 'site/legacy.webp' and colour is null and focal_x is null and focal_y is null),
  1, 'and no colour or focal point, so it renders exactly as it did');

insert into public.site_assets (wedding_id, storage_path, variants, colour, focal_x, focal_y)
values (:w1, 'site/new.webp', '{480,960}', '#7d8f9b', 0.25, 0.4);
select pg_temp.expect(
  (select count(*)::int from public.site_assets where storage_path = 'site/new.webp'),
  1, 'a photograph with both variants, a colour and a focal point is accepted');

select pg_temp.expect_fail(
  $q$insert into public.site_assets (wedding_id, storage_path, variants)
     values ('11111111-1111-4111-8111-111111111111', 'site/bad1.webp', '{480,1200}')$q$,
  'a variant width nobody generates is refused');

select pg_temp.expect_fail(
  $q$insert into public.site_assets (wedding_id, storage_path, colour)
     values ('11111111-1111-4111-8111-111111111111', 'site/bad2.webp', 'red;background:url(x)')$q$,
  'a colour that is not a hex triplet is refused — it lands in a style attribute');

select pg_temp.expect_fail(
  $q$insert into public.site_assets (wedding_id, storage_path, colour)
     values ('11111111-1111-4111-8111-111111111111', 'site/bad3.webp', '#7D8F9B')$q$,
  'and it must be lower-case, so one spelling is stored');

select pg_temp.expect_fail(
  $q$insert into public.site_assets (wedding_id, storage_path, focal_x, focal_y)
     values ('11111111-1111-4111-8111-111111111111', 'site/bad4.webp', 1.5, 0.5)$q$,
  'a focal point outside 0 to 1 is refused');

select pg_temp.expect_fail(
  $q$insert into public.site_assets (wedding_id, storage_path, focal_x)
     values ('11111111-1111-4111-8111-111111111111', 'site/bad5.webp', 0.5)$q$,
  'half a focal point is refused: both or neither');
rollback;

-- ---------------------------------------------------------------------------
-- 3. Tenancy
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.site_assets (id, wedding_id, storage_path, focal_x, focal_y)
values ('52000000-0000-4000-8000-000000000001', :w1, 'site/mine.webp', 0.2, 0.2),
       ('52000000-0000-4000-8000-000000000002', :w2, 'site/theirs.webp', 0.9, 0.9);

select set_config('request.jwt.claim.sub', :alex, true);
set local role authenticated;
select pg_temp.expect(
  (select count(*)::int from public.site_assets where storage_path in ('site/mine.webp', 'site/theirs.webp')),
  1, 'a collaborator sees their own wedding''s photograph and not the other couple''s');

update public.site_assets set focal_x = 0.5, focal_y = 0.5
 where storage_path = 'site/theirs.webp';
select pg_temp.expect(
  (select count(*)::int from public.site_assets where storage_path = 'site/theirs.webp'),
  0, 'and an update aimed at the other wedding''s photograph matches nothing');

set local role service_role;
select pg_temp.expect(
  (select (focal_x * 10)::int from public.site_assets where storage_path = 'site/theirs.webp'),
  9, 'whose focal point is therefore unchanged');
rollback;
