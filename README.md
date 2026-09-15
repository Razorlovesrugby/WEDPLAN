# Wedding platform

Guest list and RSVP, built to the spec in
[`docs/wedding-platform-spec.md`](docs/wedding-platform-spec.md).

This is **V1**. It exists to get invitations out and RSVPs back without a
spreadsheet — the only part of the plan with a deadline that cannot move.
Vendors, budget, the inbox and seating are V2 and V3, and deliberately absent.

Next.js 15 (App Router) · Supabase (Postgres, Auth) · TypeScript · Tailwind

---

## What works today

- **Guest list.** Households are the invite unit, guests the headcount unit.
  Filter by tag, tier, RSVP state, age, or missing data; filters live in the URL
  so a filtered list is a link. Inline editing for the fields you touch most.
  Move one guest, several selected at once, or a whole household's worth to
  another household — with a search-as-you-type picker that can spin up the
  destination household on the spot, so splitting or merging households
  never loses RSVP history, tags, or notes.
- **Ranked cut line.** Drag hundreds of households into an order, set the cut at
  venue capacity, and everything below becomes the waitlist automatically.
  Virtualised, so it stays usable well past 300 rows.
- **Invitations.** One link per household, no account to create. Send by email,
  or copy a ready-made WhatsApp message for the relatives who don't do email.
- **RSVP.** Per guest, per event, with dietary requirements, accessibility needs
  and your own custom questions. Editable until the lock date.
- **Chasing.** A weekly cron that only ever mails households who haven't
  finished answering, never inside ten days of the last nudge, never a muted
  one, and never after RSVPs close.
- **Exports.** Guest list, household list, and a catering sheet that carries
  only confirmed attendees with their dietary notes.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # every value is explained in the file
supabase start                 # or point at a hosted project
supabase db reset              # applies migrations and the dev seed
npm run dev
```

No Supabase project exists yet — the migrations have only ever been applied to
throwaway local clusters. See `docs/HANDOFF.md` for what that means and what to
do about it.

### Before real invitations go out

Set up SPF, DKIM and DMARC on the sending domain and let it warm up. Without
them a hundred invitations land in spam and you find out from a relative. This
takes days and sits directly in front of the one immovable deadline in the
project, so do it early.

---

## Checks

```bash
npm run typecheck                 # strict, with noUncheckedIndexedAccess
npm test                          # 47 unit tests
./scripts/verify-migrations.sh    # 52 SQL assertions on a throwaway cluster
npm run build
```

`verify-migrations.sh` builds its own PostgreSQL cluster, applies a small
Supabase shim, runs every migration and the seed, then executes the SQL test
suite. No Docker, no network, no Supabase CLI — CI runs it on every push. It
must not run as root, because `initdb` refuses.

---

## Layout

```
src/
  app/
    (planner)/        signed-in screens: dashboard, guests, ranking, invitations
    rsvp/[token]/     public RSVP — no login, one household per token
    w/                public site
    api/              cron and CSV exports
  components/
  lib/                ranking, tokens, CSV, timezone, formatting, Supabase clients
  server/
    actions/          every write in the app
    queries/          every read
    rsvp/             token resolution and throttling
supabase/
  migrations/         schema, RLS, views
  tests/              tenancy and derived-value assertions
  seed.sql            two weddings — a tenancy test with one tenant proves nothing
docs/
  wedding-platform-spec.md   the amended spec, V1 through V3
  HANDOFF.md                 current state and what to pick up next
```

---

## The two rules worth knowing before you change anything

**Tenancy is a foreign key, not a convention.** Every tenant table carries
`wedding_id`, every parent carries a redundant `unique (id, wedding_id)`, and
children reference `(parent_id, wedding_id)`. Attaching a guest in one wedding
to a household in another is a foreign key violation — even for the service
role, which bypasses RLS entirely.

**The service role client bypasses RLS and has exactly two legitimate callers:**
the public RSVP path, scoped by resolving a token to one household, and the
cron sender. Everything a signed-in collaborator does goes through
`src/lib/supabase/server.ts`, so the database stays the thing enforcing access.

More, including the traps that have already cost time, in `docs/HANDOFF.md`.
