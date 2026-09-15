# Migrations

Apply these **in numerical order**. Each one is a complete, self-contained SQL
script that can be pasted straight into the Supabase SQL editor.

| # | File | What it creates | Depends on |
| --- | --- | --- | --- |
| 1 | `0001_core_schema.sql` | Extensions, enums, 16 tables, indexes, constraints | — |
| 2 | `0002_row_level_security.sql` | `is_collaborator()`, RLS policies, grants | 1 |
| 3 | `0003_derived_views.sql` | `v_households`, `v_household_rsvp`, `v_wedding_stats` | 1, 2 |
| 4 | `0004_lists.sql` | Lists, sections, items, list templates, `v_timeline_items` | 1, 2, 3 |

Then run **`../bootstrap.sql`** to create your own wedding and attach yourselves
to it. That step is not optional — the app shows nothing until it has a wedding
with a collaborator row.

---

## Applying them by hand

In the Supabase dashboard → **SQL Editor**:

1. Open `0001_core_schema.sql`, copy the whole file, paste, **Run**.
2. Repeat for `0002_row_level_security.sql`, then `0003_derived_views.sql`,
   then `0004_lists.sql`.
3. Open `../bootstrap.sql`, edit the four values at the top, paste, **Run**.

Run them one file at a time and read the result before moving on. Each script
is written to fail loudly rather than half-apply, so if a step errors, do not
run the next one — fix that step first.

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
