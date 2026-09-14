# Handoff

**Living document.** Rewritten at the end of every work chunk. A new session
needs this file and `docs/wedding-platform-spec.md`, and nothing else.

Last updated: session 3. V1 is now complete against the amended spec — the
four gaps session 1 left open are built. Still never exercised against the
live database: see **Live project** below and section 2 before trusting
anything.

Branch: `claude/hand-off-reading-60efdu`, from `main`. Session 1's branch was
merged in PR #1.

---

## 0. Live project

| | |
| --- | --- |
| **Project ref** | `lsgbwxisqqazahgkibmj` |
| **URL** | `https://lsgbwxisqqazahgkibmj.supabase.co` |
| **Migrations** | `0001`, `0002`, `0003` reported applied |
| **Bootstrap** | assumed run — unconfirmed |

**Recorded on the planner's word, not verified by the session that wrote this
line.** The Supabase connector in that session was scoped to a different
organisation and got `You do not have permission to perform this action` for
this ref, so no check query has ever been run against it. Before relying on
it, run the three checks in `supabase/migrations/README.md` — 16 tables, zero
rows without RLS, 3 views — and replace this block with what they actually
returned.

> **`arm15lite_PROD` (`dgpplqzsukifcvddoxcd`) is not this project.** It is an
> unrelated production database for a rugby club app — 29 tables, thousands of
> live rows, 62 migrations of its own. It shares the account and, depending on
> connector scope, may be the *only* project a session can see, which makes it
> exactly the wrong thing to reach for when the wedding project looks absent.
> Never apply these migrations to it. If `list_projects` does not return
> `lsgbwxisqqazahgkibmj`, the connector is scoped to the wrong organisation —
> that is a permissions problem to fix, not an empty account.

---

## 1. What was built

V1 of `docs/wedding-platform-spec.md`: guest list and RSVP. Nine chunks, eleven
commits, ~8,200 lines.

### Database — `supabase/migrations/`

Three numbered migrations, applied in order, plus `bootstrap.sql` to create the
first wedding. Full instructions in `supabase/migrations/README.md`.

| # | File | What it creates |
| --- | --- | --- |
| 1 | `0001_core_schema.sql` | 16 tables, enums, indexes, constraints |
| 2 | `0002_row_level_security.sql` | `is_collaborator()`, policies, grants |
| 3 | `0003_derived_views.sql` | `v_households`, `v_household_rsvp`, `v_wedding_stats` |
| — | `bootstrap.sql` | Your wedding, both collaborators, starting events and questions |

Tenancy is enforced by composite foreign keys on `(parent_id, wedding_id)`, not
by triggers or by application code. `tier` is derived in a view, never stored.
`households.rank` is a fractional index pinned to `COLLATE "C"`.

### Application — `src/`

| Route | What it does |
| --- | --- |
| `/login`, `/auth/callback` | Magic link, sign-up disabled |
| `/` | Dashboard; every number links to the list behind it |
| `/guests` | Table, URL-backed filters, inline edit, bulk tagging, CSV export |
| `/guests/import` | **New in 3.** CSV import: mapping, dedupe, per-row review |
| `/guests/[id]`, `/households/[id]`, `/households/new` | Detail and editing |
| `/guests/rank` | Drag ranking, virtualised, two cut lines, waitlist suggestions |
| `/events` | Event CRUD in the venue's timezone |
| `/questions` | **New in 3.** RSVP question builder — type, scope, options, order |
| `/invitations` | Create, send, copy link, WhatsApp text, mute, reissue |
| `/invitations/print` | **New in 3.** QR sheet for stationery, in ranking order |
| `/rsvp/[token]` | Public RSVP — no login, throttled, per guest per event |
| `/w` | Public site, thin and noindex |
| `/setup` | Explains the bootstrap step when no wedding is attached |
| `/api/cron/reminders` | Weekly chase of non-responders only |
| `/api/export/[kind]` | Guest, household and catering CSV |
| `/api/qr/[invitationId]` | **New in 3.** One QR code, PNG or `?format=svg` |

### Checks

```bash
npm run typecheck                 # clean
npm test                          # 119 unit tests
./scripts/verify-migrations.sh    # 52 SQL assertions, throwaway PG cluster
./scripts/verify-bootstrap.sh     # bootstrap on a clean database
npm run build                     # clean, 20 routes
```

All five were run at the end of session 3 and all five passed.

`npm run build` needs the three `NEXT_PUBLIC_*` variables set or it fails at
"Collecting page data" — the env validation is deliberate. Placeholders are
enough, and `.github/workflows/verify.yml` has the ones CI uses.

Both SQL scripts build their own PostgreSQL cluster — no Docker, no network, no
Supabase CLI. **Neither may run as root** (`initdb` refuses), but that is not a
reason to skip them: in a container running as root, `su postgres -c "cd $PWD
&& ./scripts/verify-migrations.sh"` works, because the PostgreSQL package
creates that user. CI runs all five.

---

## 2. What has NOT been verified

Read this before trusting the green checks above.

- **The migrations are reported applied, but nothing has been verified
  there.** See section 0. Every green check in section 1 still comes from
  throwaway local clusters running through a shim that fakes `auth.users`,
  `auth.uid()` and the three roles. A shim is not Supabase Auth: it is exactly
  where a policy that depends on real `auth.uid()` behaviour would pass
  locally and fail live. Treat the live schema as unexercised until someone
  signs in and loads a page.
- **No UI has been opened in a browser.** It type-checks and builds; nobody has
  clicked it. Expect the first hour of real use to find layout and empty-state
  problems. This applies double to everything session 3 added: the import
  wizard, the question builder and the print sheet have unit tests under the
  logic but not one rendered pixel behind them.
- **Nothing has been printed.** `/invitations/print` is laid out for A4 with
  `@media print` rules that no printer has seen. Print one page before
  committing a stationery run to it.
- **No email has been sent.** Without `RESEND_API_KEY` the sender logs instead,
  by design. The templates have never met a real inbox or a spam filter.
- **The magic-link flow has never completed**, because that needs a live
  Supabase Auth instance.

---

## 3. Where this veered off the spec

Grouped by kind. None of these are accidents, but you should know about all of
them before you assume the spec describes what exists.

### 3a. Decisions taken that the spec left open

| Decision | What was chosen | Why |
| --- | --- | --- |
| **Two cut lines, not one** | `weddings.cut_rank` (A/B) and `tier_b_rank` (B/C) | The spec asks for tiers A, B and C derived from "a stored cut line", singular. One line cannot produce three tiers. The second line is nullable, and null means one undivided waitlist. |
| **What counts as a seat** | Adults and children occupy seats; infants do not | Undefined in the spec, and both the venue and the caterer need a number. All four counts are exposed separately so neither has to be guessed at. |
| **Reminder cadence** | Never within 10 days; weekly cron, Tuesday 10:00 UTC | Not specified. Both are single constants, easy to change. |
| **Rank collation** | `COLLATE "C"` on rank columns | Postgres and JavaScript both compare ranks; unpinned they disagree on case. Not in the spec because the spec did not anticipate it. |
| **Deleting an event** | Cascades to its RSVPs, with a confirmation | The alternative is orphaned answers to an event that is not happening. |

### 3b. Deviations from the amended spec, including one reversal

- **Tokens are stored encrypted as well as hashed.** The amended spec said
  store only `token_hash`. That turned out to be a dead end for the product:
  the planner needs the link back, to paste into WhatsApp months later and to
  reprint a QR code without invalidating an invitation already in the post. So
  `invitations` carries `token_hash` (lookup) *and* `token_encrypted` (recovery,
  AES-256-GCM under a key derived from the same environment pepper). The
  security property is unchanged — the key is never in the database — but this
  is a real reversal of a decision made two days ago, and it is the deviation
  most worth your scrutiny.

- **The plus-one mechanism differs.** The spec says the plus-one flow "creates a
  real guest record from the supplied name, not a placeholder". What is built
  renames an existing record already flagged `is_plus_one`, rather than
  inserting a new row. The outcome matches the intent — a real, named guest
  record, not a placeholder — but the planner has to allocate the plus-one slot
  first. Creating rows from the public endpoint was the less safe option.

- **Bulk invite moved.** The spec puts "bulk tag and bulk invite" on `/guests`.
  Bulk tagging is there; bulk invitation creation is on `/invitations`, because
  it needs the event checkboxes to be meaningful.

### 3c. Spec items in V1 that are NOT built

Four of the seven were closed in session 3. What is left:

| Missing | Spec says | State |
| --- | --- | --- |
| **Saved views** | "Saved views" on `/guests` | Table, RLS policy and a per-collaborator privacy test exist. No UI. |
| **Inline edit** | "Inline edit" on the guest table | Built for email and dietary only — the two fields touched most while chasing. Everything else is on the detail page. |
| **Site content editing** | Structured blocks | Rendered, but editable only in SQL. |
| **An answers view** | — | Not a spec item, but noticed while building the builder: custom answers are written and never read back anywhere in the planner. A question you can ask and cannot read is half a feature. |

### 3d. Added beyond the spec

- **Transactional email and a cron in V1.** The original BRD said "no email
  integration" while also requiring invitations to be sent and non-responders
  chased. The amended spec resolved this; noting it here because it is the
  largest single addition.
- **`/setup`**, explaining the bootstrap step rather than leaving a dead
  redirect.
- **Two verification scripts and CI**, neither of which the spec asked for.
- **Session 3's dedupe runs in JavaScript, not in `pg_trgm`.** The spec asks
  for fuzzy name matching and the schema has the index for it; the matching
  happens in memory instead. See section 5.7 for why, and for when to change
  it back.

---

## 4. What the next few sessions should be

The order below is no longer the order things happened. Session 3 built the
V1 gaps ahead of session 2's live run, because the database work needs the
planner and the code did not. That was the right trade, but it means **the
outstanding item is the oldest one, and it is the one everything else waits
on**: nothing in this app has met a real database.

### Session 2 — Get it running for real (STILL OUTSTANDING)

1. ~~Create the Supabase project.~~ Done — `lsgbwxisqqazahgkibmj`.
2. ~~Apply `0001`, `0002`, `0003` in the SQL editor.~~ Reported done; the
   checks in `supabase/migrations/README.md` have not been read back.
3. Invite both users under Authentication → Users, then run `bootstrap.sql`.
   Status unconfirmed. The app shows nothing without a wedding row and a
   collaborator row, so if `/` renders empty or loops, check this first.
4. Set `NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY` and `INVITE_TOKEN_PEPPER`
   (`openssl rand -hex 32`), and deploy to Vercel.
5. Walk the spec's own "done when" end to end: add a household, rank it above
   the cut, send an invitation to your own second address, reply as a guest with
   dietary requirements, watch it land on the dashboard, export the caterer's
   CSV.
6. Fix whatever that finds. Expect empty states and mobile layout.

**Also start the sending domain now** — SPF, DKIM, DMARC and warming. Days of
lead time, sitting directly in front of the one immovable deadline. It is the
likeliest thing to make V1 technically complete but practically broken.

### Session 3 — Close the V1 gaps (DONE)

1. ~~**CSV import**~~ — `/guests/import`. Parser, mapping, dedupe, per-row
   review, bulk insert through `rankSequence`.
2. ~~**QR codes**~~ — `/api/qr/[invitationId]` and the `/invitations/print`
   sheet.
3. ~~**Question builder**~~ — `/questions`, with deactivate-instead-of-delete
   once a question has answers.
4. ~~**Rich question types**~~ — `single_select` and `multi_select` render as
   radios and checkboxes, and answers are validated against the option set
   server-side.

### Session 4 — First real use, then whatever it exposes

Do session 2 first; this is what follows it. The import screen is the one to
exercise hardest, with a real export from wherever the names actually live —
it is new, it writes in bulk, and its dedupe has only ever seen test data.

Then: saved views, inline edit on more fields, an answers view (section 3c),
realtime so two people editing see each other.

### Session 5 onward — V2

`docs/wedding-platform-spec.md` has the full plan. Before starting, decide the
Gmail question: Testing-mode OAuth issues refresh tokens that expire every
seven days, and the three ways to live with that are written up in the spec.
That decision changes the `email_*` tables, so make it before the V2 migration.

---

## 5. The nine things worth knowing before changing anything

**1. Tenancy is a foreign key, not a convention.** Every tenant table carries
`wedding_id`, every parent carries a redundant `unique (id, wedding_id)`, and
children reference `(parent_id, wedding_id)`. Attaching a guest in one wedding
to a household in another is a foreign key violation — even for the service
role, which bypasses RLS entirely. Add a table, add it to the `tenant_tables`
array in a new migration; that array is the whole cost of securing it.

**2. `households.rank` is `COLLATE "C"`, and that is load-bearing.** Ranks are
compared in Postgres and in JavaScript. JavaScript compares UTF-16 code units,
so `'B' < 'a'`; a Supabase project defaults to `en_US.UTF-8`, where the opposite
holds. Unpinned, the cut line would silently disagree with the dragged order.
There is an assertion guarding it.

**3. Ranks never end in `'0'`.** Nothing can sort between `"x"` and `"x0"`, so a
key ending in the minimum digit is a dead end. `src/lib/rank.ts` enforces it and
the tests hammer it. If you seed by hand, respect it.

**4. `tier` is not a column.** It is derived in `v_households` from rank against
the two cut lines. Moving a line re-tiers the whole waitlist with no write. Do
not add a `tier` column, however tempting. `src/lib/tier.ts` duplicates the
logic for optimistic drags only, and is tested against the same cases the SQL
suite asserts.

**5. Empty `Relationships` arrays break embedded selects silently.** PostgREST's
type parser resolves `guests(*, households(name))` through the `Relationships`
array in `src/lib/types/database.ts`. Leave it empty and the embed resolves to
`never` — which compiles fine and loses all type safety. Add an embed, add its
relationship.

**6. The service role client is a loaded gun.** `src/lib/supabase/admin.ts`
bypasses RLS. Two legitimate callers: the public RSVP path (scoped by resolving
a token to one household) and the cron sender. Everything a signed-in
collaborator does goes through `src/lib/supabase/server.ts`.

**7. Import dedupe runs in JavaScript, and that is a decision, not an
oversight.** `0001` enables `pg_trgm` and builds `guests_name_trgm_idx` for
exactly this. `src/lib/import/trigram.ts` reimplements pg_trgm's algorithm in
memory instead, because reaching the index means a similarity RPC, an RPC
means a `0004`, and the migrations are frozen — an import that cannot run
until somebody pastes SQL into a dashboard is an import nobody uses. The
comparison is a few hundred names against a few hundred, behind a preview
screen. **If the guest list ever runs to thousands, or a second wedding
shares the database, move it to the index** — the index is already there, and
the threshold constants are in that file.

**8. The import never merges, only skips.** A duplicate is reported with what
it matched and defaults to skip; the user flips it. Both mistakes are bad —
a wrongly skipped guest gets no invitation, a wrongly created one gets two
place cards — but only one is visible at the moment it happens. A skipped row
is on screen with its reason; a duplicate created is discovered at the
stationer's. Do not add an auto-merge.

**9. Deleting an RSVP question destroys its answers.** `rsvp_answers`
cascades on the question's foreign key. `removeQuestion` therefore counts
answers first and deactivates rather than deletes when there are any — the
answers are the reason the question existed. Anything that offers to tidy up
questions must keep that check.

---

## 6. Traps that have already cost time

**Supabase package version drift.** `@supabase/ssr` 0.5.2 passed
`SupabaseClient`'s generics in the order supabase-js used at 2.43; by 2.116 that
order had changed, so every table in the app resolved to `never`. Nothing
failed — `never` is assignable to anything, so queries type-checked and casts
looked reasonable. `src/lib/types/guard.ts` now breaks the build if it happens
again. **Do not "simplify" that file away.**

The same class of bug appeared three times: the generic mismatch above,
`interface` row types (no implicit index signature, so they fail supabase-js's
`Record<string, unknown>` constraint — use type aliases), and empty
`Relationships`. All three failed silently. **When a Supabase query's types look
suspiciously permissive, check for `never` before trusting it.**

**A prefix rule that matched the wrong thing, silently.** The CSV importer
read the Side column with `/^(a|bride|...)/`, so "Aunt Margaret's lot" started
with `a` and became the bride's side — a third of a seating plan mislabelled
with no error anywhere. A unit test caught it before it ran on real data.
Every value parser in `src/lib/import/columns.ts` now matches exactly, the
same rule the header synonyms already followed. **When parsing what a human
typed into a spreadsheet, exact beats clever: the wrong guess looks right.**

**A test harness that cannot fail.** `verify-migrations.sh` briefly contained
`grep -E 'FAIL|ERROR' <<<"$out" && exit 1`, which returns non-zero whenever grep
finds nothing — the normal case. Under `set -e` that aborted the run after the
first test file while reporting success. If you touch either verify script, make
it fail on purpose once and check that it says so.

---

## 7. Deliberate exceptions, so nobody "fixes" them

- **`rsvp_token_attempts` has no `wedding_id`.** A failed token lookup has no
  wedding to attribute itself to — that is the point of a throttle. No RLS
  policy; service role only.
- **The throttle fails open.** If the database errors while counting attempts,
  the request proceeds. A hiccup must not lock a guest out of replying, and a
  32-byte token is what is really doing the work.
- **`weddings` has no insert policy.** A collaborator inserting a wedding row
  would immediately lose access to it. Hence `bootstrap.sql` and `/setup`.
- **A malformed token and an unknown one produce the same page**, and invalid
  ids in an RSVP submission are dropped silently rather than rejected.
  Distinguishing them would confirm what exists.
- **`supabase/tests/fixtures/supabase_shim.sql` is a test fixture.** It fakes
  the Supabase-provided objects so migrations can be verified locally. Never
  paste it into a real project.
- **`supabase/seed.sql` creates two weddings.** The second exists so the
  tenancy tests have something they must not be able to see. Development only.
- **QR codes are served `no-store` and inlined as data URIs on the print
  sheet.** The image encodes the RSVP link, which is the household's only
  credential. A cached code outlives the invitation it belongs to — reissue
  one and a cached image still opens the old link. Do not add caching to
  `/api/qr`, and do not "optimise" the print sheet into `<img src="/api/qr/…">`:
  90 cards would become 90 requests, and the browser prints whatever arrived
  before the dialog opened.
- **The import re-parses the file on commit.** The browser sends the file text
  and the list of lines to skip — never the parsed guest rows. The server
  rebuilds the plan itself, so a tampered payload can skip rows but cannot
  invent a guest or reach another wedding.
- **A half-built choice question falls back to a text box.** A `single_select`
  with no options renders as text on the RSVP form rather than as nothing —
  but `coerceAnswer` still drops the answer, because an option not on the
  question is not a valid answer to it. That asymmetry is deliberate: the
  guest is not shown a dead control, and the caterer is not shown free text
  where a choice was meant.

---

## 8. Conventions

- **Migrations are append-only. That rule is now live.** They were edited in
  place during the build because nothing had ever run them for real. `0001`
  has now been applied to a real project, so `0001`–`0003` are frozen: editing
  one changes what a fresh database gets while leaving the live one untouched,
  and the two silently diverge. Add `0004_…`, never edit `0001_…`.
- **Every write is a server action** in `src/server/actions/`, returning
  `ActionResult` rather than throwing for expected problems.
- **Every read is in `src/server/queries/`**, wrapped in `cache()` so a layout
  and three components asking the same question cost one query.
- **Blank form field means null; absent key means untouched.** Collapsing the
  two is how a partial update silently wipes a column.
- **Pure logic lives in `src/lib/`, not beside the action that uses it.** A
  `"use server"` module may only export async functions, so anything worth
  unit-testing has to sit outside one — `src/lib/rsvp-answers.ts` was pulled
  out of the RSVP action for exactly that reason, and it guards a public
  endpoint. Put the rule in `lib/`, import it into the action, test it
  directly.

---

## 9. Open questions still blocking

From the spec, none answered yet. (1) and (2) decide whether the schedule is
real:

1. **Wedding date and invitation send date.** The only fixed dates in the plan.
2. **RSVP lock date.** Drives the read-only cutover; already enforced by
   `weddings.rsvp_lock_at` wherever it is set.
3. **Guest pool size and final capacity.** Sets `weddings.capacity`.
4. **Sending domain.** See session 2 above.

Added in session 3, and answerable without the planner:

5. **Did `bootstrap.sql` actually run on `lsgbwxisqqazahgkibmj`?** Section 0
   records the migrations as applied on the planner's word and the bootstrap
   as assumed. Until somebody runs the three checks in
   `supabase/migrations/README.md` and reads the numbers back, the live
   schema's state is hearsay — and a missing bootstrap looks exactly like a
   broken app, because the dashboard renders nothing without a wedding row.
6. **Which organisation owns that project?** A session whose Supabase
   connector is scoped elsewhere sees only `arm15lite_PROD` and concludes the
   account is empty. Recording the organisation alongside the ref in section 0
   would close that trap for good.
