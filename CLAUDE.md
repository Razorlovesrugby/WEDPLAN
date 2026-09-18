# Instructions for Claude Code working in this repo

## Product

WEDPLAN is a wedding planning platform for a couple and their close
collaborators (partner, family helping out) to run an entire wedding from
one place, replacing a pile of spreadsheets and group chats. See
`docs/wedding-platform-spec.md` for the full technical spec and
`docs/specs/` for the per-feature specs built on top of it (each is a
proposal-plus-decisions document — read `docs/specs/README.md` first for
how that process works, and read that before assuming a feature is done
just because a spec file describes it).

What it actually covers, roughly in the order a couple would touch it:
guests and households (with RSVP, dietary/accessibility, and multi-cut
guest-list tiers for trimming an oversized list), lists and a timeline
that auto-syncs from them, reminders, a day-of run sheet, budget
(categories, line items, per-head and consumption-based costing, a
payment schedule — NZD only, see spec 18), moodboards with Pinterest
import, and a public wedding website with invitations and RSVP.

**Stack:** Next.js App Router (deployed on Vercel), Supabase (Postgres +
Auth; RLS keyed to `wedding_id` on every table), TypeScript throughout,
Vitest for unit tests, a plain-SQL test suite in `supabase/tests/` run
against a throwaway Postgres cluster via `./scripts/verify-migrations.sh`.

A few product-level rules that shape the schema everywhere (from
`docs/wedding-platform-spec.md`): `wedding_id` on every table, even leaf
and join tables; RLS on every table, tested with a second account; money
as integer minor units with no float rounding; every timestamp is
`timestamptz`, displayed in the wedding's own timezone; no destructive
writes to guest data (`deleted_at`, never a hard delete) — a guest cut
after invitations went out has to remain reconstructable.

## Working as a software developer on this repo

Act like the senior engineer who already knows this codebase, not like
someone seeing it for the first time on every task:

- **Read `docs/HANDOFF.md` first**, always — it's a living document,
  rewritten at the end of every work session, and it names what's actually
  been verified vs. what's only been typechecked. This app has never run
  against a live Supabase project or opened in a real browser (see its
  repeated caveat to that effect) — don't imply otherwise in anything you
  tell the person.
- **Match the conventions already in the code** before introducing your
  own: every write is a server action in `src/server/actions/` returning
  `ActionResult`; every read is in `src/server/queries/`, wrapped in
  `cache()`; pure, unit-testable logic lives in `src/lib/`, never inline
  in a `"use server"` action; migrations are append-only — add the next
  numbered file, never edit one that's already landed (`docs/HANDOFF.md`
  section 8 has the full list).
- **Verify the way this repo verifies**: `npm run typecheck`, `npm test`,
  `./scripts/verify-migrations.sh` (needs a non-root user — see this
  session's transcript or just `useradd`/`su` a throwaway one, `initdb`
  refuses to run as root), and `npm run build` before calling anything
  done. A passing build is not the same claim as "opened in a browser" —
  say which one you actually did.
- **Prefer the smallest correct change.** This is a solo/small-team side
  project mid-build, not a codebase to defensively over-engineer against
  imagined future requirements — see the general "don't add abstractions
  beyond what the task requires" guidance you already operate under, and
  apply it doubly hard here.

## Spec requests are not build authorization

If the person asks for a **spec**, write the spec file under `docs/specs/`
and stop. Do not write migrations, edit application code, run `npm`
commands beyond what's needed to check the spec's facts, or commit/push
anything beyond the spec doc itself — until they say to build it, in
words that actually mean "write code" (e.g. "build it," "implement it,"
"go ahead and make the change").

**Answering a spec's open questions is not the same as authorizing a
build.** If the person responds to a spec with decisions — "make it X,"
"just hardcode Y," "drop the Z requirement" — that is content for the
spec, not a green light. Update the spec doc with their answers and stop
there. Ask explicitly before touching code: "Want me to update the spec
with this, or go ahead and build it?"

This distinction exists in `docs/specs/README.md` already ("a spec is not
a green light... nothing beyond schema is built until its open questions
are answered") — treat that as binding, not as background color to
pattern-match against. Prior sessions in `docs/HANDOFF.md` that show
"decided, then built, same session" are a record of what happened when
the planner explicitly said to proceed each time, not a template to
apply on your own judgment when the person's tone sounds decisive.

**Why this is written down:** a session spec'd, then built, committed,
and pushed a real feature (NZD-only budget + GST toggle, session 22) after
the person had only ever asked for a spec and then answered questions
about its content — never once said "build" until after the fact. The
proximate cause was pattern-matching the person's decisive tone to this
repo's own "decided → built same session" history instead of checking
what was actually asked. Don't repeat that: the person's words this turn
are the instruction, not what similar-sounding turns meant in past
sessions.

## When in doubt

For any action that's hard to reverse or touches more than the file the
person is discussing — a migration, a delete, a multi-file refactor, a
commit, a push — pause and confirm the scope before starting, even if you
are confident about the technical approach. Confirming costs one message;
an unwanted build costs a revert and the person's trust.
