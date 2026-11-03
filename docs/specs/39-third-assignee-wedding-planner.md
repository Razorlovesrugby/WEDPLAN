# Feature spec: A third person to assign tasks to — the wedding planner

**Status: proposed, not built. Round two (2026-11-03): the planner has said a
planner login that sees the budget and vendors is fine, likes B for its own
reasons, and asked for C to be scoped — see §8.** Asked for as "see if that's in
scope for build" (2026-11-03). This file is the scoping. Nothing beyond it is written, and nothing
is built until the planner says to build it (`CLAUDE.md`, "Spec requests are not
build authorization"; answering the questions below is not it).

**Depends on:** spec 1 (list items), spec 15 §2 (`collaborators.display_name`),
spec 20b (`sideLabel`), spec 32 (audit log). **`0026`–`0042` are not applied to
the live project** (`docs/HANDOFF.md`); this would be `0043` and stacks on them.

## 1. What was asked

1. The couple have a human wedding planner. **The planner will not have access
   to WedPlan.**
2. "Is there a way to create a third login per WedPlan login?"
3. The task assignee choice currently reads *You / Partner*. Add the planner as a
   third choice.
4. "I understand that everything's two profiles, but let's scope out adding a third."

Points 1 and 2 pull in opposite directions: a *login* is access, and the planner
is not meant to have any. So the scoping question is really **"does the planner
need to be able to sign in, or only to be a name tasks can be handed to?"** The
rest of this spec follows from that.

## 2. How "two people" is built today (verified against the source)

- **A collaborator is a login.** `collaborators (wedding_id, user_id → auth.users,
  role owner|partner)` (`0001`). There is **no UI to add one**: the owner is
  written by `supabase/bootstrap.sql`, the partner by the same script from a
  `v_partner_email` constant. Adding a person today means editing and re-running SQL.
- **A collaborator is everything.** `is_collaborator(wedding_id)` is the one RLS
  predicate on every tenant table (`0002`). A third collaborator would see and
  edit the guest list, budget (bank details, contracts), the site, the registry
  claims and the audit log. There is no "limited" role; the enum has two values
  and both are full access.
- **An assignee is a login.** `list_items.assigned_to uuid references auth.users
  (id) on delete set null` (`0005`). You **cannot assign a task to someone who
  has no account**, which is exactly the planner's situation.
- **Where the two names are assumed:**
  - `item-row.tsx` `collaboratorLabel` → `display_name`, else `You` / `Owner` / `Partner`.
  - `sideLabel` in `src/lib/format.ts` finds "the owner" and "the other one" for
    a guest's *side* (`partner_a` / `partner_b`). **A third collaborator would
    be mis-read here** — `find((c) => (c.role === "owner") === wantsOwner)` would
    return whichever non-owner came first. This is a real hazard of Option A.
  - `seating/snapshots-panel.tsx`, `audit/describe.ts`, the tasks CSV export
    (`Owner`/`Partner`) repeat the same two-way fallback.
  - `/api/cron/reminders` emails **every** collaborator the weekly digest. A
    third login would be emailed it.
  - `CollaboratorNamesEditor` on `/settings` edits `display_name` per collaborator.
- **Guest "side" is a separate idea** (whose family a guest belongs to). The
  planner is not a side. This spec does not touch `guests.side`.

## 3. Options

### A. A third full login (the literal reading of the ask)

Add a collaborator with a magic-link account. Smallest conceptually, **wrong for
this request**: it gives the planner everything in §2, and the planner was said
not to be getting access. It also needs an invite flow that doesn't exist, a
third `role` value, a fix to `sideLabel`, and a decision about who gets emailed.
**Not recommended** unless the planner later *should* sign in.

### B. A named person with no login — recommended

A small `people` table: `id`, `wedding_id`, `name`, `sort_order`, `deleted_at`.
No `auth.users` row, no sign-in, no access. A task can be assigned to a
collaborator **or** to a person.

- Schema: `list_items.assigned_person_id uuid` (composite FK to `people` with
  `wedding_id`, per the tenancy rule) beside the existing `assigned_to`, with a
  check that **at most one of the two is set**. `assigned_to` and everything
  reading it stay as they are, which is why this is the small option.
- RLS: collaborators only, `anon` revoked, added to the `tenant_tables` array in
  the same migration; added to the audit-log trigger (or to the exception list in
  `supabase/tests/18_audit_log.sql` — that test fails otherwise, on purpose).
- Settings: a "People who aren't on WedPlan" list next to the names editor — add,
  rename, remove (soft; a removed person's tasks keep their name).
- Assign picker: *You / Partner / <person>…*. Filters and "Assigned to me" are
  unchanged (still `assigned_to = user`).
- The planner sees nothing, is emailed nothing. The couple use the assignment as
  a label: "this one is the planner's", filterable.

### C. A limited-access login

A third collaborator whose RLS reaches only some tables (the lists and the
timeline, say). Real work: `is_collaborator` is one uniform predicate, so this
means a second predicate and per-table policy changes across ~50 tables, a role
enum change, an invite flow, and a second-account RLS test for every table.
**Out of scope for "a third assignee"**; it is its own feature if wanted.

## 4. Recommendation

**Option B.** The ask — a third name in the assign picker for someone without
access — is a label, not a login, and B delivers it without touching the access
model. It leaves C open: if the planner should later *see* the lists, that can be
added by giving a `people` row an optional `user_id` rather than redoing
assignment.

## 5. What B would touch (estimate, for scope only)

| Area | Change |
| --- | --- |
| Migration | `0043`: `people` table + RLS + audit; `list_items.assigned_person_id` + at-most-one check; the views that expose `assigned_to` (`v_timeline_items`, `v_budget_item_tasks`) gain a column (appended, per the view rule). |
| `src/lib/` | A pure `assigneeLabel()` replacing the copies in `item-row.tsx`, the export route and `describe.ts`; unit-tested. |
| Actions | `people.ts` (add / rename / remove) and `assignItem` accepting a person; the duplicate-item path (`lists.ts` ~637) must copy the new column. |
| Queries | people for the picker; the tasks CSV "Assigned to" column. |
| UI | Settings list; assign picker; assignee chip on rows, the timeline and the calendar. |
| Tests | Unit for the label and the one-of-two rule; SQL for RLS with a second account (a person is invisible across weddings) and the check constraint. |

Roughly one migration, ~8 source files, no change to auth, the cron or the guest
surface. Comparable to spec 37 in size.

## 6. Open questions

1. **Option B (a name, no login) or A (a third full login)?** Recommended: B.
2. **Should the planner ever sign in later**, even read-only? If yes, that is
   Option C and a separate spec; B is still the first step.
3. **One extra person, or a list?** Planner today; maybe a florist, a mother of
   the bride tomorrow. Recommended: a list (`people`) — it costs the same.
4. **Should tasks assigned to the planner appear anywhere the planner can read?**
   Without a login there is nowhere. A printable "planner's list" (tasks assigned
   to them, grouped by due date, in the style of the run sheet's print view) would
   give the couple something to send. Recommended: not now.
5. **The weekly digest** goes to the two collaborators only. Should it say how
   many open tasks are with the planner? Recommended: no.
6. **Wording:** the picker currently says *You / Partner*. With names set it says
   their names. Should the person row be labelled "(not on WedPlan)" in the picker?

## 8. Round two — C scoped, and B + C as one "People" list

**Direction given:** a planner who logs in and sees vendors and the budget is
acceptable; they must not be part of the guest side of things; task- and
vendor-based. B is still wanted. Asked: *will C break existing things, and can the
couple grant it from a People section in Settings?*

### 8.1 Will it break anything? Not if it fails closed

Today every tenant policy is `is_collaborator(wedding_id)` — 26 `create policy`
statements, ~50 mentions across 21 migrations, and every new table copies the
pattern. **Adding a `planner` value to `collaborator_role` would make
`is_collaborator()` true for the planner and open every table to them** (guests,
RSVPs, bank details, the registry). That is the version that breaks things, and
the failure is silent.

So the design is the opposite: **the planner is not a row in `collaborators`.**
`is_collaborator()` and all existing policies stay byte-for-byte as they are, so
the two existing logins behave identically. The planner is a separate grant
(`people.user_id` + an access level) with a new `can_plan(wedding_id)` predicate,
and an *extra*, additive policy is added only on the tables the planner is meant
to see. A table nobody remembers to list is invisible to the planner, not open to
them. Consequences, all wanted:

- `sideLabel`, the guest side, `CollaboratorNamesEditor`, the audit page's
  "who" lookup and the weekly digest all read `collaborators` — so none of them
  see a planner and none need changing for that reason.
- The planner is never emailed the digest (see §8.5).
- Revoking access is immediate for data: RLS reads the grant on every query, so
  deleting it cuts reads and writes at once, not at token expiry.

### 8.2 What the planner could see (proposed default; each is a Q)

| Area | Planner |
| --- | --- |
| Tasks: lists, timeline, calendar, board, reminders | yes, read + write |
| Vendors, contacts, notes, contact sheet | yes |
| Budget (lines, payments, totals) | yes |
| Events, run sheet | yes |
| Guests, households, RSVPs, invitations, questions | **no** |
| Public site, registry, gifts, bank details, songs, seating | **no** |
| Settings, activity log, exports | **no** (activity log is a Q) |

"See everything" is also possible: a second level that is just a full partner
without the guest-side label. That *is* a plain third `collaborators` row (Option
A) and needs the `sideLabel`/digest fixes in §2 — so the levels are
**None (B) · Planner · Full**, and Full is the only one that touches
`is_collaborator`.

### 8.3 One People list, B and C together

Keep §3-B's `people` table, with two extra nullable columns: `user_id` (null = no
login) and `access` (`none` | `planner` | `full`). The Settings → People screen
lists the planner, with a button "Give access" that invites them by email.
Assignment is `list_items.assigned_person_id` for everyone in the list, so a
person who gets a login later keeps their tasks — no reassigning. The couple's
own `assigned_to` is unchanged. "Assigned to me" for the planner matches
`people.user_id`.

### 8.4 What it would take (beyond B)

| Area | Change |
| --- | --- |
| Migration | `can_plan()`; additive policies on the planner's tables via one loop (the same shape as `0002`); `people.user_id`/`access`. The planner needs `select` on `weddings` (name, date, timezone — and `total_budget`, which they'd see anyway). |
| **Views** | Views such as `v_wedding_stats` read guest tables; for a planner they return nothing or error. Each view the planner's pages use must be checked (security-invoker or not). **This is the likeliest source of breakage and cannot be confirmed without running it.** |
| Auth | **The app has no sign-up and no invite flow** (email + password; login, forgot and reset only). Giving access means a server action using the service-role admin API (`inviteUserByEmail` or `createUser`), then a set-password link. The admin client exists (the cron uses it); this use is new, and **the invite email depends on Supabase email settings that have never been exercised.** |
| App gating | Nav hides guest/site/registry/settings for a planner; a layout-level guard on those routes. Many queries `throw` on error, so without the guard a planner opening `/guests` by URL gets an error page, not an empty one. The dashboard shows guest and RSVP figures and needs a planner variant. |
| Labels | One `assigneeLabel()` (already in B). |
| Tests | SQL with a planner account: reads tasks/vendors/budget; **reads zero guest rows; cannot write to them**; and a test that lists every public table and fails if one has no planner decision — the same trick as `18_audit_log.sql`'s exception list, so a future table can't be forgotten. Unit tests for the guard. |
| Audit | The planner's edits are logged by `auth.uid()` already; `describe.ts`'s name lookup must also read `people`. |

Rough size: B plus ~15–20 more files and a second migration — **two to three times
B**, most of it the view check, the route guard and the invite action. It does not
require touching any existing policy, which is what makes it safe to do after B
rather than instead of it.

### 8.5 The digest

The weekly digest code exists (`/api/cron/reminders`, spec 2, emailing every row in
`collaborators`); I can't tell from the repo whether it is switched on for the
live project. Either way a planner is not in `collaborators`, so under this design
they are never emailed it. Giving the planner their own digest of *their* tasks
would be a separate, later decision.

### 8.6 Order

1. **B** — `people`, assignment, the picker. Useful alone, and it makes the planner
   assignable today.
2. **C (Planner level)** — the grant, `can_plan()`, policies, guard, invite.
3. **Full** — only if wanted; it is the one level that needs `is_collaborator`
   and the side-label fixes.

### 8.7 New open questions

7. **Read-only or read + write** for the planner on tasks, vendors and budget?
   Recommended: write on tasks and vendor notes; **read-only on the budget**.
8. Is the §8.2 split right? In particular: **budget — yes**; **activity log — no**;
   **events/run sheet — yes**.
9. Do you want a **Full** level at all, or is Planner enough? Recommended: Planner
   only; add Full if you find yourself wanting it.
10. **Email delivery:** are you happy for the invite to depend on Supabase's email
    sending working (never tested here), with a fallback of you copying a one-time
    link to send them yourself? Recommended: build both.
11. Should the couple see **what the planner changed**? The audit log already
    records it; this is only a question of whether the planner's name shows there
    (recommended: yes).

## 7. Not in scope

*(Superseded in part by §8: a planner login is now in scope as Option C.)*
Changing `guests.side`; a general role/permission system beyond None / Planner /
Full; emailing or notifying a person without a login.

**Caveat, as in every spec here:** this has not been built, and the app has never
been opened in a browser or run against the live project.
