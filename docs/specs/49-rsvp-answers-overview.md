# Feature spec: RSVP answers in one place

**Status: spec only, not built.** No migration. The questions in §8 need answers before anything
is built.

**Depends on:** spec 22 (per-event invites, the built-in decline note), spec 47 (guest table
status), spec 17 (CSV export).

## 1. What was asked

"Can u create a central way to see answers for RSVP questions." It came up because there was no
way to see how many guests said yes to "do you want the bus" without writing SQL.

## 2. Story

Sam asked on the RSVP form "Will you need a seat on the bus from the hotel?" (per guest, yes/no).
Sam opens **RSVP questions → Answers** and sees: *Yes 34 · No 21 · Left blank 3 · Not replied
yet 18*. Sam clicks **Yes** and sees the 34 names, grouped by household, each linking to the
guest. Sam downloads the answers as a CSV to send to the bus company.

## 3. What's there now

- Questions live in `rsvp_questions` (`scope` guest or household; `type` short_text, long_text,
  boolean, single_select, multi_select, number). Answers live in `rsvp_answers`, one row per
  question per guest (or per household), `value` jsonb: a string, an array of strings for
  multi_select, or `null` when the RSVP was sent with the question left blank
  (`src/server/actions/rsvp.ts`, `src/lib/rsvp-answers.ts`).
- Answers are only visible one at a time: on `/guests/[id]` and `/households/[id]`
  (`src/server/queries/questions.ts`). The seating plan can colour by a single-choice answer.
- No CSV export includes answers.
- The built-in decline note (`builtin_key = 'decline_note'`) is stored as a question too.

## 4. The proposal

### 4.1 Where

A new screen, **`/questions/answers`**, linked from the top of `/questions` ("See answers →")
and from each question in the editor ("12 answers"). It sits in the same nav group as
`/questions`.

### 4.2 One card per question

In the form's own order (`sort_order`, then label). Each card shows the label, the scope, and a
summary that depends on the type:

| Type | Summary |
|------|---------|
| Yes / no | Yes *n* · No *n* |
| Choose one | One bar per option with its count, in the question's option order |
| Choose any | One bar per option (a guest can count towards several), plus how many answered |
| Number | Answered *n* · total · smallest–largest |
| Short / long text | Answered *n*, then the answers themselves, newest first |

Every card also shows two numbers that are not answers:

- **Left blank:** they sent the RSVP but did not answer this (a row with `value` null).
- **Not replied yet:** in scope (a guest, or a household, that is invited to at least one event
  and not soft-deleted) with no answer row at all.

Clicking any count, option or "Not replied yet" opens the list of who it is: name, household,
answer, when they answered, each linking to `/guests/[id]` or `/households/[id]`.

Inactive questions that have answers are shown under a "Switched off" heading, collapsed. The
decline note is shown as its own card ("Notes from people who can't come"), text type.

### 4.3 CSV

A **Download answers (CSV)** button: one row per guest who is in scope for at least one question,
columns Name, Household, then one column per question. A household question's answer repeats on
each member's row. Multi-select answers are joined with "; ". The export is a new kind,
`answers`, in `src/app/api/export/[kind]/route.ts`, so it is also in Settings' "export all" zip.

### 4.4 Phones

Cards stack; option bars are full width; the who-list is the same list, not a table. Follows the
rules in spec 48 (16px inputs, relative sideways scrollers).

## 5. Not in scope

- Editing answers on a guest's behalf.
- Charts beyond the simple bars above.
- Filtering by event (questions are not tied to an event).
- Answers in the guest table or the existing guest CSV.

## 6. Data

No migration. One read in `src/server/queries/questions.ts` (`getAnswersOverview`, wrapped in
`cache()`): the wedding's questions, all their answers, and the in-scope guests and households
(from `v_guest_event_invites`, not soft-deleted). RLS already limits all of it to the wedding.

## 7. Files (expected)

- `src/lib/questions/tally.ts` + `tally.test.ts`: pure tallying per type, blank vs not replied.
- `src/server/queries/questions.ts`: `getAnswersOverview`.
- `src/app/(planner)/questions/answers/page.tsx`, `src/components/questions/answers-overview.tsx`.
- `src/components/questions/questions-editor.tsx`, `src/app/(planner)/questions/page.tsx`: links.
- `src/app/api/export/[kind]/route.ts`: the `answers` kind.
- `src/lib/nav-groups.ts`: `/questions/answers` already matches the `/questions` prefix; check.

## 8. Open questions

1. **Where it lives.** (a) A new screen `/questions/answers` linked from RSVP questions
   *(recommended: the questions screen stays an editor)*, or (b) answers shown inline under each
   question on `/questions`.
2. **Who counts as "not replied yet".** (a) Anyone invited to at least one event *(recommended)*,
   or (b) only guests who have replied yes to something, since people who can't come may not
   matter for most questions (bus, meal).
3. **People who said no to everything.** Show their answers and blanks like everyone else
   *(recommended: simplest, and you can see who they are)*, or leave them out of the counts.
4. **The CSV.** Include it now *(recommended: it's what you'd send the bus company)*, or later.
5. **The decline note.** Show it as a card here *(recommended)*, or leave it on the household
   screen only.

## 9. Test plan

- `tally.test.ts`: each type; null value counts as blank, not as an answer; multi-select counts
  each option; a household answer is counted once, not per member; soft-deleted guests and
  guests invited to nothing are not "not replied yet"; an answer to a since-removed option still
  shows (as "other").
- Typecheck, unit tests, build; render `/questions/answers` with sample data in headless
  Chromium at desktop and iPhone width.
