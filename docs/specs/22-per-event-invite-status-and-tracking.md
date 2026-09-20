# Spec 22 — Inviting per event, answering, and knowing they looked

**Status: proposed, fully answered (2026-09-20 — see "Decided" and
"Answered" below). Nothing is built, schema included.** All six questions in
§10 are settled and the sections around them are rewritten to match. The
build order is unblocked end to end.

**Depends on:** V1's guest list (`guests`, `households`, `invitations`,
`invitation_events`, `rsvps`), spec 14 (the site and the senders) and spec 21
(the household address, which is now the only link there is), all built.

**Sibling:** [spec 23](23-site-builder-and-widgets.md), the builder. The two
were one request and were split deliberately: this half is mostly wiring
things that already exist and can ship on its own; that half is a design
project. Where they touch — which blocks are personalised, what a guest sees
of an event they are not invited to — this spec owns the rule and 23 owns the
rendering.

---

## 1. What was asked

In the planner's words, condensed:

- **In Guests, tick whether a person is included in a particular event**, with
  more than two states: **Invite sent · Yes · No**.
- **If they are in one of those states, that event's details appear on their
  invite.** The event content itself is managed in the site details.
- **The wedding site and the wedding invite are the same thing** — one URL,
  carrying RSVP, maps, details, what to wear, music.
- **Every invite has RSVP buttons that feed back into the app**, so the
  planner can see who has replied.
- **See when they open the link.**

Points three and four are already true as of spec 21 — one address per
household, the RSVP form on it, answers landing in `rsvps`. What is missing is
the *per-event, per-person* control over who is invited, "invite sent" as a
visible state, and anything beyond a single first-open timestamp.

## 2. What exists today

| Piece | Where | State |
| --- | --- | --- |
| A per-event column per guest on `/guests` | `src/components/guests/guests-table.tsx` | **Read-only.** It renders `rsvps.status` — pending / yes / no / maybe — and nothing is clickable |
| Who is invited to what | `invitation_events` (invitation → event) | **Per household, set once.** It is written when invitations are created on `/invitations` and there is no screen anywhere that changes it afterwards |
| "Invite sent" | `invitations.sent_at` | Set by the email senders only. A card handed over in person leaves it null forever, and the chase logic then treats that household as never asked |
| RSVP answers | `rsvps` (guest × event, `pending`/`yes`/`no`/`maybe`) | Built. Answered on the household page, rolled up by `v_household_rsvp` |
| Opens | `invitations.opened_at` | **First open only.** Written once by `resolveInvitation()`, and never updated again |
| Section-level analytics | `site_visits` | Table exists, nothing writes to it (spec 14's known gap) |

Three consequences worth stating before designing on top:

1. **Invited-ness is a household fact and answers are a person fact.** The
   grid already shows one column per event per *guest*, so the screen already
   implies a per-person model that the data does not have.
2. **"Sent" is a household fact too**, and it is not an RSVP status — it lives
   in a different table from Yes/No. Any control that offers both in one
   dropdown is writing to two places, and should say so in its own code.
3. **Nothing is removable.** The platform rule is no destructive writes to
   guest data. Un-inviting somebody who has already answered must leave the
   answer reconstructable, which §5 takes seriously.

## 3. Decided — 2026-09-20

**Granularity: household default, per-guest override.** Ticking a household
into an event invites everyone in it; individuals can then be excluded (the
kids are not at the evening do) or added (only Grandma comes to the brunch).
The planner chose this over a pure per-guest model knowing the cost: two
sources of truth that can disagree, which §4 resolves with one view and one
rule rather than by hoping.

**"Invite sent" is automatic with a manual override.** The senders set it, and
a "mark as sent" on the row does the same for anything posted or handed over,
so the grid never claims somebody has not been asked when they have.

**A mixed household sees per-person lines under each event.** The event is
listed once, with who it is for spelled out underneath, and the RSVP form
offers only the people actually invited. Nothing is hidden and nothing is
implied.

**The invitation email carries one-tap Yes / No buttons** that open the
household's page with the answer applied, ready to adjust.

**Opens are logged individually** — first, last and how many — because the
difference between "never looked" and "looked five times and still has not
replied" is the difference between two entirely different chasing decisions.

## 3a. Answered — 2026-09-20, round two

The six questions from §10, with what each one costs.

**Q1 — "Maybe" stays.** A guest who genuinely does not know yet will
otherwise simply not reply, and "no reply" is indistinguishable from being
ignored, having lost the link, or never having received it. Maybe is at least
a signal that they read it. The caterer's number comes from Yes, as it always
did.

**Q2 — the page names only who an event is for.** "For Chidi and Ada", never
"(Zara isn't invited to this one)". The household page is as likely to be
scrolled by the child as by the parent, and a page that lists a named child's
exclusion in writing is a thing the couple cannot take back. The RSVP form
underneath offers only the invited, so the fact is still unambiguous where it
has to be.

**Q3 — chasing stays at household level**, now reading the per-event rule: a
household is outstanding while any invited person has any unanswered event.
One email covers all of it. Per-event chasing was declined — it needs
per-event reminder tracking to avoid chasing twice for the same thing, and it
turns one nudge into several.

**Q4 — a decline offers an optional message.** After the No is saved, the page
asks "Anything you'd like to say?" and takes no for an answer.

> **Where that message is stored, decided while specifying:** not a new
> column. `rsvp_answers` already stores free text per household with a
> `question_scope` of `household`, and `/questions` and the household screen
> already render those answers. So the decline note is a built-in
> household-scope question, seeded per wedding, hidden from the normal
> question list. It arrives where the planner already looks instead of in a
> field only one screen knows about.

**Q5 — no section analytics.** `site_visits` stays the empty table spec 14
left. "Did they open it" answers the chasing question that was actually
asked; counting which sections named guests read is a different kind of data
to be holding about people who cannot opt out of being on a guest list.

**Q6 — the grid stays a flat list of people.** One row per guest, as today.
Household-level ticking happens on the household screen and through the
column-header bulk action (§5); a grouped, expandable grid would be a second
navigation model on a screen whose filters and selection bar already work.

---

## 4. The model: one effective answer to "is this person invited?"

Two tables, one view, one rule.

- **`invitation_events` stays as it is**: the household's invitation, per
  event. Editing it is the normal case — "the Okonkwos are coming to the
  evening do" — and it keeps meaning what it means today.
- **A new `guest_event_overrides`** records the exceptions, and only the
  exceptions: `(wedding_id, guest_id, event_id, invited boolean)`. A row
  saying `false` removes one person from an event their household is invited
  to; a row saying `true` adds one person to an event it is not.
- **`v_guest_event_invites`** resolves the two into the single fact every
  other query should read:

```
invited := coalesce(override.invited, household_is_invited)
```

Why an exceptions table rather than materialising a row per guest per event:
changing the household's invitation has to keep working on everybody who has
not been singled out. With materialised rows, "add the Okonkwos to the
brunch" becomes a fan-out write that silently re-invites the child somebody
deliberately removed last week. With exceptions, the deliberate act survives
the bulk one, which is the behaviour a planner expects and the one that is
hard to reconstruct once it is wrong.

**Everything downstream reads the view, never the two tables.** The RSVP page,
the pending-row creation, the chase logic, the exports, the counts on
`/guests/rank` and the budget's per-head figures. A second place computing
`coalesce()` by hand is how the screen and the caterer's number start
disagreeing.

## 5. The status ladder, and what a cell does

One cell in the `/guests` grid, one guest, one event. Its state is derived,
in this order:

| State | Where it comes from | Reads as |
| --- | --- | --- |
| **Not invited** | not invited per §4 | An empty cell — deliberately the quietest thing on the screen |
| **Invited** | invited, household's invitation not sent | "Invited" |
| **Invite sent** | invited, `invitations.sent_at` set | "Sent · 12 Mar" |
| **Yes / No / Maybe** | `rsvps.status` for that guest and event | The answer, in the colours the grid already uses |

**Clicking a cell opens a small menu, it does not cycle.** Six states behind a
cycling click is a guessing game, and two of the transitions (un-inviting
somebody who has answered; marking as sent) are not things to do by accident.

The menu offers: Invite / Remove from this event / Mark invitation as sent /
Yes / No / Maybe / Clear their answer. Which of those appear depends on the
current state, and two of them carry a confirm (§7).

**Bulk, because 80 households is the real case:** the column header invites or
removes everyone for that event; the existing selection bar on `/guests` does
the same for the selected rows; and the household screen keeps a checkbox per
event as the "everyone here" control. The spec is deliberately not adding a
second grid — the one on `/guests` becomes the thing that was always implied.

**Where "sent" is written.** `sent_at` is per household, not per event, so
"Mark invitation as sent" on any cell sets it for the household and every cell
of theirs changes at once. The menu says so in as many words ("Marks the whole
invitation as sent"), because a per-event control that quietly writes a
household fact is exactly the kind of thing that erodes trust in a screen.

## 6. What the guest sees

The rule this spec owns, which spec 23 renders:

> An event's details appear on a household's page when at least one person in
> that household is invited to it, and the page names who it is for whenever
> that is not everybody.

Concretely, on `/w/<wedding>/<household>`:

- **Nobody invited → the event does not exist.** No line, no "not invited"
  marker. This *changes spec 14 §6's decision* to list every event and mark
  the ones the household is not invited to. That decision was made when
  invited-ness was a household fact and the alternative was a guest hearing
  about the dinner from somebody else; with per-person invites the marked-list
  approach produces the worse artefact — a page that tells a child, by name,
  which party they are not at.
- **Everybody in the household invited → today's rendering**, unchanged.
- **Some of them invited → the event, then a line naming who it is for**, and
  an RSVP form offering exactly those people:

```
Evening party        8:00pm
The Old Barn
For Chidi and Ada

  Chidi Okonkwo   [ Yes ] [ No ]
  Ada Okonkwo     [ Yes ] [ No ]
```

**The page never names who is *not* invited** (Q2). "For Chidi and Ada" is
the whole statement. The form below offers only those two, so nobody can
mistake who may answer, and no child reads their own name next to a party
they are not at.

**The on-the-day notes (spec 21 §5.4) follow the same rule**, per person: a
note attached to an event is only ever read by somebody invited to it.

## 7. Un-inviting somebody who has already answered

The case the platform rule exists for. A guest says yes to the evening do, the
numbers come back from the venue, and they have to come off it.

- **The RSVP row is kept.** It stops being counted, because every count reads
  `v_guest_event_invites`, but it is not deleted and not overwritten. A guest
  cut after invitations went out has to remain reconstructable — that is the
  rule from `docs/wedding-platform-spec.md`, and this is precisely the
  situation it was written for.
- **The action carries a confirm** naming what they said: "Ada answered Yes to
  the evening party on 3 April. Remove her from it anyway?"
- **Pending rows are created and removed freely**, since a `pending` row
  carries no statement from a guest. They are derived from the view.
- **Nothing is sent automatically.** Telling somebody they are uninvited is
  not a job for a cron.

## 8. One-tap RSVP from the email

The email's buttons link to the household's own address carrying an intent:

```
/w/ray-and-olivia/okonkwo-4f7ak?reply=yes
```

Three rules, each preventing a specific way this goes wrong:

1. **It only fills what is unanswered.** A pending row becomes the tapped
   answer; a row that already says something keeps saying it. A forwarded
   email tapped by the wrong person cannot overwrite a considered reply.
2. **It applies to every event that person is invited to, and to every guest
   in the household who has not answered** — then the page says exactly what
   it did, in a banner, with everything editable underneath: "We've marked
   Chidi and Ada as coming to all three. Change anything below."
3. **It is idempotent and it is not a credential.** `?reply=` is a hint
   applied to a page the reader already had the address for; it grants
   nothing, and re-tapping changes nothing.

A "No" tap does the same in reverse, and then offers an optional message
(Q4): "That's a shame — we've marked you as unable to come. Anything you'd
like to say?" with an empty box and no requirement to fill it. The note is
stored as a household-scope `rsvp_answers` row against a built-in question, so
it shows up on the household screen and in `/questions` beside every other
answer rather than somewhere only this feature knows about.

## 9. Knowing they looked

**A new `invitation_views` table**, one row per open:

```sql
create table public.invitation_views (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  household_id  uuid not null,
  viewed_at     timestamptz not null default now(),
  source        text not null     -- 'address' | 'token' | 'email'
);
```

What it deliberately does not hold: no IP address, no user agent, no
fingerprint. The question being answered is "has this household looked at
their invitation", and everything beyond that is data held on named guests for
no reason anybody could defend at the time it leaked.

Three rules make the number honest:

- **A refresh is not a second open.** Views from the same household inside 30
  minutes collapse into one.
- **The planner's own preview never counts.** "Preview as them" on the
  household screen opens the page in a mode that logs nothing. Without this
  the feature reports the planner back to themselves, which is both useless
  and, the first time it happens, actively misleading.
- **`invitations.opened_at` stays** as the first-open stamp, so nothing that
  reads it today changes. `last_viewed_at` and `view_count` are derived.

**Where it shows:** the household row on `/invitations` gains "Opened 4 times ·
last 2 days ago"; the household screen gains the short timeline; and the
dashboard's existing invitation tiles gain a "sent, opened, never replied"
segment, which is the list worth chasing and is currently impossible to
produce.

Per-section analytics (`site_visits`) stay unbuilt, deliberately (Q5). The
table remains as spec 14 left it: present, empty, and not read.

## 10. Open questions — all answered, 2026-09-20

| # | Question | Answer |
| --- | --- | --- |
| 1 | Does "Maybe" survive? | **Yes** — kept, on the grid and for guests |
| 2 | Does the page say who is *not* invited? | **No** — it names only who it is for |
| 3 | Do reminders become per event? | **No** — chase the household until everything is answered |
| 4 | Does a decline ask why? | **An optional message**, stored as a household-scope answer |
| 5 | Per-section analytics? | **No** — `site_visits` stays empty |
| 6 | Does the grid group by household? | **No** — it stays a flat list of people |

**Nothing here is built.** The answers settle the design; the build starts
when the planner says so, in words that mean it.

## 11. Schema sketch — not to be built yet

```sql
-- 00NN_per_event_invites.sql
create table public.guest_event_overrides (
  wedding_id  uuid not null,
  guest_id    uuid not null,
  event_id    uuid not null,
  invited     boolean not null,
  created_at  timestamptz not null default now(),
  primary key (guest_id, event_id),
  foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  foreign key (event_id, wedding_id) references public.events (id, wedding_id) on delete cascade
);

create view public.v_guest_event_invites as ...   -- the coalesce, once
-- + RLS on the table, keyed to wedding_id, tested with a second account
-- + v_household_rsvp recreated to count from the view, not from invitation_events

create table public.invitation_views (...);       -- §9
-- + index (wedding_id, household_id, viewed_at desc)
-- + v_household_rsvp (or a sibling view) gaining last_viewed_at, view_count
```

Both tables carry `wedding_id` and RLS, per the platform rules, leaf tables
included.

## 12. Build order, if it is authorized

0. Migration: `guest_event_overrides`, `v_guest_event_invites`,
   `invitation_views`, and the rebuild of `v_household_rsvp` onto the view.
   SQL tests for the coalesce rule, the RLS, and "an answered row survives an
   un-invite".
1. `src/lib/invites.ts`: the effective-state function (§5's ladder) as pure
   logic over rows, unit-tested, used by both the grid and the page.
2. The grid: clickable cells, the menu, the column-header bulk action, the
   confirms. The selection-bar path reuses the same action.
3. The page: per-person lines under each event, the RSVP form narrowed to the
   invited, the on-the-day notes narrowed the same way.
4. One-tap replies: `?reply=` on the household address, the banner, the fill
   rules, the buttons in the invitation email, and the optional decline note
   (which needs the built-in household-scope question seeded per wedding, and
   a backfill for weddings that already exist).
5. Open logging: the write, the 30-minute collapse, the preview exclusion, and
   the three places it shows.

Steps 0–3 are the feature. 4 and 5 are each independently useful and can ship
in either order.
