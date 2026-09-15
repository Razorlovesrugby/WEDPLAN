# Feature spec: Reminders

**Status: spec only. No schema, no code. Depends on [task timeline](02-task-timeline.md)
shipping first — there is nothing to remind about until `tasks` has real
rows with due dates. Open questions below are unanswered — nothing gets
built until they are, and until spec 02 is done.**

## 1. What this replaces

The part of spreadsheet planning that a spreadsheet structurally can't do at
all: it doesn't chase anyone. This is the "reminders" third of the original
ask (checklists, timeline, reminders) — the payoff for having real due
dates in the `tasks` table from spec 02.

## 2. Scope

**In:**
- In-app "due this week" / "overdue" counts, surfaced on `/tasks` and the
  dashboard.
- A weekly email digest to both collaborators: what's overdue, what's due
  in the next 7 days.
- Reuse of the existing `/api/cron/reminders` infrastructure
  (`message_log`, `CRON_SECRET`, the Vercel cron schedule in `vercel.json`)
  rather than new email/cron plumbing.

**Out, explicitly:**
- No push notifications, no SMS, nothing that pages a phone.
- No per-task snooze notification (a snoozed task simply drops out of the
  digest until its snooze date, per the existing `tasks.snoozed_until`
  column from spec 02) — no separate "your snooze is up" email.
- No reminders for checklist items directly, unless question 4 below says
  otherwise — v1 of this feature reminds about `tasks` only.

## 3. Data model — not yet written, sketched here for review

```
message_log.kind   existing enum ('invitation', 'reminder', 'update', 'test')
                    + a new value, e.g. 'task_digest'
```

That single enum addition is the only schema change this feature is
expected to need — everything else it reads (`tasks.due_date`,
`tasks.status`, `tasks.snoozed_until`) already exists from spec 02. Because
it's additive to an existing enum, it's a small standalone migration
(`0006_...`) rather than folded into spec 02's `0005`, keeping with "one
feature, one migration."

`message_log` already provides the dedupe key a cron retry needs
(`message_log_dedupe_key` is unique per wedding) — the digest job would key
its dedupe string off wedding + ISO week, so a retry mid-send can't
double-email.

## 4. Screens / surfaces

No new route. Extends:
- `/tasks` and `/` (dashboard) — "due this week" / "overdue" tiles, a pure
  query against `tasks`, no cron involved.
- `/api/cron/reminders` — extended (or a second handler alongside it,
  sharing the cron secret check) to also send the weekly task digest.

## 5. Server actions & queries needed

- `src/server/queries/tasks.ts` (shared with spec 02) — "due this week" /
  "overdue" counts and lists, called both by the UI tiles and the digest
  job.
- Extension to whatever sends the existing RSVP reminder email — same
  sender, same `message_log` write, new `kind` value and template.

## 6. Test plan

- Unit tests for the digest content logic (which tasks qualify — overdue vs.
  due-within-7-days vs. snoozed-out) as pure functions in `src/lib/`, same
  pattern as `src/lib/rsvp-answers.ts`.
- Dedupe test: simulate a retried cron run, confirm only one email/log
  entry per wedding per week.
- `verify-migrations.sh` / `verify-bootstrap.sh` stay green after the enum
  addition.
- Without `RESEND_API_KEY` the sender logs instead of sending, by existing
  design (`docs/HANDOFF.md` section 2) — confirm the digest respects that
  same fallback rather than erroring.
- Real send: this needs the live project and a working sender, same
  limitation V1's own reminder cron has never cleared (`docs/HANDOFF.md`
  section 2 — "no email has been sent").

## 7. Open questions

**1. Cadence — same schedule as the existing RSVP reminder cron (Tuesdays,
10:00 UTC), or different?** A Sunday-evening send was floated in an earlier
planning pass as matching how a "weekly briefing" is typically read; the
existing infra already runs Tuesday mornings. Keep them aligned (simpler:
one cron trigger, two things it sends) or split them?

**2. Recipients — always both collaborators, or configurable?** V1 has
exactly two collaborators (`collaborators.role`: owner/partner). Is the
digest always to both, or does one person want to opt out / receive a
different subset?

**3. Channel — email only?** Invitations already support a WhatsApp text
composer (copy-to-clipboard, not sent programmatically). Is there any
appetite for a similar WhatsApp-text option for the digest, or is email
(reusing the existing sender) sufficient?

**4. Should checklist items with their own due dates ever appear in the
digest, or only `tasks`?** Checklist items in spec 01 don't currently carry
a due date of their own — only a task they've been turned into does. If
that stays true, this question is moot. Flagging in case you want a
checklist item to be remindable without first being converted into a task.

**5. Urgency window — is "overdue + due in the next 7 days" the right
range?** Some spreadsheet-planning workflows use a longer look-ahead (14
days) so nothing is a surprise the week it's due. Confirm 7 days, or pick a
different number.

**6. Anything to say beyond a list?** V1's existing reminder email to
guests is a plain nudge. Do you want the task digest to be similarly plain
(a list of what's due/overdue), or include something like a one-line
summary at the top (count overdue, count due this week) before the list?
