# Feature spec: Export all tasks to CSV

**Status: built, same session.** `"tasks"` added to `KINDS` in
`src/app/api/export/[kind]/route.ts`, a new `getItemsForExport` query in
`src/server/queries/lists.ts` (every item across every active list,
joined to its list and section, ordered list → section → sort_order, "no
section" last within its list), and an "Export CSV" link on `/lists`
next to "New list." `npm run typecheck`, `npm test` (384 tests, +1 for
the new `/api/export/tasks` path in `public-paths.test.ts`), and
`npm run build` all pass (build only completes with dummy
`NEXT_PUBLIC_SUPABASE_*`/`NEXT_PUBLIC_SITE_URL` values — this sandbox has
never had a real Supabase project, same caveat every prior spec in this
rebase carries). Not opened against a live project or a real browser.

**Depends on:** Spec 1 (`list_items`, `list_sections`, `lists`), already
built. "Assigned to" currently shows the existing role label ("Owner" /
"Partner") since spec 15's real display names aren't built yet — it'll
pick those up automatically once spec 15 lands, no further change needed
here.

## 1. What this changes

`src/app/api/export/[kind]/route.ts` already serves `guests`, `catering`,
and `households` as CSV via the shared `csvDocument` helper
(`src/lib/csv.ts` — quoting and formula-injection guarding already
handled there). This adds a fourth kind, `tasks`, same shape: runs as the
signed-in collaborator (RLS-scoped, not the service role), reads every
`list_items` row for the current wedding across every active list, one
CSV covering the whole task system — not scoped to a single list, matching
"export **all** tasks."

Columns: List, Section (blank for the "no section" bucket), Task, Status,
Due date, Assigned to (blank if unassigned), Flagged, Priority, Notes.
Sub-items are included as their own rows, same columns — the flat CSV
shape the guest/catering exports already use has no parent/child concept
either.

A link on `/lists` (the "All" view, where every task is already visible in
one place) mirrors the existing `/api/export/guests`/`/api/export/catering`
links on `/guests` — same `<Link href="/api/export/tasks" className="btn" prefetch={false}>`
pattern, no new component.

**Decided: this doesn't respect whatever view/filter is currently open.**
The guest export's filter-awareness exists because a caterer genuinely
wants a narrower list ("just who said yes"); nothing here names an
equivalent narrower audience — "export all tasks" reads as exactly that.

## 2. Scope

**In:** `"tasks"` added to `KINDS`; a query joining
`list_items → list_sections → lists` for the current wedding, sorted by
list then section then the items' own `sort_order`; the columns above via
`csvDocument`; an export link on `/lists`.

**Out:** no filter-scoped export; no per-list export button on
`/lists/[id]` — one export, the whole task system.

## 3. Data model

No schema change — reads existing columns. No migration.

## 4. Test plan

- Unit: none beyond what `csv.test.ts` already covers for
  `csvDocument`/`csvCell`.
- Browser pass: click the export link, confirm the CSV includes tasks
  from every list, includes sub-items as their own rows, and that a task
  title containing a comma or a leading `=` round-trips safely.
