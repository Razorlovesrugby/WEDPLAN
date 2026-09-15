# Feature spec: Reminders

**Status: spec only. No schema, no code. Depends on
[Lists, with an auto-synced timeline](01-lists-and-timeline.md) shipping
first — there is nothing to remind about until `list_items` has real rows
with due dates. Open questions below are unanswered — nothing gets built
until they are, and until spec 01 is done.**

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

## 3. Data model — not yet written, sketched here for review

```
message_log.kind   existing enum ('invitation', 'reminder', 'update', 'test')
                    + a new value, e.g. 'digest'
```

That single enum addition is the only schema change this feature needs —
everything else it reads (`v_timeline_items`, `list_items.snoozed_until`)
already exists from spec 01. A small standalone migration, keeping with
"one feature, one migration."

`message_log` already provides the dedupe key a cron retry needs
(`message_log_dedupe_key` is unique per wedding) — the digest job would key
its dedupe string off wedding + ISO week, so a retry mid-send can't
double-email.

## 4. Screens / surfaces

No new route. Extends:
- The dashboard and wherever the timeline lives — "due today" / "this
  week" / "overdue" tiles, a pure query, no cron involved.
- `/api/cron/reminders` — extended (or a second handler alongside it,
  sharing the cron secret check) to also send the weekly digest.

## 5. Server actions & queries needed

- A query over `v_timeline_items` for "overdue" / "due this week" — shared
  by the UI tiles and the digest job.
- Extension to whatever sends the existing RSVP reminder email — same
  sender, same `message_log` write, new `kind` value and template.

## 6. Test plan

- Unit tests for the digest content logic (overdue vs. due-within-7-days
  vs. snoozed-out) as pure functions in `src/lib/`, same pattern as
  `src/lib/rsvp-answers.ts`.
- Dedupe test: simulate a retried cron run, confirm only one email/log
  entry per wedding per week.
- `verify-migrations.sh` / `verify-bootstrap.sh` stay green after the enum
  addition.
- Without `RESEND_API_KEY` the sender logs instead of sending, by existing
  design (`docs/HANDOFF.md` section 2) — confirm the digest respects that
  same fallback rather than erroring.
- Real send needs the live project and a working sender, same limitation
  V1's own reminder cron has never cleared (`docs/HANDOFF.md` section 2 —
  "no email has been sent").

## 7. Open questions

**1. Cadence — same schedule as the existing RSVP reminder cron (Tuesdays,
10:00 UTC), or different?**

**2. Recipients — always both collaborators, or configurable?**

**3. Channel — email only, or also a WhatsApp-text option** like
invitations already have (copy-to-clipboard, not sent programmatically)?

**4. Urgency window — is "overdue + due in the next 7 days" right**, or
should it be longer (14 days) so nothing is a surprise the week it's due?

**5. Anything to say beyond a list?** A one-line summary at the top (counts)
before the itemised list, or keep it as plain as V1's existing guest
reminder email?

**6. Should the digest group by list** (e.g. "Decor: 2 overdue" then
"Timeline: 5 due this week"), or present one flat chronological list
matching the timeline screen itself?
