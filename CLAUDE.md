# CLAUDE.md

WEDPLAN: a wedding planning platform (Next.js App Router on Vercel, Supabase
Postgres + Auth, TypeScript, Vitest). See `README.md` for what it covers,
`docs/wedding-platform-spec.md` for the technical spec, and
`docs/specs/README.md` for the per-feature spec process.

## Start of every session

Read the top of `docs/HANDOFF.md` (current state, latest sessions, what is
verified vs only typechecked). Older sessions are in `docs/history/` — read
those only when a spec cites one.

## Rules that are not negotiable

- **A spec request is not a build request.** If asked for a spec, write the
  file under `docs/specs/` and stop: no migrations, no app code, no commit or
  push beyond the spec. Answering a spec's open questions is also not a
  build request — update the spec, then ask "update the spec only, or build
  it?" Build only on words that mean it ("build it", "implement it").
  (Session 22 built and pushed a feature from a spec request; don't repeat it.)
- **Confirm before anything hard to reverse** or wider than the file under
  discussion: migrations, deletes, multi-file refactors, commits, pushes.
- **Smallest correct change.** No abstractions for imagined future needs.
- **Be honest about verification.** Say which of typecheck, tests, SQL suite,
  build, or a real browser/live Supabase you actually ran. The app has never
  been verified against live data unless HANDOFF says otherwise.

## Conventions

- Every write is a server action in `src/server/actions/` returning `ActionResult`.
- Check the `error` of every Supabase write that matters to the user, and test any
  new `onConflict` against the SQL suite: an unchecked, always-failing upsert
  lost every RSVP answer (spec 49).
- Every read is in `src/server/queries/`, wrapped in `cache()`.
- Pure, testable logic goes in `src/lib/`, never inline in a `"use server"` file.
- Migrations are append-only: add the next numbered file, never edit a landed one.
- `wedding_id` and RLS on every table; money as integer minor units (NZD only);
  `timestamptz` shown in the wedding's timezone; guest data soft-deleted
  (`deleted_at`), never hard-deleted.

## Verify before calling anything done

```bash
npm run typecheck && npm test && npm run build
./scripts/verify-migrations.sh   # needs a non-root user (initdb refuses root)
```

## Keep this file lean

Add a rule here only if a past mistake justifies it; put detail in the spec or
HANDOFF instead. Don't create skills or docs the task doesn't need.
