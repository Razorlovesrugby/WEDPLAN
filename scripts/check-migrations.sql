-- Checks whether every migration in supabase/migrations has actually been
-- applied to the connected database, by comparing the file list against the
-- Supabase CLI's own tracking table, supabase_migrations.schema_migrations
-- (the same table `supabase migration list` reads).
--
-- Run it with:
--   supabase db psql -f scripts/check-migrations.sql
-- or paste it into the Supabase Studio SQL editor.
--
-- Update the `expected` list below whenever a migration file is added or
-- renamed -- SQL has no way to read the supabase/migrations directory
-- itself, so this list is the query's copy of what's on disk.
--
-- Caveat: this project's migrations are normally applied by hand in the SQL
-- editor (see supabase/migrations/README.md), not via `supabase db push`.
-- A dashboard-pasted migration is NOT recorded here, so a "MISSING" row
-- does not necessarily mean the migration's tables/columns don't exist --
-- only that this history table has no record of it. Treat this as a
-- CLI-tracking check, and cross-reference with the schema itself (e.g. the
-- "What success looks like" queries in the migrations README) if a row
-- shows MISSING but the app is working fine.
--
-- Also note 0011 is split across two files that share the same numeric
-- prefix (0011_budget_manual_quantity.sql and
-- 0011_budget_manual_quantity_columns.sql, split apart to dodge a Postgres
-- enum-in-transaction error -- see the migrations README). The CLI keys
-- history by that leading number, so it can only ever record one row for
-- "0011" no matter how many files share the prefix; this query lists the
-- prefix once and calls out the split in its file column instead of
-- claiming two runs.

with expected(version, files) as (
  values
    ('0001', 'core_schema.sql'),
    ('0002', 'row_level_security.sql'),
    ('0003', 'derived_views.sql'),
    ('0004', 'lists.sql'),
    ('0005', 'lists_status_assignment.sql'),
    ('0006', 'reminders.sql'),
    ('0007', 'settings.sql'),
    ('0008', 'multi_cut_lines.sql'),
    ('0009', 'run_sheet.sql'),
    ('0010', 'budget.sql'),
    ('0011', 'budget_manual_quantity.sql + budget_manual_quantity_columns.sql'),
    ('0012', 'budget_tier_position.sql'),
    ('0013', 'moodboards.sql'),
    ('0014', 'moodboard_clipper.sql'),
    ('0015', 'wedding_slug.sql')
),
applied as (
  select version from supabase_migrations.schema_migrations
)
select
  e.version,
  e.files,
  a.version is not null as has_run,
  case when a.version is null then 'MISSING' else 'applied' end as status
from expected e
left join applied a using (version)
order by e.version;

-- Bonus: anything the history table knows about that isn't one of the
-- files above (e.g. a migration created and applied since this list was
-- last updated). Each `with` block only scopes its own statement, so the
-- expected-version list is repeated here rather than reused from above.
with expected(version) as (
  values
    ('0001'), ('0002'), ('0003'), ('0004'), ('0005'),
    ('0006'), ('0007'), ('0008'), ('0009'), ('0010'),
    ('0011'), ('0012'), ('0013'), ('0014'), ('0015')
)
select version as unexpected_applied_version
from supabase_migrations.schema_migrations
where version not in (select version from expected)
order by version;
