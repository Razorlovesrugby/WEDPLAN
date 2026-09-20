# Feature spec: Budget — how much of a section's allocation is spoken for, and one estimate column instead of two

**Status: built end to end, session 24 (2026-09-20).** All five questions
answered the same day (§11) — question 5 on the planner's agreement with
the recommendation, questions 1-4 when they answered "Build please" to the
offer of taking §8's recommendations on the rest. §12 has the build notes.
No migration: §11 decision 3 kept this a pure function over rows `/budget`
already loads, so no SQL changed at all.

**Two halves, from one round of feedback on the same screen**, shippable
independently: §1-§6 add a per-section allocation total ("does 38+30+42 add
to 100?"), and §7 collapses spec 19's duplicated "Allocated" and
"Estimated" figures into one column.

**Depends on:** spec 19 (overall budget, percentage allocations,
allocation-derived estimates), built session 23 and currently unmerged on
`claude/wedding-budget-percentages-o0v9kw`. This spec is a direct follow-up
to it and is branched from that work, not from `main`.

## 1. What this solves

The planner's ask, in their own words:

> There's nothing to show under each section, how much of that section I've
> allocated, i.e. does 38+30+42 add to 100? At the moment I'm having to
> manually calc, even something at the top of the section to show how much
> of that allocation is remaining.

Spec 19 shipped two percentage levels and a total for exactly one of them.
At the **wedding** level, `/budget`'s header answers "have I allocated all
of it?" — *allocated 97% · $1,200 unallocated*. At the **category** level
it doesn't: you can give Drinks' three lines 38%, 30% and 42%, and nothing
on the page tells you that's 110%.

(It is 110%. That the answer isn't obvious from reading the three numbers is
the entire point of this spec.)

So the feature is one figure per category, in the place the planner asked
for it — the top of the section — saying how much of that section's
allocation its lines have claimed between them, and how much is left.

**Why this is a real gap rather than a nicety:** the arithmetic is the whole
job of the allocation feature. A percentage split you can't check is a
percentage split you stop trusting, and the fallback — adding the numbers up
by hand every time one changes — is the spreadsheet behaviour spec 6 set out
to replace.

## 2. Scope

**In:**
- A **section allocation summary** at the top of each category on `/budget`:
  what its lines' percentages add up to, what that is in money, and what's
  left over (or what it's over by).
- The **over-100% case** made obvious, in the same warn-don't-block posture
  spec 19 §12 decision 3 set for the wedding level: 110% saves fine and says
  so; nothing is ever refused or auto-scaled.
- A count of the lines in the section that carry **no percentage at all**,
  so "88% allocated" is never misread as "the other 12% is free" when three
  un-percentaged lines are also drawing on the same money.
- A **live hint while typing a percentage** in the item editor: what this
  line's percentage would take the section to.
- **Collapsing spec 19's "Allocated" and "Estimated" figures into one
  column** (§7) — the same number printed twice on any line with no typed
  estimate. A display fix; the underlying `effective_estimated` model is
  already exactly what the planner describes.

**Out, explicitly:**
- **No enforcement, no auto-balancing, no "distribute the remainder"
  button.** Same reasoning as spec 19: the planner is mid-thought while
  these numbers are wrong, and a tool that fights them there is worse than
  one that just says what the total is.
- **No new "remaining" concept on the money side.** This spec's "remaining"
  is *unallocated* — the part of the section's target no line has claimed.
  It is not "under budget", which is current-versus-target and already
  shipped in spec 19's rollup. §4 is explicit about keeping the two apart,
  because conflating them is the obvious way to get this wrong.
- **No change to how any figure is computed.** `allocated_amount`,
  `effective_estimated`, `computed_current` and every total are exactly as
  spec 19 built them. This spec only adds up numbers that already exist.
- **No wedding-level change.** The header block already answers this
  question for categories; §6 only aligns its wording with the new
  per-section line so the two read as the same idea at two grains.

## 3. Implementation: no schema, no view, no migration

**Recommendation: build this entirely in existing code, with one pure
function and one UI block.** No migration, no view change, no new query.

`/budget` already loads every line for every category
(`listBudgetItems`, grouped into `itemsByCategory` in
`src/app/(planner)/budget/page.tsx`), and every line already carries
`allocation_pct` and `allocated_amount` from spec 19's `v_budget_items`. The
figure is a sum over rows the page is already holding.

The alternative — four more columns on `v_budget_category_totals`
(`lines_allocated_pct`, `lines_allocated_amount`, `lines_unallocated_amount`,
`unallocated_line_count`) — is a migration, a recreated view, new SQL
assertions and a type change, to produce numbers that can't disagree with the
ones already on the page because they're derived from the same rows. It earns
its keep only when something *other* than `/budget` needs the figure: the
dashboard tile, an export, a digest line. Nothing does today.

This is the "prefer the smallest correct change" rule in `CLAUDE.md` applied
literally, and §8 question 3 is where the planner can overrule it if they
already know a second surface is coming.

**What gets added:**

```
src/lib/budget.ts    sectionAllocation(lines, categoryTarget) -> {
                       allocatedPct,          // 110 in the planner's example
                       allocatedAmount,       // the money those %s claim
                       remainingPct,          // -10 when over
                       remainingAmount,       // negative when over
                       withPct,               // lines carrying a %
                       withoutPct,            // lines carrying none
                     }
```

Pure, null-safe, unit-tested beside the rest of the budget math — same
module, same convention, and the same reason it lives there: the item
editor needs the answer live while typing, without a round trip.

## 4. The two "remaining"s, kept apart

A category already has one figure that sounds like this one and is not it.
Both will be on screen at the same time, so they need different words:

| Figure | Question | Where it comes from | Shipped? |
| --- | --- | --- | --- |
| **Left to allocate** | "Of Drinks' $3,200, how much has no line claimed?" | Target minus the sum of its lines' allocations | New, this spec |
| **Under/over budget** | "Of Drinks' $3,200, how much are we actually on track to spend?" | Target minus `total_current` (spec 19's rollup) | Spec 19 |

They move independently and that's correct, not a bug to reconcile: a
section can be 100% allocated and still tracking under (every line came in
cheaper than its share), or 70% allocated and already over (the three lines
that do exist are expensive). The wording in §5 keeps "allocate" attached to
the first and "over/under" to the second.

## 5. Worked example

Drinks, allocated 8% of a $40,000 budget = **$3,200**, with the planner's own
three lines:

| Line | Allocation | Amount |
| --- | --- | --- |
| Alcohol | 38% | $1,216 |
| Non-alcoholic | 30% | $960 |
| Glassware hire | 42% | $1,344 |

At the top of the section:

> **110% of Drinks allocated** · $3,520 of $3,200 · **$320 over-allocated**

and if the same three had been 38 / 30 / 22:

> **90% of Drinks allocated** · $2,880 of $3,200 · **$320 (10%) left to
> allocate**

With a fourth line carrying no percentage, a second clause appears:

> 1 line has no % set — its estimate isn't counted above.

That last line is the one piece of this that isn't arithmetic, and it's
there because "90% allocated" plus an un-percentaged $900 catering line is a
genuinely misleading screen without it.

## 6. Screens

| Route | What's new |
| --- | --- |
| `/budget`, per category | One line at the top of the section (in `CategoryHeader`, above the existing target/current rollup): the percentage its lines add to, in money, and what's left to allocate — or what it's over-allocated by, in the same `tierB` warning colour spec 19 uses for over-budget. Only appears when at least one line in the section has a percentage. |
| `/budget`, per category, no target | When the category has a `%` but the wedding has no overall budget, the percentage half still shows ("lines add to 110%") and the money half is omitted — the same degradation spec 19 already applies everywhere else. |
| `/budget`, item editor | Under the existing "10% of Drinks ($3,200) = $320" hint, one more clause: "takes Drinks to 110%" — computed live from the other lines plus whatever is currently typed, so an over-allocation is visible before saving rather than after. |
| `/budget`, header block | Wording only: the existing wedding-level "allocated 97% · $1,200 unallocated" is reworded to match the new per-section line ("97% of the budget allocated · $1,200 left to allocate"), so the same idea reads the same way at both grains. No logic change. |

No new route, no new component file — `CategoryHeader` and
`BudgetItemFields` both already exist and already receive what this needs,
except for the category's own line list (§3).

## 7. One estimate column, not two

A second piece of feedback from the same round, on the same screen:

> Also tbh can combine the "estimate" with the "allocated" — don't need
> both showing. Estimate should only override if typed in, otherwise it
> shows the calculation from allocated.

**This is correct and the current row is the mistake.** Spec 19 shipped
`/budget`'s line as six figures — Allocated, Estimated, Quoted, Contracted,
Current, Outstanding — and on a line with no typed estimate, the first two
are *the same number printed twice*. Worse on a GST-exclusive line, where
they are the same number twice with a 15% gap between them (allocated $480,
derived estimate $417.39), which reads as a discrepancy rather than as the
deliberate ÷1.15 of spec 19 §4.

The planner's rule is already exactly how the data works — spec 19's
`effective_estimated` *is* "typed if typed, else derived from the
allocation", resolved in the view. The row just failed to show it that way:
it put the source and the result side by side instead of showing one
figure. So this is a display fix, not a model change — nothing about
`allocated_amount`, `effective_estimated` or `estimate_source` moves, and
no SQL is touched.

**What changes:**

- The **Allocated column is removed.** The row goes back to five figures:
  Estimate, Quoted, Contracted, Current, Outstanding — the shape it had
  before spec 19, which is also why the six-column variant never sat right.
- The **Estimate column shows `effective_estimated`**: what was typed, else
  what the allocation implies, marked "from allocation" when derived. Spec
  19 already ships that marker and its muted styling; both stay.
- **The target is not lost when an estimate is typed.** A line with both
  gets a small secondary note under the figure — `allocated $320` — so the
  number being worked against stays on screen without a column of its own.
  See §8 question 5.
- On a **GST-exclusive line**, the column shows the estimate figure
  ($417.39), not the all-in allocation, because it sits in a row with
  Quoted and Contracted, which are all as-typed, pre-GST figures on such a
  line. The note then reads `allocated $480 all-in`, reconciling the two in
  words rather than leaving them looking wrong.
- The per-line variance line ("$320 over its allocation") is unchanged, and
  the basis note already carries "10% of Drinks" — so the allocation stays
  visible in two other places regardless.

**This amends spec 19's §6 screens table** (the "Allocated" figure it added
to `BudgetItemRow`). Spec 19 needs a one-line pointer to this section
rather than a rewrite: its model is right, only its row layout changes.

## 8. Open questions

1. **Does the section summary count only lines with a percentage, or should
   an un-percentaged line's estimate count against the section's
   allocation too?**
   *Recommend percentages only*, with the "1 line has no %" note as the
   safety valve (§5). The planner asked a percentage question ("does
   38+30+42 add to 100?") and mixing a money figure into that sum makes the
   headline number unable to answer it. The alternative — a blended
   "$2,880 of $3,200 spoken for, including lines without a %" — is a
   defensible different feature, and would replace the percentage headline
   rather than sit next to it.

2. **Where exactly does it go: above the existing rollup bar, or folded into
   it?** *Recommend a separate line directly above it*, because §4's two
   "remaining"s are different questions and one line saying both would be
   the confusing version. The planner said "something at the top of the
   section", which this satisfies either way.

3. **Pure function, or four new columns on `v_budget_category_totals`?**
   *Recommend the pure function* (§3) — no migration, nothing that can
   disagree with the page's own numbers. Answer "the view" if a second
   surface is coming that will need this figure (a dashboard stat, an
   export), because retrofitting it later means touching the view anyway.

4. **Should an over-allocated section be more than a coloured line — a
   banner, a blocked save, anything louder?** *Recommend no*: the line, in
   the warning colour, and nothing else. Spec 19 §12 decision 3 already
   settled warn-don't-block for the wedding level, and being over 100% while
   mid-edit is normal.

5. **When a line has both a typed estimate and an allocation, does the
   target still show anywhere on the row?** **Answered 2026-09-20 — yes,
   the secondary note. See §11.** *Recommended yes, as §7's small
   secondary note* (`allocated $320`). Dropping it entirely is simpler and
   is what the feedback literally asks for, but then a line you have quoted
   no longer shows what it was *meant* to cost — the comparison the whole
   allocation feature exists to make — and the variance line beneath it
   would reference a number that is not on screen.

## 9. Build order

Small enough to be one sitting, but it splits cleanly if it needs to:

1. `sectionAllocation` in `src/lib/budget.ts`, with unit tests (§10) — the
   planner's 38/30/42, an exactly-100 case, an under case, lines with no
   percentage, an empty section, and no category target at all.
2. The summary line in `CategoryHeader`, with the category's lines passed in
   from `/budget`'s existing `itemsByCategory` grouping.
3. The live "takes Drinks to 110%" clause in `BudgetItemFields`.
4. The header block's wording alignment (§6, last row).
5. §7's column collapse: drop the Allocated figure from `BudgetItemRow`,
   point the Estimate figure at `effective_estimated`, add the secondary
   `allocated $320` note, and add the pointer to spec 19's §6 screens
   table. Independent of steps 1-4 — it can ship first, and is the smaller
   of the two halves.
6. `npm run typecheck`, `npm test`, `npm run build`. **No
   `verify-migrations.sh` run is needed if §8 question 3 keeps the pure
   function** — nothing touches SQL. That flips the moment the answer is
   "the view".

## 10. Test plan

- **Unit (`src/lib/budget.test.ts`)**: `sectionAllocation` over the
  planner's own three lines (38 + 30 + 42 → 110%, $3,520 of $3,200, $320
  over); the same three at 38 / 30 / 22 (90%, $320 and 10% left); exactly
  100% (zero remaining, and specifically *not* reported as over); a section
  where every line has no percentage (a zero sum that is distinguishable
  from "no lines at all"); a section with no target, where the percentage
  sum is still right and every money field is null; a fractional percentage
  (12.5 + 12.5) summing without float drift.
- **Component-level reasoning, not a test**: this repo has no component
  test harness (`docs/HANDOFF.md` §8 — pure logic is where tests live), so
  the rendering is covered by the browser pass rather than by a new testing
  dependency added for this.
- `npm run typecheck`, `npm test`, `npm run build`. §7 adds no logic —
  `effective_estimated` and `estimate_source` are spec 19's, already
  asserted in `budget.test.ts` and `supabase/tests/03_budget.sql` — so it
  needs no new unit test, only the browser check below.
- **Browser pass** (still never yet possible — no live Supabase project has
  ever been connected): set Drinks to 8% of a $40,000 budget, add the three
  lines at 38/30/42, confirm the top of the section reads 110% and $320
  over-allocated in the warning colour; edit glassware to 22%, confirm it
  reads 90% and $320 left; add a fourth line with no percentage, confirm the
  "1 line has no %" note appears and the headline percentage doesn't move;
  clear the wedding's overall budget, confirm the percentage half survives
  and the money half disappears; type 50 into a line's allocation field and
  confirm the "takes Drinks to …%" hint updates before saving.
- **Browser pass, §7**: on a line with an allocation and no typed estimate,
  confirm one Estimate figure marked "from allocation" and no Allocated
  column anywhere; type an estimate, confirm it replaces the figure and the
  `allocated $320` note appears beneath it; clear it again, confirm the
  derived figure and its marker come back; on a GST-exclusive line, confirm
  the column shows the pre-GST estimate and the note says what the
  allocation is all-in.

## 11. Answered (2026-09-20)

**Question 5 — the target stays on the row, as a secondary note.** The
planner agreed with the recommendation as §7 and §8 state it:

- A line with a **typed estimate and an allocation** shows one Estimate
  figure (the typed one) with a small secondary note beneath it —
  `allocated $320`. No second column, and no loss of the number the line is
  being measured against, which is what the variance line beneath it
  already refers to.
- A line whose estimate **is** the allocation shows the derived figure with
  spec 19's existing "from allocation" marker and no note — the note would
  restate the figure directly above it, which is the duplication §7 exists
  to remove.
- On a **GST-exclusive** line the note reads `allocated $480 all-in`,
  reconciling in words the 15% gap between the pre-GST estimate in the
  column and the all-in allocation it was derived from.

Nothing else in the spec changes: §7's column collapse is otherwise as
written, and no figure's computation moves.

**Questions 1-4 — the recommendation on each, same day.** Asked whether to
take §8's recommendations on the remaining four, the planner answered
"Build please", which settles them as recommended and authorizes the build:

1. **The section percentage counts only lines that carry a percentage**, with
   the "n lines have no % set" note as the safety valve. The headline answers
   the question actually asked ("does 38+30+42 add to 100?"), and a line with
   no percentage is reported separately rather than blended into that sum.
2. **The summary is its own line, directly above the existing rollup bar** —
   §4's two "remaining"s are different questions and one line saying both
   would be the confusing version.
3. **A pure function, no migration and no view change.** Nothing outside
   `/budget` needs the figure today; the four-column
   `v_budget_category_totals` alternative stays written up in §3 for
   whenever something does.
4. **An over-allocated section is a coloured line and nothing louder** — no
   banner, no blocked save, matching spec 19 §12 decision 3.

## 12. Build status (2026-09-20)

Built in §9's order, immediately after §11's answers.

**Pure logic** — `sectionAllocation(lines, categoryTargetAmount)` in
`src/lib/budget.ts`: the percentage its lines claim, that figure in money
(summed from each line's own rounded allocation, so it always equals what
the rows print), what's left of 100%, and the counts of lines with and
without a percentage. 8 new unit tests, including the planner's own
38/30/42.

**Screens** — a new `SectionAllocationSummary` inside `CategoryHeader`,
rendered above the existing rollup bar and only once at least one line in
the section carries a percentage; the "takes Drinks to 110%" clause in
`BudgetItemFields`, fed by a `siblingAllocationPct` prop computed once per
category in `/budget`'s page; `BudgetItemRow`'s six figures collapsed back
to five per §7; and the wedding-level header reworded to match ("$32,000 of
the budget allocated", "Left to allocate" / "Over-allocated").

**No SQL, no query, no action changed.** The whole feature reads
`allocation_pct` and `allocated_amount`, which spec 19's `v_budget_items`
already returns to a page that already loads every line.

**Verification actually run this session:** `npm run typecheck` (clean),
`npm test` (481 tests, up from 473), `npm run build` (clean, 30 routes),
and `./scripts/verify-migrations.sh` (250 assertions, unchanged — run to
confirm nothing regressed, not because anything here touches SQL).

**Not verified, same caveat as every session since 12:** nothing has run
against a live Supabase project, and nothing has been opened in a browser.
§10's browser passes are outstanding in full — which matters more than
usual here, because both halves of this spec are *only* presentation.
