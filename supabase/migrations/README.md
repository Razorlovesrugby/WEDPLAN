# Migrations

Apply these **in numerical order**. Each one is a complete, self-contained SQL
script that can be pasted straight into the Supabase SQL editor.

| # | File | What it creates | Depends on |
| --- | --- | --- | --- |
| 1 | `0001_core_schema.sql` | Extensions, enums, 16 tables, indexes, constraints | — |
| 2 | `0002_row_level_security.sql` | `is_collaborator()`, RLS policies, grants | 1 |
| 3 | `0003_derived_views.sql` | `v_households`, `v_household_rsvp`, `v_wedding_stats` | 1, 2 |
| 4 | `0004_lists.sql` | Lists, sections, items, list templates, `v_timeline_items` | 1, 2, 3 |
| 5 | `0005_lists_status_assignment.sql` | Board status, one level of sub-items, recurrence, assignment | 1, 2, 3, 4 |
| 6 | `0006_reminders.sql` | `message_log.kind` gains `'digest'` | 1 |
| 7 | `0007_settings.sql` | One settings column | 1 |
| 8 | `0008_multi_cut_lines.sql` | Multi-cut guest lines | 1, 3 |
| 9 | `0009_run_sheet.sql` | Day-of run sheet | 1, 2 |
| 10 | `0010_budget.sql` | Budget categories and line items | 1, 2 |
| 11 | `0011_budget_manual_quantity.sql` then `0011_budget_manual_quantity_columns.sql` | Manual quantity × unit price costing basis (two-part — see below) | 10 |
| 12 | `0012_budget_tier_position.sql` | Budget's guest-population helper follows spec 5's tier rewrite | 8, 10 |
| 13 | `0013_moodboards.sql` | Moodboards | 1, 2 |
| 14 | `0014_moodboard_clipper.sql` | Pinterest import, right-click clipper | 13 |
| 15 | `0015_wedding_slug.sql` | `weddings.slug` | 1 |
| 16 | `0016_list_content_and_calculated_dates.sql` | Collaborator display names, notes-kind list sections, calculated due dates | 4, 5 |
| 17 | `0017_budget_section_links.sql` | `budget_item_sections`, `v_budget_item_tasks.link_source`, `v_timeline_items.list_icon` | 4, 5, 10, 16 |
| 18 | `0018_section_notes.sql` | `list_sections.notes` (free text per section); drops `list_sections.kind` and `list_section_kind` from 16 — see that file's own comment | 16 |
| 19 | `0019_budget_nzd_and_gst.sql` | Drops `fx_rates`, every `currency`/`fx_rate` column, and `weddings.base_currency` — budget is NZD only; adds `budget_items.gst_treatment` (a hardcoded 15% uplift when exclusive) | 10, 11, 17 |
| 20 | `0020_budget_allocations.sql` | `weddings.total_budget`, `allocation_pct` on categories and items, `v_budget_category_totals` | 10, 19 |
| 21 | `0021_budget_zero_is_not_a_figure.sql` | `create or replace` of `v_budget_items` — a typed 0 no longer outranks a real figure | 20 |
| 22 | `0022_household_slugs.sql` | `households.slug`/`slug_suffix`, their derivation and trigger, `household_slug_aliases`, `events.guest_note` | 1, 15 |
| 23 | `0023_per_event_invites.sql` | `guest_event_overrides`, `v_guest_event_invites`, `invitation_views`, recounted summary views | 1, 22 |
| 24 | `0024_block_audience.sql` | The `block_audience` enum, **alone** (the 55P04 rule) | 1 |
| 25 | `0025_site_blocks.sql` | `site_blocks`, `site_revisions` + pruning trigger, `song_requests`, the backfill from `site_content` | 24, and 17's `site_content` |
| 26 | `0026_dress_codes_and_travel.sql` | `dress_codes`, `dress_code_notes`, `events.dress_code_id`, `coach_runs.event_id` (and `v_coach_runs` recreated to carry it), `arrival_points`, four nullable columns on `transport_options`, and the dress-code backfill out of `site_blocks` payloads | 17, 25 |
| 27 | `0027_guest_participation.sql` | `song_votes` (household NOT NULL — a vote needs identity), `guest_notes`, and the composite unique `song_requests` needed to become a parent | 25 |
| 28 | `0028_editorial_default.sql` | Pins every existing wedding to the Script theme it was already rendering, so the code-level default could move to Editorial without restyling anybody | 1 |
| 29 | `0029_vendors.sql` | `vendor_stage`, `vendor_categories`, `vendors`, `vendor_contacts`, `vendor_notes`, the one-primary partial unique index, `budget_items.vendor_id`, `run_sheet_items.vendor_id`, `v_vendors`, and `v_budget_items` + `v_reminders_due` redefined to prefer the linked vendor's live name | 9, 10, 17, 20, 21 |
| 30 | `0030_gift_funds.sql` | `gift_funds` — a wedding list as two or three things worth saving towards. Money as integer minor units, `contribute_url` constrained to http(s) because it ends up in an `href` in front of every guest, and deliberately **no contributions ledger**: nothing here takes a payment, and the file's header says why an empty one would be worse than none | 14, 18 |
| 31 | `0031_save_the_date_views.sql` | `invitation_views.source` gains `save_the_date`; `v_household_rsvp` keeps invitation opens and save-the-date opens apart, appending `std_last_viewed_at` / `std_view_count` | 23 |

Then run **`../bootstrap.sql`** to create your own wedding and attach yourselves
to it. That step is not optional — the app shows nothing until it has a wedding
with a collaborator row.

**This table must stay in sync with the files in this directory.** A stale
table that stops short of the newest migration is exactly how a column like
`list_sections.kind` (added in `0016`) ends up missing from a real project —
whoever applied migrations by hand followed this list and stopped where it
stopped. Add a row here in the same commit that adds a migration file.

*It went stale anyway.* It stopped at `0019` while the directory held files
through `0025`, and was brought back into line when `0026`–`0028` landed — so
anybody who applied migrations by hand from this list between sessions 23 and
29 is missing six of them, `0020` onwards. Check what a project actually has
before assuming: `select count(*) from information_schema.columns where
table_name = 'events' and column_name = 'dress_code_id'` answers it for the
newest, and the "What success looks like" queries below answer the rest.

---

## Applying them by hand

In the Supabase dashboard → **SQL Editor**:

1. Open `0001_core_schema.sql`, copy the whole file, paste, **Run**.
2. Repeat for every other file above, **in numerical order** (including both
   halves of `0011`, in order), ending with the highest-numbered file in this
   directory.
3. Open `../bootstrap.sql`, edit the four values at the top, paste, **Run**.

Run them one file at a time and read the result before moving on. Each script
is written to fail loudly rather than half-apply, so if a step errors, do not
run the next one — fix that step first.

**After a migration adds a column or table, the app may still 404 it as
"Could not find the '…' column … in the schema cache" for a few moments.**
PostgREST caches the schema and only reloads on its own `LISTEN`/DDL hook,
which can lag right after a dashboard paste. If it doesn't clear on its own,
Dashboard → **Settings → API → Reload schema** (or `NOTIFY pgrst, 'reload
schema';` from the SQL editor) forces it. This is also exactly what you'll
see if the migration itself failed partway (e.g. the enum error below) —
check `select column_name from information_schema.columns where
table_name = 'budget_items'` first to confirm the column actually exists
before reloading the cache.

**A file whose number has two parts (e.g. `0011_budget_manual_quantity.sql`
and `0011_budget_manual_quantity_columns.sql`) must be pasted and run as two
separate steps, in that order.** The SQL editor sends a whole pasted script
as one multi-statement query, which Postgres runs as a single implicit
transaction — and a query added by `alter type ... add value` can't be used
anywhere else in that same transaction (`55P04 unsafe use of new value`,
with a hint that new enum values must be committed first). Splitting the
enum add into its own file/paste is how this schema avoids that error;
running both halves in one paste reproduces it.

### What "success" looks like

After `0003` (before `0004`, if you're checking incrementally):

```sql
-- 16 tables
select count(*) from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';

-- every one of them with RLS enabled
select tablename from pg_tables
 where schemaname = 'public' and not rowsecurity;   -- expect zero rows

-- three views
select table_name from information_schema.views where table_schema = 'public';
```

After `0004`: 4 more base tables (`list_templates`, `lists`,
`list_sections`, `list_items`) and a fourth view, `v_timeline_items`. Still
zero rows from the RLS query above — `list_templates` is reference data
with a read-only policy, not an exception to "every table has RLS."

After `0005`: same 20 tables and 4 views — it only adds columns, a new enum
(`list_item_status`), constraints, indexes and triggers to `list_items`, and
replaces `v_timeline_items` (views carry no data, so redefining one is
additive the same way a new column is). Run
`select count(*) from public.list_items where status is null` afterwards;
expect `0`.

**If you generated `list_templates` content before running `0005`, run
`node scripts/seed-templates.mjs` again afterwards** — it upserts on `key`,
so re-running it is always safe and picks up the restructured
`task-timeline.json` payload.

After `0006`: one new enum value, nothing else — same 20 tables, same 4
views. `select enum_range(null::public.message_kind)` should include
`digest`.

After the bootstrap, signing in with your email should show an empty dashboard
rather than a redirect loop.

---

## Applying them with the CLI instead

```bash
supabase db reset     # local: migrations + seed, from scratch
supabase db push      # hosted: applies anything not yet recorded
```

The numeric prefix **is** the migration version as far as the CLI is concerned.
Supabase's own convention is a timestamp (`20260914120000_name.sql`), and if you
later run `supabase migration new` it will create one of those. That is fine —
`0001` sorts before `2026…`, so new timestamped migrations still apply after
these three.

---

## Rules from here on

**Once these have been applied to a real project, migrations are append-only.**
Add the next numbered migration, never edit one already applied. Editing an
applied migration means the database and the repository disagree, and
nothing will tell you.

They were edited in place during the build because nothing had ever run them for
real. That stops the moment you run step 1 above.

**Adding a tenant table means two edits, not one.** Create it in your new
migration with the composite-FK pattern (`wedding_id`, a redundant
`unique (id, wedding_id)` on the parent, and a child FK on
`(parent_id, wedding_id)`), then add its name to the `tenant_tables` array in a
new migration that re-runs the policy loop from `0002`. A tenant table without a
policy is readable by anyone with a session.

---

## Verifying without touching a real project

```bash
./scripts/verify-migrations.sh
```

Builds a throwaway PostgreSQL cluster, applies a small shim for the Supabase
objects that do not exist locally (`auth.users`, `auth.uid()`, the `anon`,
`authenticated` and `service_role` roles), applies every migration and the seed,
then runs the assertions in `../tests/`. No Docker and no network. It must not
run as root, because `initdb` refuses.

`tests/fixtures/supabase_shim.sql` is a **test fixture only**. Never paste it
into a real project — Supabase provides those objects itself.

---

## `seed.sql` is development data

It creates two weddings, a dozen households and a second couple who exist only
so the tenancy tests have something they must not be able to see. Useful
locally; do not paste it into the project you are going to send real
invitations from. Use `bootstrap.sql` instead.
