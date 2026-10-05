-- Run in the Supabase SQL editor (read-only). One marker object per migration;
-- any `applied = false` row means that migration (or part of it) has not run.
-- Not covered (no table/column to test): 0002, 0006, 0011 (first file), 0012,
-- 0016_save_the_date, 0021, 0028, 0031. The `col` checks match the column name
-- in any public table, so `notes` and `slug` can false-positive.
-- Also see: select version, name from supabase_migrations.schema_migrations;
-- (only filled when migrations go through the CLI or dashboard).
with checks(migration, kind, obj, col) as (values
  ('0001_core_schema',            'rel', 'guests',                    null),
  ('0003_derived_views',          'rel', 'v_wedding_stats',           null),
  ('0004_lists',                  'rel', 'list_items',                null),
  ('0007_settings',               'col', null,                        'reminder_window_days'),
  ('0008_multi_cut_lines',        'rel', 'cut_lines',                 null),
  ('0009_run_sheet',              'rel', 'run_sheet_items',           null),
  ('0010_budget',                 'rel', 'budget_items',              null),
  ('0011_budget_manual_quantity_columns', 'rel', 'v_budget_summary',  null),
  ('0013_moodboards',             'rel', 'moodboards',                null),
  ('0014_moodboard_clipper',      'rel', 'moodboard_clip_tokens',     null),
  ('0015_wedding_slug',           'col', null,                        'slug'),
  ('0016_list_content',           'col', null,                        'due_date_offset_days'),
  ('0017_budget_section_links',   'rel', 'budget_item_sections',      null),
  ('0017_public_site',            'rel', 'site_assets',               null),
  ('0018_section_notes',          'col', null,                        'notes'),
  ('0019_budget_nzd_and_gst',     'rel', 'v_budget_items',            null),
  ('0020_budget_allocations',     'rel', 'v_budget_category_totals',  null),
  ('0022_household_slugs',        'rel', 'household_slug_aliases',    null),
  ('0023_per_event_invites',      'rel', 'guest_event_overrides',     null),
  ('0024_block_audience',         'type','block_audience',            null),
  ('0025_site_blocks',            'rel', 'site_blocks',               null),
  ('0026_dress_codes_and_travel', 'rel', 'dress_codes',               null),
  ('0027_guest_participation',    'rel', 'song_votes',                null),
  ('0029_vendors',                'rel', 'vendors',                   null),
  ('0030_gift_funds',             'rel', 'gift_funds',                null),
  ('0032_site_asset_images',      'col', null,                        'focal_x'),
  ('0033_gift_bank_details',      'rel', 'gift_bank_details',         null)
)
select c.migration,
       case c.kind
         when 'rel'  then exists (select 1 from pg_class r join pg_namespace n on n.oid = r.relnamespace
                                  where n.nspname = 'public' and r.relname = c.obj)
         when 'type' then exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                                  where n.nspname = 'public' and t.typname = c.obj)
         when 'col'  then exists (select 1 from information_schema.columns
                                  where table_schema = 'public' and column_name = c.col)
       end as applied
from checks c
order by c.migration;
