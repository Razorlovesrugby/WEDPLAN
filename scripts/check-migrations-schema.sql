-- Checks whether migrations 0012-0015 have actually been applied by looking
-- for the objects each one creates, instead of trusting
-- supabase_migrations.schema_migrations (which only gets a row when a
-- migration runs via `supabase db push`/`migration up` -- a migration
-- pasted by hand into the Studio SQL editor, as this project's README says
-- to do, never shows up there; see scripts/check-migrations.sql).
--
-- Run it with:
--   supabase db psql -f scripts/check-migrations-schema.sql
-- or paste it into the Supabase Studio SQL editor. Purely read-only.

select
  '0012_budget_tier_position' as migration,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'budget_guest_population') > 0
    as applied

union all

select
  '0013_moodboards',
  (select count(*) from pg_type where typname = 'moodboard_share_channel') > 0
  and (select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = 'moodboards') > 0
  and (select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = 'moodboard_items') > 0
  and (select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = 'moodboard_shares') > 0
  and (select count(*) from information_schema.views
        where table_schema = 'public' and table_name = 'v_moodboards') > 0

union all

select
  '0014_moodboard_clipper',
  (select count(*) from pg_type where typname = 'moodboard_item_origin') > 0
  and (select count(*) from pg_type where typname = 'moodboard_layout') > 0
  and (select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = 'pinterest_accounts') > 0
  and (select count(*) from information_schema.tables
        where table_schema = 'public' and table_name = 'moodboard_clip_tokens') > 0

union all

select
  '0015_wedding_slug',
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'weddings' and column_name = 'slug') > 0
  and (select count(*) from pg_constraint
        where conname = 'weddings_slug_shape') > 0
  and (select count(*) from pg_indexes
        where schemaname = 'public' and indexname = 'weddings_slug_key') > 0
  and (select is_nullable = 'NO' from information_schema.columns
        where table_schema = 'public' and table_name = 'weddings' and column_name = 'slug');

-- If every row above reads `applied = true`, 0012-0015 are already fully in
-- place and should NOT be re-pasted (0013/0014 are not idempotent -- they
-- use plain `create type`/`create table`, not `if not exists`, which is
-- exactly the "already exists" error you hit). Instead, backfill the
-- history table so tracking matches reality:
--
--   insert into supabase_migrations.schema_migrations (version)
--   values ('0012'), ('0013'), ('0014'), ('0015')
--   on conflict (version) do nothing;
--
-- If a row instead reads `applied = false`, or errors because an object is
-- missing, that migration only partially ran -- stop and look at exactly
-- which of its objects exist before touching it again, rather than
-- re-pasting the whole file.
