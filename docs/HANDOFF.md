# Handoff

**Living document.** Rewritten at the end of every work chunk. If you are a new
session picking this up, read this file and `docs/wedding-platform-spec.md` and
you have everything you need.

Last updated: chunk 9 of 9 — V1 feature-complete against the spec, not yet
deployed.

---

## What this is

V1 of the wedding platform in `docs/wedding-platform-spec.md`: guest list and
RSVP. V1 is the only part of the build with a deadline that cannot move, so it
ships before vendors, budget or seating are touched at all.

Branch: `claude/wedding-platform-brd-8154h7`. All work goes here.

---

## Current state

| Chunk | Status | What landed |
| --- | --- | --- |
| 1. Scaffold | done | Next.js 15 App Router, TS strict, Tailwind, CI |
| 2. Database | done | 16 tables, RLS, views, seed, SQL assertions |
| 3. Core lib | done | Fractional ranking, tokens, env, Supabase clients |
| 4. Auth + shell | done | Magic link, layout, dashboard |
| 5. Guests | done | Table, filters, inline edit, detail, households |
| 6. Ranking | done | dnd-kit + virtual + two cut lines + waitlist suggestions |
| 7. Invitations | done | Events, send, WhatsApp copy, chase cron |
| 8. Public RSVP | done | `/rsvp/[token]`, throttling, public site |
| 9. Exports | done | Guest, household and catering CSV |

### Verified, not just written

```bash
npm run typecheck                 # clean
npm test                          # 47 unit tests
./scripts/verify-migrations.sh    # 52 SQL assertions, throwaway PG cluster
npm run build                     # clean, 15 routes
```

`verify-migrations.sh` needs the PostgreSQL server binaries and must **not**
run as root (`initdb` refuses). CI runs everything on every push.

### What has NOT been verified

Be precise about this, because the tests above can mislead if you skim them.

- **Nothing has run against a real Supabase project.** No project exists. The
  migrations have only ever been applied to throwaway local clusters through a
  shim that fakes `auth.users`, `auth.uid()` and the three roles.
- **No UI has been exercised in a browser.** It type-checks and builds; nobody
  has clicked it. Expect the first hour of real use to find layout and
  empty-state problems.
- **No email has been sent.** Without `RESEND_API_KEY` the sender logs instead,
  by design. The templates have never been through a real inbox or a spam
  filter.
- **The magic-link flow has never completed**, because that needs a real
  Supabase Auth instance.

---

## What to do next, in order

1. **Create the Supabase project** and apply the migrations. Then work through
   the spec's own "done when" checklist end to end: add a household, rank it
   above the cut, send an invitation to your own second address, reply as a
   guest with dietary requirements, watch it land on the dashboard, export the
   caterer's CSV.
2. **Set up the sending domain** — SPF, DKIM, DMARC, and warming. This is the
   likeliest thing to make V1 technically complete but practically broken, and
   it needs days of lead time in front of the send date.
3. **Answer the open questions below.** Two of them decide whether the schedule
   is real.
4. **Then** the deferred items in the section after that.

---

## How to get running

```bash
npm install
cp .env.example .env.local     # every value is explained in the file
supabase start                 # or point at a hosted project
supabase db reset              # applies migrations + seed
npm run dev
```

Creating a wedding is deliberately not a UI flow. `weddings` has no insert
policy: a collaborator inserting a bare wedding row would lose access to it
immediately, since `is_collaborator()` would be false for the row they just
created. Weddings are created by the service role, which writes the owner's
`collaborators` row in the same transaction. For now, do it in SQL — see
`supabase/seed.sql` for the shape.

---

## The six things worth knowing before you change anything

**1. Tenancy is a foreign key, not a convention.**
Every tenant table carries `wedding_id`, every parent carries a redundant
`unique (id, wedding_id)`, and children reference `(parent_id, wedding_id)`.
Attaching a guest in one wedding to a household in another raises a foreign key
violation — even for the service role, which bypasses RLS entirely. When you
add a table, follow the pattern and add it to the array in
`20260914120100_rls.sql`; that array is the whole cost of securing it.

**2. `households.rank` is `COLLATE "C"`, and that is load-bearing.**
Ranks are compared in Postgres and in JavaScript. JavaScript compares UTF-16
code units, so `'B' < 'a'`. A Supabase project defaults to `en_US.UTF-8`, where
the opposite holds. Unpinned, the cut line would silently disagree with the
order the user dragged. There is an assertion guarding it.

**3. Ranks never end in `'0'`.**
Nothing can sort between `"x"` and `"x0"`, so a key ending in the minimum digit
is a dead end. `src/lib/rank.ts` enforces it and the unit tests hammer it. If
you seed data by hand, respect it.

**4. `tier` is not a column.**
It is derived in `v_households` from rank against `weddings.cut_rank` and
`tier_b_rank`. Moving a cut line re-tiers the whole waitlist with no write. Do
not add a `tier` column, however tempting. `src/lib/tier.ts` duplicates that
logic for optimistic drags only, and is tested against the same cases the SQL
suite asserts.

**5. Empty `Relationships` arrays break embedded selects silently.**
PostgREST's type parser resolves `guests(*, households(name))` through the
`Relationships` array in `src/lib/types/database.ts`. Leave it empty and the
embed resolves to `never` — which compiles fine and loses all type safety. Add
an embed, add its relationship.

**6. The service role client is a loaded gun.**
`src/lib/supabase/admin.ts` bypasses RLS. Two legitimate callers: the public
RSVP path (scoped by resolving a token to one household) and the cron sender.
Everything a signed-in collaborator does goes through
`src/lib/supabase/server.ts`.

---

## Traps that have already cost time

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

**A test harness that cannot fail.** `verify-migrations.sh` briefly contained
`grep -E 'FAIL|ERROR' <<<"$out" && exit 1`, which returns non-zero whenever
grep finds nothing — the normal case. Under `set -e` that aborted the run after
the first test file while reporting success. If you touch that script, make it
fail on purpose once and check that it says so.

---

## Deliberate exceptions, so nobody "fixes" them

- **`rsvp_token_attempts` has no `wedding_id`.** A failed token lookup has no
  wedding to attribute itself to — that is the point of a throttle. No RLS
  policy; service role only.
- **The throttle fails open.** If the database errors while counting attempts,
  the request proceeds. A hiccup must not lock a guest out of replying, and a
  32-byte token is what is really doing the work.
- **A malformed token and an unknown one produce the same page.**
  Distinguishing them would confirm which tokens exist.
- **Invalid ids in an RSVP submission are dropped silently, not rejected.**
  Same reason.
- **`supabase/tests/fixtures/supabase_shim.sql` is a test fixture.** It fakes
  `auth.users`, `auth.uid()` and the roles so migrations can be verified
  without Supabase. Never applied to a real project.
- **Tokens are stored encrypted as well as hashed.** Hashing alone made the
  link unrecoverable, and the planner needs it back — to paste into WhatsApp
  months later, and to reprint a QR code without invalidating an invitation
  already in the post. The key lives in the environment, so a database dump
  still yields nothing.

---

## Deferred from V1, with reasons

Not oversights. Each is a deliberate call worth revisiting.

- **QR codes.** `qrcode` is installed and tokens are recoverable, so this is a
  small render route — it just was not needed before a real project exists to
  print from.
- **CSV import with column mapping and fuzzy dedupe.** `pg_trgm` is enabled and
  `rankSequence` handles bulk insertion. The UI is a half-day; the spec wants
  mapping and dedupe preview, which is most of that time.
- **Saved views.** Table, RLS policy and per-collaborator privacy test all
  exist. No UI yet.
- **Rich question types.** `single_select` and `multi_select` are in the enum
  and stored; the RSVP form renders them as text inputs. Options are already
  modelled as jsonb.
- **Realtime.** Two people editing simultaneously works correctly — the
  ranking action retries on a rank collision — but neither sees the other's
  change without a refresh.
- **Site content editing.** `site_content` is rendered but only editable in SQL.

---

## Open questions still blocking

From the spec, none answered yet. (1) and (2) decide whether the schedule is
real:

1. **Wedding date and invitation send date.** The only fixed dates in the plan.
2. **RSVP lock date.** Drives the read-only cutover; already enforced by
   `weddings.rsvp_lock_at` wherever it is set.
3. **Guest pool size and final capacity.** Sets `weddings.capacity`.
4. **Sending domain.** See step 2 above.

---

## Conventions

- **Migrations are append-only once applied anywhere.** They have been edited
  in place until now because nothing has ever run them for real. The moment a
  project exists, that stops.
- **Every write is a server action** in `src/server/actions/`, returning
  `ActionResult` rather than throwing for expected problems.
- **Every read is in `src/server/queries/`**, wrapped in `cache()` so a layout
  and three components asking the same question cost one query.
- **Blank form field means null; absent key means untouched.** Collapsing the
  two is how a partial update silently wipes a column.
