# Feature spec: Task timeline

**Status: schema landed (`supabase/migrations/0005_task_timeline.sql`),
verified against `verify-migrations.sh` and `verify-bootstrap.sh`. No server
action, query, screen, generation logic, or seed loader exists yet. Open
questions below are unanswered — nothing past schema gets built until they
are.**

## 1. What this replaces

The "Checklist & Timeline" tab of a wedding planning spreadsheet: 175 tasks
bucketed by "months before the wedding," with due dates you'd otherwise
recompute by hand every time the date moves. This is the single
highest-value sheet in the source material — a real plan generated from one
date, instead of a list you re-derive yourself.

## 2. Scope

**In:**
- A `tasks` table: title, notes, due date, status, priority, optional links
  to an event or a checklist item.
- A `task_templates` table seeded with 175 date-offset tasks
  (`supabase/templates/task-timeline.json`), each with a negative
  `offset_days` from `weddings.wedding_date`.
- Idempotent generation: pick the template, preview computed dates, commit.
  Safe to re-run after the wedding date changes — moves `pending` generated
  tasks, leaves anything completed or hand-edited alone.
- List / "this week" / "overdue" views.

**Out, explicitly:**
- No `task_dependencies` table. The seed data has no real dependency edges
  (the sheet's ordering, e.g. "book venue before touring ceremony sites," is
  implied by prose, never modelled), and an empty join table is exactly the
  premature abstraction the house rules warn against. Add it in a later
  migration once a real case exists.
- No vendor or budget link on a task — those tables don't exist until V2.
- No board or calendar view unless question 5 below asks for one — the
  spec as written proposes list + filtered views only, matching what V1's
  own (unbuilt) V2 spec called `/tasks`.

## 3. Data model — landed in `0005_task_timeline.sql`

```
task_templates   id, key, title, offset_days, bucket, note, sort_order
                 -- global reference data, no wedding_id, read-only via API
tasks            id, wedding_id, title, notes, due_date, status, done_at,
                 priority, event_id, checklist_item_id, template_key,
                 offset_days, generated_at, snoozed_until
```

- `offset_days` is negative, measured from `weddings.wedding_date`. Seeded
  range is -391 to -1. Storing an offset in days (not a month bucket) makes
  a date change a single integer add and works for any engagement length.
- Generation is keyed on `(wedding_id, template_key)` — already a unique
  constraint on `tasks`, so re-generating the same template for the same
  wedding is a constraint violation, not a silent duplicate. The generation
  logic (not yet written) must catch that and treat it as "update the due
  date of this still-pending task," not an error.
- `weddings.wedding_date` is already nullable (shipped in `0001`). A null
  date makes generation a no-op with an empty state — never a blocker. An
  earlier handoff wrongly treated the wedding date as a schema blocker; it
  never was.
- A short engagement can compress early-bucket tasks into the past.
  Generation must clamp: a computed due date before today lands in an
  explicit "overdue on import" state, not silently in the past unflagged.
- `checklist_item_id` is optional — a task can exist with no checklist
  behind it, and (once spec 01 or this spec ships second) a checklist item
  can point at a task it spawned via `checklist_items.task_id`.
- RLS: `task_templates` follows the same read-only-via-API pattern as
  `checklist_templates`. `tasks` follows the standard tenant-table policy.

## 4. Screens

| Route | What it does |
| --- | --- |
| `/tasks` | List, filtered by "this week" / "overdue" / all |
| `/setup/plan` | Pick a template, preview the generated dates against the wedding's actual date, generate |

## 5. Server actions & queries needed

- `src/lib/tasks/generate.ts` — pure offset-to-date logic: given a wedding
  date and the template rows, compute what to insert/update, including the
  overdue-on-import clamp. Unit-tested directly, before it's wired into
  anything — this is exactly the kind of logic the codebase's `lib/`
  convention exists for (`docs/HANDOFF.md` section 8).
- `src/server/actions/tasks.ts` — generate from template (calls the above),
  create/edit/complete/skip/snooze a task by hand.
- `src/server/queries/tasks.ts` — list with due-date filters, counts for
  "this week" / "overdue".
- `scripts/seed-templates.mjs` (shared with checklists, spec 01) — load
  `supabase/templates/task-timeline.json` into `task_templates`, upsert on
  `key`.

## 6. Test plan

- Unit tests for `src/lib/tasks/generate.ts`: a normal engagement, a null
  wedding date (no-op), a very short engagement (overdue-on-import clamp),
  a re-generate after the date moves (pending tasks move, completed tasks
  don't), a re-generate with no date change (no-op, no duplicate error).
- `verify-migrations.sh` / `verify-bootstrap.sh` stay green (already true).
- Add a cross-wedding RLS assertion for `tasks` to
  `supabase/tests/01_tenancy.sql` — flagged, not yet done, in
  `docs/HANDOFF.md` section 1.
- `typecheck`, `npm test`, `npm run build` clean.
- Opened in a browser: generate against a real wedding date, confirm the
  dates match hand-computed expectations for a couple of sample offsets,
  change the date, re-generate, confirm only pending tasks moved.

## 7. Open questions

**1. Do you want the full 175-task template applied as-is, or reviewed
first?** Some of the sheet's tasks assume US conventions (registries,
certain vendor categories) or may simply not apply to your wedding. Options:
(a) seed and generate all 175 verbatim, prune afterwards in the UI; (b) we
trim the template list to a UK-relevant subset before it's ever seeded;
(c) something in between — flag the US-specific ones and let you decide
per-item during generation preview.

**2. Is the wedding date set?** Generation needs `weddings.wedding_date` to
produce anything real. If it's not set yet, the feature still ships (empty
state on `/setup/plan`), but worth knowing whether this is blocked on that
decision or not.

**3. Task assignment between the two of you, or a fully shared list?**
The AI-native planning pass argued explicitly against assignment-nagging
between two people marrying each other ("the app chases, the partners do
not"). Does that hold here, or do you want an `assigned_to` field and
per-person filtered views?

**4. Should a task ever link to an event, in practice?** The column
(`event_id`) exists (e.g., "confirm final headcount" tied to the reception).
Worth building the UI affordance now, or leave the column unused until a
real case comes up?

**5. List + filters only, or do you want a board/calendar view too?**
The spec as scoped is list-based (matching the un-built V2 `/tasks` route
this table also anticipated: "list, board, calendar, mine, this week,
overdue"). Board/calendar is more UI to build for a feature that's meant to
ship fast — confirm list + "this week"/"overdue" is enough for now, with
board/calendar deferred.

**6. Completed and skipped tasks — hidden or visible?** Once ticked off (or
explicitly skipped), should a task disappear from the default view, stay
visible with a strikethrough, or move to a separate "done" tab?
