# Feature spec: Tracking what's been sent, and "I already know I can't come"

**Status: proposed, 2026-10-09. Nothing is built, and nothing should be until
the planner says to build it** (`docs/specs/README.md`, `CLAUDE.md`). §10 lists
the decisions only the planner can make; each has a recommendation, none is
answered.

**Depends on:** spec 14 §12.1 (the save-the-date), spec 21 (household
addresses), spec 22 (invitations, `markInvitationSent`), `0031` (save-the-date
opens). All built. **`0026`–`0033` are not applied to the live project**, and
the migration this spec proposes (`0034`) stacks on `0031`'s view, so it cannot
be applied before them.

## 1. What was asked

Two things, one page.

**A. On `/invitations`, two manual tick boxes per household** — "Save the Date
Sent" and "Invite Sent" — so the couple can tick as they send by hand and see
at a glance who has been sent what.

**B. A way for a guest who is *certain* they can't come to say so from their
save-the-date**, so the couple can leave them off the formal invitation run.
The planner's brief, condensed:

- An optional button on each household's own save-the-date page, clearly *not*
  an RSVP. Nobody undecided is expected to touch it.
- Suggested wording (kept verbatim, see §6): *"Already know you won't be able to
  make it? While we'd be sad to miss you, we completely understand. If you're
  certain you won't be able to join us, you can let us know below, and we'll
  save you the formal invitation."* Button: **I'm unable to attend**.
- On submit: record it against the guest, mark them "Unable to Attend" (or
  equivalent), make it visible to the planning team so they can exclude the
  guest from the formal mailing. No further RSVP questions.
- Optional; no commitment asked; no RSVP wording; **anyone who doesn't respond
  stays in the invitation list by default**; reachable only through the
  guest's own save-the-date link.

## 2. What the code already has (read off the source, not guessed)

| Want | What exists | The gap |
| --- | --- | --- |
| "Invite Sent" tick | `invitations.sent_at`, shown read-only in `/invitations`' "Invite sent" column (`invitations-table.tsx`). `markInvitationSent(householdId, channel)` sets it by hand (`actions/invites.ts`), and **only forward**: it returns early if already set. | Nothing ticks from this page, and nothing can **un**-tick. A household with no `invitations` row has nowhere to hold the fact. |
| "Save the Date Sent" tick | **Nothing.** `message_log` records emailed save-the-dates only (`sendSaveTheDates`), and the planner has no guest emails and sends links by hand (`HANDOFF.md`, session 31 follow-up). The column has Copy link / WhatsApp / View / opened ×n, none of which mean "sent". | A new fact. Per **household**, and it must work for a household with no invitation — a save-the-date predates one. |
| "Unable to Attend" status | **There is no guest-level status.** Attendance is `rsvps` — one row per guest *per event*, `pending/yes/no/maybe` — and only exists where `v_guest_event_invites` says the guest is invited. | A new, separate fact — see §4 for why it is *not* an RSVP row. |
| Public write with no login | The save-the-date page is keyed by the household's address (`slug` + `slug_suffix`, the credential — spec 21 §3). `logSaveTheDateView` is the only public write on it today, and it stores nothing about the reader. | The first public write on this page that changes guest data. |

## 3. Part A — the two tick boxes

### 3.1 Data

- **Save the Date Sent:** `households.save_the_date_sent_at timestamptz null`.
  Household-level, on `households` rather than `invitations` precisely so a
  household with no invitation can be ticked.
- **Invite Sent:** **no new column — reuse `invitations.sent_at`.** It is
  already what the dashboard tiles, the `sent`/`unsent`/`silent` filters, the
  "N sent" header and the reminder cron read. A second "sent" fact would
  disagree with them. The tick calls the existing `markInvitationSent` and a
  new `clearInvitationSent` (see Q5).

### 3.2 Screen

On `/invitations`, in the two columns that already exist:

- **Save the date** column: a checkbox **"Save the Date Sent"** above the
  existing Copy link / WhatsApp / View buttons. Ticked, it shows the date
  ("Sent 3 Oct"). The opened/×count line stays as it is.
- **Invite sent** column: today a read-only relative time. It becomes a
  checkbox **"Invite Sent"** with the date beside it. A household with no
  invitation shows the box disabled with "No invitation yet" (the
  *Create invitations* panel above is the way in).

Both tick via a server action and a transition, like every other control in
this table. **Copying or opening a link does not tick anything** — "sent" is the
planner's word, not a side effect of a button; the whole point is that they
send by hand.

Also: two filters beside the existing four (`?status=std_unsent`,
`?status=unable`) and the header line gains "· N save-the-dates sent". The
existing "Households with nothing sent yet" (`unsent`) keeps meaning *invitation*
unsent.

### 3.3 Where the two agree

`sendSaveTheDates` (email) stamps `save_the_date_sent_at` for each household it
reaches, so the box and the email log never contradict each other. The
invitation email path already stamps `sent_at`.

## 4. Part B — "I'm unable to attend"

### 4.1 Why this is not an RSVP row

The obvious move is to write `rsvps.status = 'no'`. It is wrong here, for the
reasons the brief itself gives:

1. **It would be an RSVP.** `v_household_rsvp` would count it as *answered*, so
   `/invitations`' "Answers" column, the "fully answered" header, the
   "opened but silent" list and the chasing cron would all change meaning on the
   strength of a message that explicitly isn't one.
2. **It usually can't be written.** `rsvps` rows are per invited event; at
   save-the-date time many households have no invitation and no
   `invitation_events`, so there is no row to put it on.
3. **It would show up later pre-filled.** The household's invitation page
   would open with a "No" already given.

So it is its own fact:

- `guests.unable_to_attend_at timestamptz null`
- `guests.unable_to_attend_via text null`, `check (… in ('save_the_date','planner'))`,
  with a check that the two are **both set or both null** (the same
  half-a-pair trap `0032` hit and its SQL test caught).

Cleared by setting both to null — it is a flag on a guest, not guest data being
destroyed, and `deleted_at` stays the only way a guest is ever removed. The
planner can set or clear it by hand too (the person who texts "we can't make
it" is the same case), which is what `via = 'planner'` records.

### 4.2 What a guest sees

On `/w/<wedding>/<household>/save-the-date`, below the card, a quiet block — set
apart, no form chrome, no "RSVP", "confirm", "reply" or "required" anywhere:

> Already know you won't be able to make it? While we'd be sad to miss you, we
> completely understand. If you're certain you won't be able to join us, you can
> let us know below, and we'll save you the formal invitation.
>
> **[ I'm unable to attend ]**

Then, because a mis-tap costs the guest their invitation (§4.3):

- **Single-guest household:** one confirming step — "Let us know you can't come?
  [Yes, I'm unable to attend] [Go back]".
- **Multi-guest household:** the same step lists the household's names, **all
  pre-ticked**, "Who can't come?" — so a couple where only one can't come isn't
  forced into all-or-nothing, and the common case is still one tap and one
  confirm. This is the only extra step and it asks nothing about attendance.

After saving: *"Thank you for letting us know — we'll miss you. [names] won't be
sent a formal invitation. Changed your mind? [Undo]"* — and **Undo works from
the same link**, because the guest has no other way to correct it.

Nothing is shown to a household that has already declined except that same
confirmation/undo state, so reloading never presents the question again as if
unanswered.

### 4.3 Rules the build has to keep

1. **Never a GET.** The write is a button press → server action, exactly like
   the one-tap reply and the view logger (`HANDOFF.md`, session 27): mail
   scanners and link previewers fetch every URL in a message, and a write on
   page load would decline households nobody heard from. The guard against
   anyone "simplifying" this is a test, not a comment.
2. **The client sends no guest ids it isn't checked on.** The action takes
   `(weddingSlug, address, guestIds[])`, resolves the household through the same
   throttled path as the page (`resolveHouseholdAddress`), and writes only to
   guests of *that* household. A guessed id from another household changes
   nothing. Service-role write, like the view logger — guests are planner-only
   under RLS and `anon` is revoked.
3. **Idempotent.** Declining twice writes once and keeps the first timestamp
   (the useful date, as `markInvitationSent` already does).
4. **No `rsvps` rows, and `response_state`, "Answers" and the chase cron's
   inputs are untouched** by this feature.
5. **An RSVP outranks it.** If a flagged guest later answers *Yes* on an
   invitation, the flag is not silently cleared and not silently believed: the
   planner sees both. The flag says "told us in advance"; the RSVP is the answer.
6. **A forwarded link is the same risk the RSVP form already carries** (it can
   decline on a family's behalf). The mitigations are that it is reversible by
   the link-holder and the planner, and visible to the planner the moment it
   happens (§4.4). No new credential is introduced.

### 4.4 What the planner sees

- **`/invitations`:** in the Save the date column, a chip — "Can't attend: Ana,
  Ben" (or "All can't attend" when every guest is flagged) with the date and
  whether it came from the guest or the planner. The `unable` filter (§3.2)
  lists them.
- **`/households/[id]`:** the same chip, plus the planner's own toggle per
  guest — set it for someone who told you in person; clear it if they change
  their mind.
- **`/guests`:** a small marker on the guest's row/cell (build step 5, the
  smallest piece to drop if the scope is too big).

### 4.5 "Exclude them from the formal invitation" — what that touches

Default stays **in** (the brief's rule). "Excluded" means *flagged and not
swept up by a bulk action*, never removed:

| Where | Change |
| --- | --- |
| `/invitations` → "Select all N without one" | skips households where **every** guest is flagged |
| `/invitations` → "Create for N selected", per-household **Send** | a household with any/every flagged guest asks for a confirm that names them ("Ana has told us she can't come — send anyway?") |
| `sendInvitation` / bulk email, `loadTargets` | skips an all-flagged household and *reports* the count (the same "report, don't silently send fewer" rule `loadTargets` already follows) |
| Print stationery (`/invitations/print/stationery`) | all-flagged households are left out by default, with a visible "N left out" and a way to include them |
| Reminder cron (`/api/cron/reminders`) | an all-flagged household is not chased |
| Broadcast segments | unchanged — a broadcast is the planner's deliberate choice of audience |

A partly-flagged household (one of two can't come) is **still invited** — the
others are coming. The flagged person is simply marked on the page that invites
them, so the planner can choose to leave their name off the card.

## 5. Schema — `0034_save_the_date_tracking.sql` (proposed, additive)

```sql
alter table public.households
  add column save_the_date_sent_at timestamptz;

alter table public.guests
  add column unable_to_attend_at  timestamptz,
  add column unable_to_attend_via text
    check (unable_to_attend_via in ('save_the_date', 'planner')),
  add constraint guests_unable_pair
    check ((unable_to_attend_at is null) = (unable_to_attend_via is null));
```

and `CREATE OR REPLACE VIEW public.v_household_rsvp`, **appending** (a replaced
view may only append, `0031`'s own note): `std_sent_at`
(`h.save_the_date_sent_at`), `guest_total` and `unable_count` (active guests,
and those flagged). Both existing columns on the view keep their meaning.

- No new table, so no new RLS surface; `wedding_id` is already on both tables.
- `guests` must be checked for any view that lists its columns explicitly.
- Nothing enum-related, so the 55P04 single-transaction rule (`0016`) does not
  apply. `scripts/check-migrations.sql` and the migrations README get the usual
  entry.
- `src/lib/types/database.ts` gains the columns by hand.

## 6. Wording

The guest-facing text above is the planner's, used as written. Two small flags,
not changes: "we'll save you the formal invitation" promises something the
planner then has to do (§4.5 is how the software makes that easy, not automatic),
and the heading line deliberately avoids the word "RSVP". The block's text and an
on/off switch live in the save-the-date designer (Q9), stored in the existing
`site_content['save_the_date']` payload, so it needs no migration of its own.

## 7. Files this would touch

`supabase/migrations/0034_*.sql`, `supabase/tests/17_save_the_date_tracking.sql`;
`src/lib/save-the-date/unable.ts` (+ test: who counts as "all flagged", the
chip wording, what a bulk action skips); `src/server/actions/save-the-date.ts`
or a new `…-reply.ts` (guest-side decline/undo); `src/server/actions/invites.ts`
(`setSaveTheDateSent`, `clearInvitationSent`, planner toggle);
`src/lib/site/save-the-date.ts` (payload gains the block's text + switch);
`save-the-date/page.tsx`, a new client component beside `card.tsx`;
`invitations-table.tsx`, `invitations/page.tsx`; `stationery.ts`,
`print/stationery/page.tsx`, `cron/reminders/route.ts`; the household page.

## 8. Build order (once authorized)

1. `0034` + SQL tests (the both-or-neither check; RLS with a second account).
2. Pure logic in `src/lib` + unit tests.
3. Part A: the two ticks, un-tick, filters, header count, and the email stamp.
4. Part B guest side: the block, the two-step confirm, the action, undo.
5. Part B planner side: chip, filter, household toggle, then the bulk-action
   guards in §4.5, then the `/guests` marker.

Steps 3 and 4–5 are independent; Part A is the smaller and can ship alone.

## 9. Test plan

`npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
`./scripts/verify-bootstrap.sh`, the single-transaction check, `npm run build`.
Beyond those, specific assertions:

- the decline action **rejects a guest id from another household** and from
  another wedding;
- declining twice keeps the first timestamp; undo clears both columns;
- **no `rsvps` row is written and `v_household_rsvp.response_state`,
  `rsvp_answered` are identical before and after** (the guard on §4.1);
- a plain GET of the page writes nothing;
- an all-flagged household is skipped by "Select all without one", the email
  sender, stationery and the cron — and a partly-flagged one is not.

Then, honestly: this repo has never run against the live project and the
save-the-date page has only ever been looked at on a throwaway harness. The
guest block — a public write on a page forwarded around group chats — is
exactly the thing that needs a real phone before it is trusted.

## 10. Open questions — all unanswered

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | **Per person or per household?** The page is one link per household; the brief says "against their individual guest profile". | **Per person**, via the pre-ticked names step (§4.2). One tap + one confirm for the common case; no all-or-nothing for mixed households. |
| 2 | **Excluded how hard?** Hard-block a flagged household from the invitation run, or flag and guard? | **Flag and guard** (§4.5): skipped by bulk actions, confirmed on individual ones, never impossible. The brief's "stay in by default" and "so they can exclude" point the same way. |
| 3 | **Headcount.** Should a flagged guest drop out of catering/seat numbers (`budget_guest_population`, `v_wedding_stats`)? | **Not in this spec.** Those read invited-ness from `v_guest_event_invites`, and folding a *maybe-still-invited* flag into it would reach the grid, the budget and the CSV at once. Say the word and it is its own small spec. Until then the numbers still include them. |
| 4 | **Invite Sent without an invitation row.** Reuse `invitations.sent_at` (consistent with the dashboard, filters and cron, but the box is disabled until an invitation exists) or add `households.invite_sent_at` (works anywhere, but a second "sent" fact)? | **Reuse `sent_at`.** One truth beats a tick that works everywhere and disagrees with the dashboard. |
| 5 | **Un-ticking Invite Sent.** Ticking arms the reminder cron for that household, because `sent_at` is what arms it (already true of `markInvitationSent`). Is that wanted for a hand-sent card, and should an un-tick clear `sent_at` (and with it the chase clock)? | Yes to both: it is the existing meaning, and a mis-tick has to be undoable. The tick leaves `channel` as it was rather than guessing. |
| 6 | **Date on the ticks.** Stamp "now" only, or let the planner back-date ("I sent these last week")? | **Now only, shown as a date.** Back-dating can wait for someone to ask. |
| 7 | **Notify the planner?** An email/push when a household declines? | **No.** It appears on `/invitations` and the household page; the planner is in that screen anyway. |
| 8 | **Undo window.** Link-holder can undo any time, or only until the invitation goes out? | **Any time.** Once an invitation exists the RSVP is the real answer (§4.3.5), and blocking undo would strand a changed mind. |
| 9 | **Switch and wording in the designer.** Is the block on by default for every save-the-date, with the text editable? | **On, editable**, in `/invitations/save-the-date` beside the message — optional for the couple as well as the guest. |

## 11. Left out on purpose

Reading the planner's brief for what it didn't ask: a guest **name field** or
free-text reason (it asks the guest for nothing), a **waitlist/replace-them**
step when someone declines (the multi-cut tiers in spec 5 already own that), any
**reminder** to a household that hasn't responded (the brief says they shouldn't
be expected to), and emailing the guest a receipt (the planner has no guest
emails).
