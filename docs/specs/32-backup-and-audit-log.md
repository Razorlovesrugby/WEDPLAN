# Feature spec: Backups you can restore from on the free plan, and an audit log of who changed what

**Status: built (2026-10-12) — asked for as a spec; then "Okay let's build and ask
questions" as its own turn.** Four questions were asked and answered (below); the other
five took the recommendation. Branch `claude/spec-32-backup-and-audit-log`, **no PR
opened**. See **Answered** and **Build status** at the end — in particular, nothing here
has run against a real Supabase project or GitHub Actions.

## Answered — 2026-10-12

| Q | Answer | What it changed |
| --- | --- | --- |
| 1 | "Live, all applied" — the live project is level with the repo through `0034`. | `0035` simply stacks on top; the backup workflow can be switched on as soon as the secrets exist. |
| 2 | GitHub Actions artifact. | 30-day retention, private repo. |
| 3 | Not asked; recommendation taken. | Dumps 30 days; audit rows 12 months. |
| 4 | Everything in §4.2. | The full list, `site_blocks` as a diff. |
| 5 | Not asked; recommendation taken. | `updated_at`/`rank`-only updates write nothing. |
| 6 | Read-only first. | No `revertAuditEntry`; §4.4 is not built. |
| 7 | Not asked; recommendation taken. | Any collaborator can read the activity page. |
| 8 | Not asked; recommendation taken. | Public (signed-out) writes are logged. |
| 9 | Not asked; recommendation taken. | GitHub's own failure email is the alert. |

**Depends on:** `0001`/`0002` (tenancy, `is_collaborator()`), `0016` (collaborator
display names), the existing `verify.yml` workflow and `scripts/verify-migrations.sh`.
**Migration if built:** `0035_audit_log.sql`. `0026`–`0034` are still not applied to
the live project (`docs/HANDOFF.md`), so Q1 comes first.

## 1. What was asked

*"How do I create a DB backup"* → *"I don't have Pro Supabase, so I need a way to
restore, maybe an audit log of everything as well and the user will be great"* →
*"write a spec for both to be built."*

Two features, one document, because the second leans on the first:

- **A. Backups** — a scheduled, off-site, restorable copy of the data, on the free
  plan (which has no downloadable backups and no point-in-time recovery).
- **B. An audit log** — an append-only record of every change to planner-authored
  data, with **who** made it, so a bad edit can be understood and reversed.

## 2. What exists today (read off the repo)

- No backup tooling, no backup docs, no audit or activity table, no
  `created_by`/`updated_by` columns. (`grep` over `supabase/` and `docs/`: the only hit
  for "audit" is one comment in `0014`.)
- Guest data is soft-delete only (`deleted_at`); most other tables hard-delete.
- Writes go through two clients: the **signed-in session** (RLS applies; `auth.uid()`
  is the planner) and **`service_role`** for the few public paths (RSVP, reply,
  save-the-date reply, guestbook, songs, gallery, travel, views; see
  `0002_row_level_security.sql` header). Under `service_role`, `auth.uid()` is null.
- 59 tables, `wedding_id` on all of them (the product rule), a `verify.yml` that
  already builds a throwaway Postgres cluster and runs 508 SQL assertions.
- Images (moodboards, site, gallery) live in Supabase Storage buckets — **not** in a
  Postgres dump.

## 3. Part A — Backups

### 3.1 What free-tier Supabase does and doesn't give you

No downloadable backups, no PITR. Daily backups and restore-from-dashboard are Pro.
So the only safe copy is one **we make and keep somewhere else**. The audit log (Part
B) lives in the same database, so it is **not** a backup — if the project is lost, so
is the log. It *is* included in every dump.

### 3.2 Proposal

1. **`.github/workflows/backup.yml`** — a daily cron (plus manual `workflow_dispatch`)
   that runs `pg_dump` and stores the result.
   - **`pg_dump -Fc`** of `public` (schema + data) plus **`auth.users` and
     `auth.identities` data-only**, so restored accounts can still log in. Everything
     else Supabase-managed is excluded.
   - **Connection: the pooler (session-mode) string, not the direct one.** Free
     projects' direct host is IPv6-only and GitHub runners are IPv4. This is the most
     likely first failure; the workflow must say so in a comment.
   - **Client version must match the server's major version** — install the matching
     `postgresql-client-NN` from PGDG; the runner's default may be older and `pg_dump`
     refuses to dump a newer server.
   - Secrets: `SUPABASE_DB_URL`, `BACKUP_AGE_PUBLIC_KEY` (repository secrets).
2. **Encrypted before it leaves the runner.** The dump contains guest names,
   addresses, dietary and accessibility notes, bank details. Encrypt with
   [`age`](https://age-encryption.org) to a public key; the **private key lives only
   with the planner** (password manager), never in the repo or in Actions.
3. **Where it goes** — Q2. Recommendation: **GitHub Actions artifact, 30-day
   retention**, private repo. It is a different provider from Supabase (so genuinely
   off-site), costs nothing, needs no extra account. Weakness: artifacts count against
   the repo's storage quota and expire.
4. **Storage objects** — `scripts/backup-storage.mjs`: lists every bucket, downloads
   new/changed objects (by `updated_at`) into a tarball, encrypted the same way, same
   destination. Free tier is 1 GB of storage, so this is bounded.
5. **Failure is loud.** A failed run emails the repo owner through GitHub's default
   Actions notification; additionally the workflow's last step fails if the dump is
   under a sanity floor (e.g. < 10 KB) or `pg_restore --list` can't read it.
6. **Side effect worth having:** a daily connection also keeps a free project from
   being auto-paused for inactivity. (Supabase pauses idle free projects after about a
   week; I have not confirmed that a dump counts as activity, so don't rely on it.)

**Recovery point is the dump interval** — worst case you lose up to a day. That's the
honest ceiling on the free plan; §4 narrows it for *individual* changes.

### 3.3 Restore — the part that matters

A backup that has never been restored is a hope. Deliverables:

- **`docs/RESTORE.md`** — a runbook: create a new (or reset the) Supabase project,
  apply migrations in order (`supabase db push` / SQL editor), decrypt, `pg_restore
  --data-only --disable-triggers` for `public` and `auth.*`, re-run
  `scripts/ensure-bucket.mjs`, upload storage objects, re-point env vars on Vercel,
  check row counts. Includes **what is lost** (everything since the last dump, active
  sessions) and **what must be redone** (OAuth redirect URLs, Pinterest tokens).
- **`scripts/verify-restore.sh`**, run by `verify.yml`: build a cluster, apply every
  migration, load the SQL fixtures, `pg_dump` it with the *same flags as the workflow*,
  `pg_restore` into a second empty cluster that has migrations applied, and compare
  per-table row counts. This catches "a new table/column broke the dump" the moment a
  migration lands, rather than the night you need it.

**What this does not prove:** it restores into plain Postgres. Supabase-specific
behaviour (the `auth` schema's managed constraints, extensions, role grants) is only
exercised the first time anyone does it for real. The runbook must be walked once
against a throwaway Supabase project before this is called done, and the build status
must say whether that happened.

## 4. Part B — The audit log

### 4.1 The shape

One append-only table, written only by a trigger:

```
audit_log (
  id          bigint generated always as identity primary key,
  wedding_id  uuid        not null,
  at          timestamptz not null default now(),
  actor_id    uuid,                 -- auth.uid(); null for public/system writes
  actor_kind  text        not null, -- 'planner' | 'guest_link' | 'system'
  table_name  text        not null,
  row_id      uuid        not null,
  action      text        not null, -- 'insert' | 'update' | 'delete'
  changed     jsonb       not null  -- insert/delete: whole row; update: {col: [old, new]}
)
index (wedding_id, at desc); index (wedding_id, table_name, row_id, at desc)
```

- **A generic `SECURITY DEFINER` trigger function** (`search_path = ''`) attached
  `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` to each audited table. It reads
  `wedding_id` out of `to_jsonb(NEW/OLD)` (every table has one; `weddings` uses `id`).
  Because it's in the database, it catches **every** write path — server actions,
  `service_role` public routes, SQL-editor fixes, future code that forgets to log.
  This is the reason to prefer a trigger over logging in each server action.
- **Actor.** `auth.uid()` for a planner. For `service_role` writes it is null, so the
  row is `actor_kind = 'guest_link'` (the table itself says what was touched, and
  `household_id` is in `changed`) or `'system'` for cron. Display name comes from
  `collaborators.display_name` (`0016`) at read time, so a rename updates history.
- **Updates store a diff**, not two whole rows — site and list rows carry large JSON
  and the free database is 500 MB. Inserts and deletes store the whole row (a delete's
  row is what lets you bring it back).
- **No-op noise is dropped:** an update where only `updated_at` and/or `rank` changed
  writes nothing (drag-reordering a 200-guest list would otherwise write 200 rows).
  Q5.
- **Immutable:** `authenticated` gets `SELECT` only; a `BEFORE UPDATE OR DELETE`
  trigger raises, so even a planner session can't rewrite history. `service_role` can
  still bypass it — noted, not defended against.
- **RLS:** `SELECT` for `is_collaborator(wedding_id)`; no insert/update/delete policy
  (tables with no policy are reachable only by `service_role`, per the `0002`
  convention). Second-account test required (product rule).

### 4.2 What is audited

| Audited (planner-authored) | Not audited (and why) |
| --- | --- |
| `weddings`, `collaborators`, `events`, `households`, `guests`, `tags`, `guest_tags`, `guest_notes`, `guest_event_overrides`, `cut_lines`, `invitations`, `invitation_events`, `rsvps`, `rsvp_questions`, `rsvp_answers` | `site_visits`, `invitation_views`, `rsvp_token_attempts` — high-volume tracking, not data anyone edits |
| `lists`, `list_sections`, `list_items`, `run_sheet_items`, `saved_views` | `message_log` — already a log |
| `budget_categories`, `budget_items`, `consumption_components`, `payments`, `budget_item_*` | `site_revisions` — already a history |
| `moodboards`, `moodboard_items`, `vendors`, `vendor_*`, `gift_funds`, `accommodations`, `transport_options`, `coach_*`, `dress_codes`, `dress_code_notes`, `arrival_points`, `song_requests`, `site_content`, `site_blocks` (diff only, Q4) | `moodboard_clip_tokens`, `pinterest_accounts` — secrets; never copied anywhere |

**Redacted columns** — a short list in the migration whose values are replaced with
`"[redacted]"` in `changed` (the fact of the change is still logged):
`gift_bank_details.*` account fields, anything holding a token hash or access token.
Without this, the audit log would be a second, more-readable copy of the bank details.

### 4.3 Reading it — `/settings/activity`

A page for collaborators: newest first, filter by person, area (guests, budget,
lists…), and date; a one-line sentence per row ("Sam changed *Smith household* —
RSVP deadline 1 Nov → 8 Nov"). Needs a small `src/lib/audit/describe.ts` — pure,
unit-tested, one label map per table — and `src/server/queries/audit.ts` (wrapped in
`cache()`, paged). Read-only in step 1.

### 4.4 Undo — optional, step 2 (Q6)

The audit log makes row-level recovery possible without a backup restore:

- **Un-delete / revert** is a server action `revertAuditEntry(id)` returning
  `ActionResult`: for a delete, re-insert `changed` with `jsonb_populate_record`; for
  an update, set the old values back; for an insert, no revert (soft-delete/archive
  instead). It writes its own audit row, refuses if the row has changed since (shows
  the conflict), and only operates inside the caller's wedding.
- Never offered for guests as a hard path — guests are already soft-delete, so "undo"
  there is clearing `deleted_at`, which the existing UI does.
- Not a general time machine: cascades (deleting a household deletes its children)
  produce many entries and must be reverted together. If that proves fiddly it's out of
  scope for v1 and the audit log is read-only.

### 4.5 Retention and size

Free database = 500 MB. A wedding has thousands of rows, not millions; a CSV import of
300 guests is 300 audit rows. Default **keep 12 months**, pruned by a scheduled route
(the app already has scheduled routes — reminder digest, chase cron) that deletes rows
older than the window via `service_role`. Q3.

## 5. Build order (each step committed separately)

1. `0035_audit_log.sql` — table, trigger function, attach to the Q4 list, RLS, grants,
   redactions. `supabase/tests/18_audit_log.sql`: insert/update/delete each write the
   right row; `updated_at`/`rank`-only update writes none; `service_role` write is
   `guest_link`; redacted column never appears; a second account can't read; an
   authenticated session can't update/delete a row.
2. `src/lib/audit/describe.ts` + tests; `queries/audit.ts`; `/settings/activity`.
3. `backup.yml`, `scripts/backup-storage.mjs`, `docs/RESTORE.md`.
4. `scripts/verify-restore.sh` wired into `verify.yml`.
5. (Q6) `revertAuditEntry`.
6. Retention route.

Steps 1–2 and 3–4 are independent; Part A can ship first, since it needs no
migration and is the one that protects you.

## 6. Verification, honestly

`npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (non-root user),
`verify-restore.sh`, `npm run build`. **None of this runs against a live Supabase
project or a browser**, and the workflow can only be proven by running it in GitHub —
the build status must say which of those happened. The pooler/IPv4 and client-version
points in §3.2 are the ones most likely to need a second attempt.

## 7. Risks

- **Trigger cost on bulk writes** (import, reorder, "cut line" moves): row-level
  triggers add one insert per row. Fine at this scale; the no-op filter handles the
  worst offender. Measure on the 300-guest import fixture.
- **Audit table growth** if a high-churn column (e.g. a counter) is on an audited table
  — the migration should list columns to ignore per table, not just `updated_at`/`rank`.
- **The age private key is the whole backup.** Lose it and the backups are noise.
  `docs/RESTORE.md` says where it must be kept.
- **Applying `0035` stacks on the unapplied `0026`–`0034`.** It touches no existing
  table's data, but the live project must be brought level first (Q1).

## 8. What is deliberately not in scope

Point-in-time recovery, multi-region replicas, restoring *into* a live running wedding
(the runbook restores into a fresh project), real-time activity notifications, per-guest
"who looked at my page" (that is `invitation_views`, spec 22), and an audit of reads.

## 9. Open questions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Is there a live Supabase project with real guest data yet, and are `0026`–`0034` applied to it? | Apply them first; the dump workflow needs a real project to point at, and a backup before real data exists proves little. |
| 2 | Where do encrypted dumps go: GitHub Actions artifact (30 days), a free object store (Backblaze B2 / Cloudflare R2 — 10 GB free, no expiry), or a Google Drive folder? | Actions artifact to start; move to B2/R2 if you want older-than-30-days history. |
| 3 | How long to keep (a) dumps and (b) audit rows? | (a) 30 days daily; (b) 12 months. |
| 4 | Audit *everything* in §4.2, or start with guests, RSVPs, budget and lists? Include `site_blocks` (large; diff only)? | The full §4.2 list; `site_blocks` included as a diff, since `site_revisions` already keeps whole copies. |
| 5 | Skip audit rows for `rank`-only and `updated_at`-only updates? | Yes. |
| 6 | Build "Undo this change" (§4.4) now, or ship the log read-only first? | Read-only first; add undo once you've used the log for a while. |
| 7 | Who can read the activity page — any collaborator, or only the wedding's owner? | Any collaborator (they are your partner and family helping out), with nothing redacted but the §4.2 list. |
| 8 | Should guests' own actions (RSVP, song request) appear in the log? | Yes, as "Guest (via link)" — it answers "did they really change that?". |
| 9 | Email the planner when a backup run fails, beyond GitHub's own notification? | GitHub's default is enough; revisit if it's ever missed. |

## Build status (2026-10-12)

**Verified:** `npm run typecheck` clean; `npm test` 1006 passing (984 before, 22 new:
the describe/filter logic, a drift guard that reads `0035` and fails when an audited
table has no filter area or noun, and the storage backup/restore scripts against a
fake client); `./scripts/verify-migrations.sh` 541 assertions (508 before, 33 new in
`supabase/tests/18_audit_log.sql`); `./scripts/verify-restore.sh` passes (new);
`npm run build` — see HANDOFF for the result. The two checks that guard the risky
parts were each shown to **fail** when the thing they guard is removed (the redaction,
and the privilege reset in `restore-db.sh`).

**Not verified, and the things most likely to need a second attempt:**
- **`backup.yml` has never run.** Nothing in this sandbox can execute a GitHub
  workflow, so the YAML is parsed and its shell logic is the same scripts CI already
  exercises, but the PGDG client install, the pooler connection string, the `age`
  step and the artifact upload are untested.
- **The restore has been proven against plain PostgreSQL only.** Supabase's `postgres`
  role may not be allowed to write `auth.users` (docs/RESTORE.md names the fallback).
  The rehearsal in that file is the first real test.
- **`/settings/activity` was never opened in a browser**, and the trigger has never
  fired against a live Supabase project. `0035` must be applied to the live project
  **before** the first backup run: the workflow's sanity check looks for `audit_log` in
  the dump and fails the run if it isn't there.

**Where the build departs from the text above:**

1. **`row_key jsonb`, not `row_id uuid`.** Nine audited tables have composite or
   non-`id` primary keys (`guest_tags`, `invitation_events`, `budget_item_*`,
   `guest_event_overrides`, `gift_bank_details`), so a single uuid column couldn't hold
   them. The key columns are passed to the trigger as an argument.
2. **`actor_kind` is `'planner'` or `'public'`, not `'guest_link'`/`'system'`.** A guest
   on their link and the cron are both `service_role` with no `auth.uid()`, so the
   database can't tell them apart. The page says "A guest (via their link)" for the
   tables a guest writes to and "An automatic update" for the rest. A check constraint
   ties `actor_id` to `actor_kind = 'planner'`.
3. **A `label` column** (not in §4.1): the row's name at the time ("Okonkwo",
   "Ceremony"), set per table by a trigger argument, so the log reads as sentences
   without joining 50 tables and still names a row after it's deleted.
4. **`sort_order` counts as ordering churn, with `rank` and `updated_at`.** Q5 named
   `rank` only; reordering a list or moodboard re-numbers neighbours the same way.
   `cut_lines.position` deliberately does **not** — moving a cut line is a decision.
5. **No foreign key from `audit_log.wedding_id` to `weddings`.** The log is immutable;
   an `ON DELETE CASCADE` would make deleting a wedding fail on the guard. Retention is
   what removes old rows. (Side effect: a deleted wedding's log lingers up to a year.)
6. **Retention is `prune_audit_log()` plus `/api/cron/audit-prune`** (weekly, Sunday
   03:30 UTC, in `vercel.json`), gated by `CRON_SECRET` like the reminders cron. The
   function refuses a window under 30 days and is the only thing that can delete a row
   (a transaction-local flag the guard trigger honours). Vercel's free plan allows two
   cron jobs; this is the second.
7. **Redacted updates show no old/new pair.** For a redacted column the log stores the
   bare string `[redacted]`, so the page says a bank-details row "changed" with no
   detail. That is the point.
8. **Backups: images weekly, not nightly, and capped at 200 MB** (`STORAGE_BACKUP_MAX_MB`).
   Free GitHub accounts have 500 MB of artifact storage in total; a nightly copy of up
   to 1 GB of images would blow it. The step refuses loudly above the cap rather than
   silently filling the quota.
9. **Two scripts the spec didn't list:** `scripts/restore-db.sh` and
   `scripts/restore-storage.mjs`, so the runbook is a command and not a recipe — and the
   restore CI check runs the *same* restore script a person would.
10. **Privileges are kept in the dump, and the restore switches the project's default
    privileges off while it runs.** Found by the restore check: dumping with
    `--no-privileges` (the spec's first instinct) would have restored an app that
    couldn't read its own tables, and restoring with them kept would have given `anon`
    back every grant the migrations revoke, because Supabase's default privileges hand
    new tables to `anon`. `restore-db.sh` resets and restores those defaults around the
    restore. `pg_restore --clean` would also have tried to drop the `public` schema
    itself, so that entry is filtered out with a list file.
11. **`auth.users` is restored before `public`**, because `collaborators.user_id`
    references it and the foreign key wouldn't validate against an empty table.
12. **The workflow refuses to run in a public repository** (not in the spec) and fails
    if the dump is under 10 KB or lacks `guests`/`audit_log` data entries.
13. **Not built, as answered:** `revertAuditEntry` (Q6). Q9's alert is GitHub's own.

**Pick up here:** apply `0035` to the live project; make the repo private if it isn't;
do "Setting it up" and the "Rehearsal" in `docs/RESTORE.md`; open `/settings/activity`
after changing a guest and a budget line, and once as a guest from a link.
