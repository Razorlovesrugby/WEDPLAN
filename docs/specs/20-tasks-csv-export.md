# Feature spec: Export all tasks to CSV

**Status: proposed, not built.** One new export kind on an existing,
already-built export endpoint — the smallest item in this round.

**Depends on:** Spec 1 (`list_items`, `list_sections`, `lists`). Already
built. No dependency on any other spec in this round.

## 1. What this changes

`src/app/api/export/[kind]/route.ts` already serves `guests`, `catering`,
and `households` as CSV, built on the shared `csvDocument` helper
(`src/lib/csv.ts` — correct quoting and formula-injection guarding already
handled there). This adds a fourth kind, `tasks`, following the exact same
shape: runs as the signed-in collaborator (RLS-scoped, not the service
role), reads every `list_items` row for the current wedding across every
active list, and returns one CSV covering the whole task system in one
file — not scoped to a single list, matching "export **all** tasks."

Columns:

| Column | Source |
| --- | --- |
| List | `lists.title` |
| Section | `list_sections.title`, blank for the "no section" bucket |
| Task | `list_items.title` |
| Status | `not_started` / `in_progress` / `done` |
| Due date | `list_items.due_date` (blank if unset) |
| Assigned to | resolved display name (spec 15 §C), falling back to the
  existing role label, blank if unassigned |
| Flagged | yes/no |
| Priority | 0–3, or blank |
| Notes | `list_items.notes` |

Sub-items are included as their own rows (same columns, their parent's
title doesn't need a separate column — the flat CSV shape guests/catering
already use has no parent/child concept either, and a sub-item's own title
is usually self-explanatory in context, e.g. "Confirm final headcount"
under a "Catering" list).

A link on `/lists` (the "All" smart view, where every task across every
list is already visible in one place) mirrors the existing
`/api/export/guests`/`/api/export/catering` links on `/guests`
(`src/app/(planner)/guests/page.tsx:39`) — same `<Link href="/api/export/tasks" className="btn" prefetch={false}>` pattern, no new component.

## 2. A decision, not an open question

**Does this respect the current view's filter (e.g. only "Flagged," or
only one list), the way the guest export respects the guest table's
filters?** No — the guest export's filter-awareness exists because a
caterer or florist genuinely wants "just the people who said yes," a
narrower list than the whole guest table. There's no equivalent narrower
audience named in the request — "export all tasks" reads as exactly that,
the whole task system in one file, not whatever smart view happens to be
open when the button is clicked. A per-list or per-view export is a
reasonable later addition if it turns out to matter, not built now.

## 3. Scope

**In:**
- `"tasks"` added to `KINDS` in `src/app/api/export/[kind]/route.ts`.
- A query joining `list_items` → `list_sections` → `lists` for the current
  wedding, sorted by list then section then the items' own `sort_order`.
- The columns above, via `csvDocument`.
- An export link on `/lists`.

**Out:**
- No filter-scoped export (see §2).
- No separate per-list export button on `/lists/[id]` — one export, the
  whole task system, same scope as the request.
- No change to the existing `guests`/`catering`/`households` kinds.

## 4. Data model

No schema change — reads existing columns across `list_items`,
`list_sections`, and `lists`. No migration.

## 5. Test plan

- Unit: none needed beyond what `csv.test.ts` already covers for
  `csvDocument`/`csvCell` — this reuses that helper, not new formatting
  logic.
- Browser pass: click the export link, confirm the downloaded CSV opens
  cleanly in a spreadsheet app, includes tasks from every list (not just
  one), includes sub-items as their own rows, and that a task title
  containing a comma or a leading `=` round-trips safely (the existing
  `csvCell` guarding, exercised against real task data for the first
  time).
