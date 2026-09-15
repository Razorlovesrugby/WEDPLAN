# Feature specs

**Process, starting session 7:** each feature in the rebase gets its own
spec, built one at a time on top of the shipped V1 MVP. A spec is not a
green light — it's a proposal plus a list of decisions only the planner can
make. **Nothing beyond schema is built for a feature until its Open
Questions section has answers.** When you answer a spec's questions, they
get folded into that file (a new "Answered" section, dated), and the build
proceeds per that spec's own build order. Schema (a migration) may exist
ahead of that if it was reviewed as pure infrastructure — each spec says so
explicitly where true — but no server action, query, screen, or seed data
gets wired up until the questions are answered.

Why this exists: `docs/HANDOFF.md` used to carry the whole plan inline, for
every feature at once. That made it hard to build one thing, get it signed
off, and move to the next without the other features' half-finished
thinking sitting in the same document. One spec per feature keeps each
decision scoped to the feature it affects.

## Features and status

| # | Feature | Status | Depends on |
| --- | --- | --- | --- |
| 1 | [Checklists](01-checklists.md) | Schema landed (`0004`). **Open questions unanswered.** | V1 only |
| 2 | [Task timeline](02-task-timeline.md) | Schema landed (`0005`). **Open questions unanswered.** | V1 only (checklist link is optional) |
| 3 | [Reminders](03-reminders.md) | Spec only, no schema. **Open questions unanswered.** | Task timeline must ship first |

## Recommended build order

**Checklists → task timeline → reminders.**

- Checklists is the smallest, most self-contained slice — one screen family,
  no generation logic, no cron. Good first feature to prove the process on.
- Task timeline is the highest-value piece of the rebase (a real plan
  derived from the wedding date) but has one more moving part: idempotent
  generation logic that has to be unit-tested before it touches a server
  action.
- Reminders is last on purpose — it has nothing to remind about until tasks
  (and their due dates) exist. It also reuses the existing
  `/api/cron/reminders` infrastructure, so building it after task timeline
  means extending working code instead of guessing at the shape in advance.

This order is a recommendation, not a constraint — if you'd rather answer
task timeline's questions first, say so and we build in that order instead.

## What's shared across all three

- None of the three need vendors, budget, or Gmail — only `weddings`,
  `events`, and the two collaborators already in the schema. That's what
  lets this ship ahead of V2.
- Every new tenant table follows the existing tenancy pattern
  (`docs/HANDOFF.md` section 5, rule 1): `wedding_id` + composite foreign
  keys, added to the RLS `tenant_tables` array in the same migration that
  creates the table.
- Every write is a server action, every read is a cached query, pure logic
  lives in `src/lib/` and is unit-tested there — `docs/HANDOFF.md` section 8.
- Each feature's own spec has a "Test plan" section — the same shape of
  check V1 uses (`typecheck`, unit tests, `verify-migrations.sh`,
  `verify-bootstrap.sh`, `npm run build`, then actually opening it in a
  browser). No feature is "done" on green checks alone; V1's rank-list bugs
  (`docs/HANDOFF.md`, "THE ACTUAL BLOCKER" section history) passed every
  automated check and still didn't render.
