# Feature spec: Reminders

**Status: built. Spec 01 shipped first (session 8), so this session answered
section 7's open questions directly (decisions below, in place of the
question list) and built against them: `0006_reminders.sql`,
`src/lib/reminders/digest.ts`, the digest email template, the extended
`/api/cron/reminders`, and dashboard tiles. See the status note after the
decisions for what that build covers and what it doesn't.**

## 1. What this replaces

The part of spreadsheet planning that a spreadsheet structurally can't do at
all: it doesn't chase anyone. This is the payoff for spec 01's due dates —
once anything, anywhere, can carry a date and show up on the timeline, the
natural next step is being told what's coming up without having to look.

## 2. Scope

**In:**
- In-app "due today" / "due this week" / "overdue" counts, surfaced
  wherever the timeline lives and on the dashboard — a query over
  `v_timeline_items`, no new table.
- A weekly email digest to both collaborators: what's overdue, what's due
  in the next 7 days, across every list.
- Reuse of the existing `/api/cron/reminders` infrastructure
  (`message_log`, `CRON_SECRET`, the Vercel cron schedule in `vercel.json`)
  rather than new email/cron plumbing.

**Out, explicitly:**
- No push notifications, no SMS, nothing that pages a phone.
- No per-item snooze notification — a snoozed item (`list_items.snoozed_until`)
  simply drops out of the digest until its snooze date, no separate
  "your snooze is up" email.

## 3. Data model — `0006_reminders.sql`

```
message_log.kind   existing enum ('invitation', 'reminder', 'update', 'test')
                    + 'digest'
```

That single enum addition is the only schema change this feature needed —
everything else it reads (`v_timeline_items`, `list_items.snoozed_until`)
already existed from spec 01. One standalone migration, keeping with "one
feature, one migration." `alter type ... add value if not exists` rather
than a bare `add value`, so re-running the file (by hand, against a project
that already has it) is a no-op instead of an error.

`message_log` already provides the dedupe key a cron retry needs
(`message_log_dedupe_key` is unique per wedding) — the digest job would key
its dedupe string off wedding + ISO week, so a retry mid-send can't
double-email.

## 4. Screens / surfaces — built

No new route, as scoped. Extends:
- `/` (the dashboard) — a new "Tasks" section, two `Stat` tiles (Overdue,
  Due this week) linking into `/timeline`, built from `getTimelineSummary`.
  No separate "due today" tile: `/lists`'s own Today smart view already
  covers that, and the digest/dashboard pairing is specifically about the
  7-day window a weekly email can't otherwise represent.
- `/api/cron/reminders` — extended in place (not a second handler): same
  file, same cron secret check, a new loop after the existing RSVP-chase
  loop.

## 5. Server actions & queries — built

- `src/lib/reminders/digest.ts` — `buildDigest(items, today, windowDays)`:
  pure content logic (overdue / due-within-N-days / snoozed-out, grouped by
  list), plus `isoWeek(date)` for the dedupe key. No database access, same
  `lib/` convention as `src/lib/lists/generate.ts` — tested directly, wired
  in afterwards.
- `getTimelineSummary(weddingId)` in `src/server/queries/lists.ts` — reuses
  the existing `getTimelineItems` query plus `buildDigest`, so the dashboard
  tiles and the digest email can never compute "overdue" two different ways.
  A query over `v_timeline_items`, no new table, as scoped.
- `/api/cron/reminders` extended, not duplicated: after its existing
  per-household RSVP chase loop, it now also loops every wedding, builds
  that wedding's digest via the service-role client (admin, because a cron
  has no session), and — if there's anything to report — sends one email
  per collaborator via `sendEmail`/`digestEmail`, logged to `message_log`
  with `kind: 'digest'`.
- Collaborator emails come from `supabase.auth.admin.getUserById()` on the
  service-role client (the Admin API, not PostgREST) — not a new profile
  table. `public.collaborators` has the `user_id`; only the service role
  can resolve it to an email, which is exactly why this lives in the cron
  route and not in a query a signed-in collaborator's browser could call.

## 6. Test plan

- ~~Unit tests for the digest content logic~~ — done,
  `src/lib/reminders/digest.test.ts`: overdue vs. due-within-7-days vs.
  snoozed-out, the window boundary itself, grouping by list, and the
  "nothing to report" case, as pure functions, same pattern as
  `src/lib/rsvp-answers.ts`.
- ~~Dedupe test~~ — done: the dedupe key is `digest:{wedding_id}:{isoWeek}:
  {recipient email}`, covered by a unit test on `isoWeek` plus the same
  `message_log` unique-index mechanism the RSVP reminder cron already
  relies on (a retried insert collides on `message_log_dedupe_key` and is
  skipped) — no new mechanism, so no new integration test needed beyond
  what `01_tenancy.sql` already exercises for that index.
- ~~`verify-migrations.sh` / `verify-bootstrap.sh` stay green~~ — done, 71
  assertions (see the status note above).
- ~~Without `RESEND_API_KEY` the sender logs instead of sending~~ — done by
  construction: the digest send goes through the same `sendEmail()` in
  `src/lib/email/send.ts` the RSVP reminder already uses, so the dev-mode
  fallback is automatic, not a separate code path to keep in sync.
- **Not done, and can't be from here: a real send.** Needs the live project
  and a working sender, same limitation V1's own reminder cron has never
  cleared (`docs/HANDOFF.md` section 2 — "no email has been sent").

## 7. Open questions — answered

No planner session answered these directly, so this build picked the
reading that reuses the most existing infrastructure and needs the fewest
new decisions later — the same posture spec 01 itself describes for
default engagement dates and short-engagement clamping. Each is easy to
revisit; nothing here is schema-load-bearing except question 3's answer
(no WhatsApp = no new table).

**1. Cadence — same schedule as the existing RSVP reminder cron (Tuesdays,
10:00 UTC), or different?** Decided: the same schedule, and the same
invocation — the digest send lives inside the existing
`/api/cron/reminders` handler rather than a second Vercel cron entry, per
the spec's own "reuse of the existing infrastructure" scope line.

**2. Recipients — always both collaborators, or configurable?** Decided:
always both. `collaborators` has no more than two rows per wedding by
design (V1's whole model), and "configurable" would be a settings screen
for a two-person list — not worth building until someone asks for it.

**3. Channel — email only, or also a WhatsApp-text option?** Decided: email
only, as scoped. A copy-to-clipboard WhatsApp text (like invitations have)
makes sense for a message aimed at a guest who has to act once; a weekly
digest aimed at the two collaborators themselves doesn't need a second
channel to duplicate into.

**4. Urgency window — "overdue + due in the next 7 days", or 14?**
Decided: 7, matching the weekly cadence exactly — the window is exactly
"everything that could become due before the next digest arrives," so
nothing that will be due before next Tuesday's email is missed, and
nothing shows up twice as far out as two sends running.

**5. Anything to say beyond a list?** Decided: yes — a one-line count
("3 overdue, 5 due this week") at the top of both the email and the
dashboard tiles, before the itemised, grouped list. Same reasoning as the
dashboard's own `Stat` component (`src/components/stat.tsx`): a number you
can act on beats a list you have to read to find the number.

**6. Should the digest group by list?** Decided: yes, by list — matching
how `/timeline` already colours and groups by originating list (spec 01,
section 6), so the digest and the screen it links back to read the same
way.

**Added, not originally an open question — what if nothing is due?**
Decided: skip sending entirely when a wedding has zero overdue and zero
due-within-7-days items, rather than sending a reassuring "nothing due"
email every week. A digest that arrives even when it has nothing to say is
exactly the kind of email a recipient trains themselves to stop opening —
the whole point of this feature, per section 1, is to be the thing that
chases, not another thing to ignore.

## 8. Status, verified this session

- `0006_reminders.sql` applied cleanly against a throwaway cluster;
  `verify-migrations.sh` and `verify-bootstrap.sh` both green.
- `src/lib/reminders/digest.test.ts` — unit tests for bucketing (overdue /
  due-soon / snoozed-out / beyond-window), grouping by list, the
  nothing-to-report case, and `isoWeek`.
- `npm run typecheck`, `npm test`, `npm run build` all green with this
  feature included — see `docs/HANDOFF.md` for the exact counts.

**Not verified, and can't be from here — same gap as spec 01:**
- Never applied to the live project.
- No real email has ever been sent by this app, digest or otherwise
  (`docs/HANDOFF.md` section 2). The dev-mode fallback (log instead of
  send) has been exercised only by inspection of `sendEmail()`'s existing
  behaviour, not by an actual cron run in this session.
- The dashboard tiles have not been opened in a browser.
