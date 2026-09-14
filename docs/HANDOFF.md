# Handoff

**Living document.** Rewritten at the end of every work chunk. If you are a new
session picking this up, read this file and `docs/wedding-platform-spec.md` and
you have everything.

Last updated: chunk 8 of 9 — public RSVP and site complete.

---

## What this is

V1 of the wedding platform described in `docs/wedding-platform-spec.md`: guest
list and RSVP. V1 is the only part of the build with a deadline that cannot
move (invitations have to go out), so it ships before vendors, budget or
seating are touched at all.

Branch: `claude/wedding-platform-brd-8154h7`. All work goes here.

---

## Current state

| Chunk | Status | What landed |
| --- | --- | --- |
| 1. Scaffold | done | Next.js 15 App Router, TS strict, Tailwind, CI |
| 2. Database | done | 16 tables, RLS, views, seed, 49 SQL assertions |
| 3. Core lib | done | Fractional ranking, tokens, env, Supabase clients |
| 4. Auth + shell | done | Magic link, layout, dashboard |
| 5. Guests | done | Table, filters, detail, households |
| 6. Ranking | done | dnd-kit + virtual + cut line |
| 7. Invitations | done | Events, send, chase cron |
| 8. Public RSVP | done | `/rsvp/[token]`, public site |
| 9. Export + polish | not started | CSV for the caterer, final tests |

### Verified, not just written

```bash
./scripts/verify-migrations.sh   # 52 SQL assertions, throwaway PG cluster
npm test                         # 38 unit tests (ranking, tier, tokens, timezone)
npm run typecheck                # clean
npm run build                    # clean
```

`scripts/verify-migrations.sh` needs the PostgreSQL server binaries and must
**not** run as root (initdb refuses). CI runs both on every push.

---

## How to get running

```bash
npm install
cp .env.example .env.local        # then fill it in — every value is explained
supabase start                    # or point at a hosted project
supabase db reset                 # applies migrations + seed
npm run dev
```

No Supabase project exists yet. Nothing here has been applied to a hosted
database — the migrations have only ever run against throwaway local clusters.
Creating the project is a real decision with a cost attached, so it is left to
the owner.

---

## The five things worth knowing before you change anything

**1. Tenancy is a foreign key, not a convention.**
Every tenant table carries `wedding_id`, every parent carries a redundant
`unique (id, wedding_id)`, and children reference `(parent_id, wedding_id)`.
Attaching a guest in one wedding to a household in another raises a foreign
key violation — even for the service role, which bypasses RLS entirely. When
you add a table, follow the pattern and add it to the array in
`20260914120100_rls.sql`; that array is the whole cost of securing it.

**2. `households.rank` is `COLLATE "C"`, and that is load-bearing.**
Ranks are compared in two places: Postgres, and JavaScript on the ranking
screen. JavaScript compares UTF-16 code units, so `'B' < 'a'`. A Supabase
project defaults to `en_US.UTF-8`, where the opposite is true. Unpinned, the
cut line would silently disagree with the order the user dragged. There is an
assertion guarding this in `supabase/tests/02_derived.sql`.

**3. Ranks never end in `'0'`.**
Nothing can sort between `"x"` and `"x0"`, so a key ending in the minimum digit
is a dead end. `src/lib/rank.ts` enforces this and the unit tests hammer it.
If you seed data by hand, respect it.

**4. `tier` is not a column.**
It is derived in `v_households` from the household's rank against
`weddings.cut_rank` and `weddings.tier_b_rank`. Moving a cut line re-tiers the
entire waitlist with no write. Do not add a `tier` column, however tempting.

**5. Empty `Relationships` arrays break embedded selects silently.**
PostgREST's type parser resolves `guests(*, households(name))` by looking
through the `Relationships` array in `src/lib/types/database.ts`. Leave it
empty and the embed resolves to `never` — which compiles fine and loses all
type safety. If you add an embed, add its relationship.

**6. The service role client is a loaded gun.**
`src/lib/supabase/admin.ts` bypasses RLS. It has exactly two legitimate
callers: the public RSVP path (scoped by resolving a token to one household)
and the cron sender. Anything a signed-in collaborator does goes through
`src/lib/supabase/server.ts`, so the database stays the thing enforcing
tenancy.

---

## Deliberate exceptions, so nobody "fixes" them

- **`rsvp_token_attempts` has no `wedding_id`.** A failed token lookup has no
  wedding to attribute itself to — that is the point of a throttle. It is
  infrastructure, has no RLS policy, and only the service role touches it.
- **`weddings` has no insert policy.** A collaborator inserting a bare wedding
  row would immediately lose access to it, because `is_collaborator()` would be
  false for the row they just created. Weddings are created by the service role,
  which writes the owner's `collaborators` row in the same transaction.
- **`supabase/tests/fixtures/supabase_shim.sql` is a test fixture only.** It
  fakes `auth.users`, `auth.uid()` and the three roles so migrations can be
  verified without Supabase. It is never applied to a real project.

---

## Open questions still blocking

These are from the spec and none of them are answered yet. None block the code
below, but (1) and (2) decide whether the schedule is real:

1. **Wedding date and invitation send date.** The only fixed dates in the plan.
2. **RSVP lock date.** Drives the read-only cutover.
3. **Guest pool size and final capacity.** Sets `weddings.capacity`.
4. **Sending domain.** SPF/DKIM/DMARC needs days of lead time and sits in front
   of the send date. This is the likeliest thing to make V1 technically
   complete but practically broken.

---

## A trap that cost real time, so you don't repeat it

`@supabase/ssr` and `@supabase/supabase-js` must stay version-compatible.
`ssr` 0.5.2 passed `SupabaseClient`'s generics in the order supabase-js used
at 2.43; by 2.116 that order had changed, so every table in the app resolved
to `never`. Nothing failed — `never` is assignable to anything, so queries
type-checked and casts looked reasonable. `src/lib/types/guard.ts` now breaks
the build if it happens again. **Do not "simplify" that file away.**

The same class of bug bit twice more: `interface` row types (no implicit index
signature, so they fail supabase-js's `Record<string, unknown>` constraint) and
empty `Relationships` arrays. All three failed silently rather than loudly.
When a Supabase query's types look suspiciously permissive, check for `never`
before trusting it.

---

## Next chunk

**Chunk 9: exports and finishing.** CSV the caterer can actually read
(dietary and allergies by household), a guest-list export, and a final pass
over the "done when" checklist in the spec.

Note: `tierFor` in `src/lib/tier.ts` deliberately duplicates the CASE
expression in `v_households`, because during an optimistic drag the server's
answer describes the pre-drag order. It is tested against exactly the cases
the SQL suite asserts, so the two cannot drift apart silently.
