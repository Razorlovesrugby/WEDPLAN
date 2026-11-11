# Feature spec: RSVP answers in one place

**Status: built (2026-11-11), branch `claude/funny-goldberg-4u6zsj`, no PR.** Migration `0047`
fixes a bug that stopped any answer being saved (§11). All questions in §8 are answered (§10).

**Depends on:** spec 22 (per-event invites, the built-in decline note), spec 47 (guest table
status), spec 17 (CSV export).

## 1. What was asked

"Can u create a central way to see answers for RSVP questions." It came up because there was no
way to see how many guests said yes to "do you want the bus" without writing SQL.

## 2. Story

Sam asked on the RSVP form "Will you need a seat on the bus from the hotel?" (per guest, yes/no).
Sam opens **RSVP questions**. Under the question it says: *Yes 34 · No 21 · Left blank 3 · Not
replied yet 18*. Sam clicks the question's results and sees every answer; clicking **Yes** narrows
it to the 34 names, grouped by household, each linking to the
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

### 4.1 Where: on the question, then click in

Each question on **`/questions`** shows its results summary (§4.2) directly under it, so the
results are visible without leaving the page. The summary is a link to
**`/questions/[id]/answers`**, the question's own results screen: the same summary at the top,
then everyone's answer (name, household, answer, when), grouped by answer. Clicking a count or
option on either screen opens `/questions/[id]/answers` filtered to that answer.

### 4.2 The summary, per question type

| Type | Summary |
|------|---------|
| Yes / no | Yes *n* · No *n* |
| Choose one | One bar per option with its count, in the question's option order |
| Choose any | One bar per option (a guest can count towards several), plus how many answered |
| Number | Answered *n* · total · smallest–largest |
| Short / long text | Answered *n* (the answers themselves are on the results screen, newest first) |

Every summary also shows two numbers that are not answers:

- **Left blank:** they sent the RSVP but did not answer this (a row with `value` null).
- **Not replied yet:** in scope (a guest, or a household, that is invited to at least one event
  and not soft-deleted) with no answer row at all.

On the results screen each name links to `/guests/[id]` or `/households/[id]`. An answer to an
option that has since been removed from the question is shown as itself, under "Other".

Inactive questions with answers stay on `/questions` (it already lists them) with their summary.
The decline note gets a results screen too, linked from `/questions` as "Notes from people who
can't come".

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

Migration `0047` adds plain unique indexes on `rsvp_answers (question_id, guest_id)` and
`(question_id, household_id)`: the RSVP form's upserts cannot use 0001's partial indexes, so
without it no answer is saved (§11). One read in `src/server/queries/questions.ts` (`getAnswersOverview`, wrapped in
`cache()`): the wedding's questions, all their answers, and the in-scope guests and households
(from `v_guest_event_invites`, not soft-deleted). RLS already limits all of it to the wedding.

## 7. Files (expected)

- `src/lib/questions/tally.ts` + `tally.test.ts`: pure tallying per type, blank vs not replied.
- `src/server/queries/questions.ts`: `getAnswersOverview`.
- `src/components/questions/answer-summary.tsx`: the summary, used on both screens.
- `src/app/(planner)/questions/page.tsx`, `src/components/questions/questions-editor.tsx`: the
  summary under each question.
- `src/app/(planner)/questions/[id]/answers/page.tsx`: the results screen.
- `src/app/api/export/[kind]/route.ts`: the `answers` kind.
- `src/lib/nav-groups.ts`: `/questions/[id]/answers` already matches the `/questions` prefix; check.

## 8. Open questions

None. All answered in §10.

## 9. Test plan

- `tally.test.ts`: each type; null value counts as blank, not as an answer; multi-select counts
  each option; a household answer is counted once, not per member; soft-deleted guests and
  guests invited to nothing are not "not replied yet"; an answer to a since-removed option still
  shows (as "other").
- Typecheck, unit tests, build; render `/questions` and `/questions/[id]/answers` with sample data in headless
  Chromium at desktop and iPhone width.

## 10. Answered (2026-11-11)

1. **Where:** the results summary sits on each question on `/questions`, and clicking it opens
   that question's own results screen with everyone's answer (§4.1). Rejected: a separate
   all-questions answers screen.
2. **Not replied yet** counts everyone invited to at least one event.
3. **People who said no to everything** are counted like everyone else.
4. **The CSV** is included.
5. **The decline note** is listed on `/questions` like any question, so it has a summary and a
   results screen.

Questions 2–5 took the recommended option when the planner said "build the fix in — and the way
to view it".

## 11. Build status (2026-11-11)

**The bug.** No RSVP question answer had ever been saved. `submitRsvp` upserts with
`onConflict: "question_id,guest_id"` / `"question_id,household_id"`; the only unique indexes on
those columns were partial (`where guest_id is not null`), which Postgres cannot use as an
ON CONFLICT arbiter without the same WHERE clause, so every insert failed with 42P10, and the
action ignored the error and told the guest it had worked. Answers given before `0047` is applied
are not recoverable; guests have to answer again. `0047` adds the plain indexes; the action now
checks every write and fails visibly.

**Checked across the app.** Every `onConflict` target in `src/` (24 of them) was run as
`INSERT … ON CONFLICT` against the migrated schema: only the two above failed. Unchecked writes
were reviewed: three user-facing ones now check their result (a guest cancelling coach seats,
a guest removing their photo, which now deletes the row before the file as the planner's
removal does, and the second half of a seat swap). The rest are deliberate best-effort
housekeeping after the main write (`message_log` status, `opened_at`/`first_response_at`/
`sent_at` stamps, view counters, token-attempt rows, a duplicate song vote).

**Built:** `src/lib/questions/tally.ts` (counting, filter keys), `src/lib/questions/export.ts`
(the CSV), `getAnswersOverview` in `src/server/queries/questions.ts` (paged past the 1000-row
cap), `AnswerSummary`, the summary on `/questions`, `/questions/[id]/answers?answer=<key>`, and
the `answers` export kind (also in the zip). Option bars are full width on a phone.

**Verified:** typecheck, 1424 unit tests, `npm run build`, the SQL suite with
`28_rsvp_answer_upsert.sql` (777 assertions; that file fails with 42P10 when `0047` is removed),
the summary and results list rendered with sample data in headless Chromium at 1280px and an
emulated iPhone 13 (no sideways scroll). **Not verified:** live Supabase, the results screen
with real data, a real phone.
