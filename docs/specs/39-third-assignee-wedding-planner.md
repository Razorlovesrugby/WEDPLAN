# Feature spec: People — a third assignee (B) and a planner login (C)

**Status: proposed, not built.** Asked for as a spec (2026-11-03) after two rounds
of scoping. This file replaces the earlier scoping draft (it is in the git
history). Nothing beyond this file is written, and **nothing is built until the
planner says to build it** (`CLAUDE.md`, "Spec requests are not build
authorization"; answering the questions below is not it).

**Depends on:** spec 1 (list items), spec 8 (vendors), spec 15 §2
(`collaborators.display_name`), spec 20b (`sideLabel`), spec 32 (audit log).
**`0026`–`0042` are not applied to the live project** (`docs/HANDOFF.md`); this is
`0043` (part B) and `0044` (part C) and stacks on all of them.

## 1. What was asked

1. The couple have a wedding planner who is not on WedPlan. They want to **assign
   tasks to the planner** — a third choice beside *You / Partner*.
2. **Part B.** A name in a list, no login. Wanted "for other reasons" too, so it is
   built on its own and useful alone.
3. **Part C.** Let the planner **sign in**, granted from a **People** section in
   Settings. The couple said a planner seeing vendors is fine, then asked whether
   they can see **everything but the budget**.
4. The planner must **not** be part of the guest "side" idea (`partner_a`/`partner_b`).
5. "I haven't built out a weekly digest" — see §9.

## 2. Story

> **As the couple**, with a planner who isn't in WedPlan, **I want** to hand them
> tasks and, when I choose, let them sign in and see the wedding without seeing the
> money, **so that** they work from the same list as us and I'm not forwarding
> screenshots.

## 3. How "two people" is built today (verified against the source)

- `collaborators (wedding_id, user_id → auth.users, role owner|partner)` (`0001`).
  **No UI adds one**: `supabase/bootstrap.sql` writes both.
- Every tenant policy is `is_collaborator(wedding_id)` — one predicate, ~26
  `create policy` statements, ~50 mentions across 21 migrations, and each new
  table copies it. A collaborator sees and edits everything. There is no limited role.
- `list_items.assigned_to uuid references auth.users (id)` (`0005`): **an assignee
  must have a login**, which is why the planner can't be assigned today.
- The two-name assumption is repeated in `item-row.tsx` `collaboratorLabel`,
  `sideLabel` (`src/lib/format.ts`; finds "the owner" and "the other one"),
  `seating/snapshots-panel.tsx`, `audit/describe.ts`, and the tasks CSV
  (`Owner`/`Partner`).
- Views here are `security_invoker`, so they obey the viewer's access.
- The app has **no sign-up and no invite flow** (email + password: login, forgot,
  reset). The cron already uses the service-role admin client (`getUserById`).

## 4. The design in one paragraph

A **`people`** table is the single list of everyone who can be assigned a task. A
person is a name; optionally they have a **login** (`user_id`) and an **access
level**. **Part B** is the table, the assignment column and the picker. **Part C**
is the grant: a person with `access = 'planner'` gets a login and an *additive*
`can_plan()` policy on the tables the planner may see. **The planner is never a
row in `collaborators`**, so `is_collaborator()` and every existing policy are
unchanged and the two existing logins behave identically. The failure mode is safe:
a table nobody lists is **invisible** to the planner, not open to them.

## 5. Part B — a named person, no login (`0043`)

**Schema.**
```
people (
  id uuid pk, wedding_id uuid not null, name text not null (1–80, trimmed),
  sort_order int, user_id uuid null → auth.users, access text not null default 'none'
  check (access in ('none','planner')), deleted_at timestamptz,
  unique (id, wedding_id), unique (wedding_id, user_id)
)
list_items.assigned_person_id uuid null  -- composite FK (assigned_person_id, wedding_id) → people (id, wedding_id)
check (assigned_to is null or assigned_person_id is null)  -- at most one
```
`user_id` and `access` are created now (nullable / `'none'`) so Part C adds no
column. `access` is a text check, **not** a new enum value, so there is no 55P04
(enum-value-in-a-transaction) problem. Soft delete only: a removed person's tasks
keep their name (`deleted_at`, never a hard delete). RLS: collaborators only
(`is_collaborator`), `anon` revoked; added to the audit trigger **or** to the
exception list in `supabase/tests/18_audit_log.sql` (that test fails otherwise, on
purpose). The views exposing `assigned_to` (`v_timeline_items`,
`v_budget_item_tasks`, and any other that selects it) gain `assigned_person_id`
**appended** (the view rule — no reordering columns).

**Code.**
- `src/lib/people.ts` — pure `assigneeLabel()` replacing the copies in §3, plus the
  one-of-two rule; unit-tested.
- `src/server/actions/people.ts` — `addPerson`, `renamePerson`, `removePerson`;
  `assignItem` accepts a collaborator **or** a person (never both); the item
  duplicate path (`lists.ts` ~637) copies `assigned_person_id`.
- `src/server/queries/people.ts` — `cache()`d.
- Settings → **People**: add, rename, remove. The existing `CollaboratorNamesEditor`
  stays above it.
- Assign picker: *You / <partner> / <people…>*; chips on rows, timeline, calendar;
  the tasks CSV "Assigned to" column; filter by person. "Assigned to me" is
  unchanged (`assigned_to = user`).

**Not touched:** `assigned_to` and everything that reads it, `guests.side`,
`sideLabel`, the digest recipients, auth.

## 6. Part C — a planner login (`0044`)

### 6.1 What the planner sees (proposed defaults — see §10)

**Everything except the budget**, and except what is private to the couple.

| Granted (read + write unless stated) | Not granted |
| --- | --- |
| `lists`, `list_sections`, `list_items`, `list_templates`; reminders | **Budget:** `budget_categories`, `budget_items`, `payments`, `budget_item_sections`, `budget_item_lists`, `budget_item_tasks`, `consumption_components`, `fx_rates` |
| `events`, `run_sheet_items` | `gift_bank_details`, `registry_shipping`, `registry_claims` (bank and delivery details, buyers) |
| `vendors`, `vendor_contacts`, `vendor_notes`, `vendor_categories` | `audit_log` (the activity page) |
| `guests`, `households`, `guest_tags`, `tags`, `guest_notes`, `invitations`, `invitation_events`, `guest_event_overrides`, `rsvps`, `rsvp_questions`, `rsvp_answers`, `cut_lines` — **read-only** by default | `collaborators`, `saved_views`, `message_log`, settings |
| Site, seating, moodboards, registry items/settings/tags — **read-only** by default | `weddings.total_budget` (see 6.3) |

(The table is the proposed default; every row is open to change in §10. The
authoritative list lives in one array in `0044`, and a test fails if any public
table is missing from both the granted and not-granted lists — §6.5.)

### 6.2 Mechanism

- `can_plan(wedding_id)` — `security definer`, `stable`, pinned `search_path`, true
  when `auth.uid()` is a non-deleted `people.user_id` with `access = 'planner'` for
  that wedding. Same shape as `is_collaborator` (`0002`).
- One loop in `0044` (the same shape as `0002`'s): for each table in
  `planner_read_tables` create `<t>_planner_select` (`for select`); for each in
  `planner_write_tables` also `for insert/update/delete`. **Additive** policies —
  no existing policy is edited. Policies OR together, so the couple are unaffected.
- Revoking is immediate for data: RLS reads the grant on every query.
- The planner needs `select` on the wedding row (name, date, timezone).

### 6.3 The `total_budget` leak

`weddings.total_budget` is a column on the `weddings` row (`0020`), and RLS is
row-level, so letting the planner read the row shows the figure. **Default: a
limited view** `v_wedding_basics` (id, name, date, timezone, slug, … **not**
`total_budget`), `security_invoker = false` with an explicit `where can_plan(id)`,
and **no planner policy on `weddings` itself**. `getCurrentWedding` takes a planner
branch that reads the view. (Alternative: move the column to a budget-gated table —
cleaner, but rebuilds `0020`'s views; §10 Q.)

### 6.4 App changes

- **Login & invite.** `inviteToPlan(personId, email)` — a server action using the
  service-role admin API (`inviteUserByEmail`), then it writes
  `people.user_id/access`. **Also** shows a one-time set-password link the couple
  can copy and send themselves, because the invite email depends on Supabase email
  settings that have never been exercised. Revoke = set `access = 'none'`,
  `user_id` kept for history.
- **Who is the user?** A new `getViewer()` returns `{ kind: 'couple' | 'planner' }`.
  `requireWedding()` keeps meaning "a couple member"; a planner uses
  `requirePlannerOrCouple()`. The planner never reaches `/setup`.
- **Route guard.** A `(planner)/layout` check: the planner is redirected from
  `/budget`, `/settings`, `/gifts`, `/guests/rank`, the activity page and every
  export. Many queries `throw` on error, so without the guard a planner opening
  `/budget` by URL gets an error page, not an empty one.
- **Hide, don't zero.** For the planner, hide the nav item for the budget; the
  vendor spend/paid figures (`v_vendors` sums `budget_items`, which would read as
  **$0** — "we owe nothing"); the budget-link badges on `/lists/[id]` and
  `/timeline`; the dashboard Budget tile; `/guests/rank`'s per-seat figure. Each is
  a conditional on `viewer.kind`, listed in the test plan.
- **Dashboard:** a planner variant (tasks due, upcoming events, vendors) — no
  budget tile, no stats built on `v_wedding_stats` if the planner can't read the
  guest tables it sums.
- **Labels:** `assigneeLabel` already handles a person who has a login; "Assigned to
  me" for the planner matches `people.user_id`. `audit/describe.ts` also reads
  `people` so the planner's name appears in the couple's activity page.
- **Settings → People:** a "Give access" button on a person (email field, planner
  level, revoke).

### 6.5 Tests (the failure that matters is a leak)

- **SQL, with a real planner account** (`supabase/tests/24_people_planner.sql`,
  patterned on `01_tenancy.sql`'s second account): reads tasks, vendors, events;
  **reads zero rows from every budget table and from `gift_bank_details`**;
  reading `weddings` directly returns nothing and `v_wedding_basics` returns the
  row **without** `total_budget`; cannot write to read-only tables; cannot see a
  *different* wedding's rows; a revoked planner reads nothing the next statement;
  a person is invisible across weddings; the one-of-two assignment check.
- **A coverage test**: enumerate every table in `public` and fail unless it appears
  in exactly one of `planner_read_tables`, `planner_write_tables`,
  `planner_denied_tables` — so a future table can't be forgotten. (Same idea as
  `18_audit_log.sql`'s exception list.)
- **Existing suites must pass unchanged** (`verify-migrations.sh`: 671 assertions
  today). That is the proof the couple's access didn't move.
- **Unit:** `assigneeLabel`; the route-guard allow/deny table; the hide-for-planner
  conditionals.
- `verify-bootstrap.sh`, `typecheck`, `npm test`, `npm run build` — and say which of
  these was actually run. **None of this can be opened in a browser or run against
  Supabase from the build session**; the invite email, the set-password link, the
  planner's dashboard and every guarded page are *unverified* until the planner
  tries them on a real project with a real second account.

## 7. Build order

Each step is its own commit. B ships and is useful before C starts.

**Part B (`0043`)**
1. Migration + SQL test (people, `assigned_person_id`, one-of-two check, RLS, audit,
   appended view columns).
2. `src/lib/people.ts` + unit tests.
3. Actions + queries; the duplicate-item path.
4. Settings → People; the picker; chips; CSV; filter.

**Part C (`0044`), only after B is applied to the live project**
5. Migration: `can_plan()`, the policy loop, `v_wedding_basics`, grants; SQL test +
   the coverage test.
6. `getViewer()`, the planner branch of `getCurrentWedding`, the route guard.
7. Hide-for-planner changes and the planner dashboard.
8. `inviteToPlan` (+ copyable link) and the "Give access" UI.
9. Docs: HANDOFF, the migrations README, `scripts/check-migrations.sql`, the specs
   README row.

## 8. Risks

- **Views and pages that read tables the planner can't.** `v_wedding_stats`,
  `v_households`, the dashboard and similar read several tables; for a planner the
  result may be empty or an error. Each page the planner can reach has to be
  opened as a planner. **Likeliest source of breakage; unverifiable here.**
- **Invite email** depends on Supabase email configuration nobody has run.
- **A planner login can write** (to tasks, vendors, and anything moved to
  `planner_write_tables`). Their edits are audited by `auth.uid()`.
- **`0026`–`0042` aren't applied**; `0043`/`0044` stack on them and fail on a
  project missing any.

## 9. The digest

The weekly digest code exists (`/api/cron/reminders`, spec 2; it emails every row
in `collaborators`). I can't tell from the repo whether it is switched on for the
live project. The planner is not in `collaborators`, so they are **never emailed
it**. A digest of the planner's own tasks is a separate, later decision.

## 10. Open questions — none answered; defaults are the recommendation

| # | Question | Default if you just say "build" |
| --- | --- | --- |
| 1 | Planner can **edit** or only view? | Edit tasks, vendors, vendor notes; **read-only** guests, site, seating, registry |
| 2 | Is the §6.1 split right (guests visible; registry bank/delivery/claims and the activity log hidden)? | As written |
| 3 | May the planner see guests' **dietary/accessibility notes and contact details**? | **Yes** (a planner needs them for the caterer and venue) — but it is your guests' data |
| 4 | `total_budget`: limited view or move the column? | **Limited view** |
| 5 | Invite: email, copyable link, or both? | **Both** |
| 6 | Several people, or one planner? | **A list** (`people`) |
| 7 | A **Full** level (a third full login, no budget restriction)? | **No** — would need the `sideLabel`/digest fixes; add later if wanted |
| 8 | Show the planner's name in the activity log? | **Yes** |
| 9 | Label people without a login "(not on WedPlan)" in the picker? | **No** |
| 10 | Printable "planner's task list" to send them? | **Not now** |

## 11. Not in scope

Changing `guests.side` or `sideLabel`; a general permissions system beyond
None / Planner; notifying a person who has no login; the planner's own digest; any
payment or budget visibility for the planner; a "Full" third login (Q7).
