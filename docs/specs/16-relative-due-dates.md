# Feature spec: Calculated due dates ("Event − 2 weeks") instead of only a fixed date

**Status: proposed, not built — needs the open questions below answered
before any schema lands.**

**Depends on:** Spec 1 (`list_items.due_date`, `lists.event_id`,
`weddings.wedding_date`), already built.

## 1. What this changes

Today a `list_items.due_date` is always a fixed calendar date. The one
place this app already computes a date from an offset is template
generation (spec 1 §5a: `offset_days` against `weddings.wedding_date`,
applied **once**, at generate time, onto an ordinary `due_date` column).
That doesn't help here — the planner is asking to set a date as "2 weeks
before the wedding" on any ordinary item, at any time, and have it *stay*
correct if the wedding date later moves. That needs the offset to be a
live relationship, not a one-off calculation.

**New column:**

```
list_items   due_date_offset_days integer, nullable
             -- non-null: due_date is calculated, not fixed.
             -- negative = before the anchor date, positive = after,
             --   0 = on the anchor date itself.
```

- When `due_date_offset_days` is null, `due_date` behaves exactly as it
  does today — a fixed date, editable and clearable per spec 15 §D.
- When it's set, `due_date` becomes a value the app keeps in sync with the
  anchor date rather than something typed directly — the two are mutually
  exclusive per item, matching how the color-or-emoji request (spec 19)
  treats its own pair of fields. Typing a fixed date directly into an item
  that currently has an offset clears the offset (it becomes fixed again);
  choosing "relative" on an item that currently has a fixed date clears
  that date and starts the offset picker at 0.
- The UI (`ItemRow`'s date row) gets a small toggle: "Fixed date" /
  "Relative to the wedding," the second showing a signed number-of-weeks
  input (stored internally as days) plus the computed date, read-only,
  next to it — "2 weeks before → Sat 30 May 2026."

## 2. The open questions this can't ship without

**1. Anchor: the wedding date only, or also a list's own linked event
date?** `lists.event_id` already exists (spec 1) — a list can already be
tied to a specific event rather than the wedding as a whole. "Event − 2
weeks" in the planner's own wording could mean *the wedding* (the only
"the event" this app currently treats as singular) or *whichever event the
item's list is scoped to* when one is set, falling back to the wedding
date otherwise. This changes the column shape: a single `wedding_date`
anchor needs nothing extra; a per-item-list anchor needs the recompute
logic to resolve through `lists.event_id` instead of a fixed table.

**2. How does the recompute actually happen when the anchor date
changes?** Two shapes, same result:
   - **A database trigger** on `weddings` (and `events`, if question 1
     answers "also events") that walks every `list_items` row with a
     non-null `due_date_offset_days` and rewrites `due_date` whenever the
     anchor column changes. Stays correct no matter what ever changes the
     date — direct SQL, a future script, anything — matching this
     codebase's existing precedent for cross-row consequences
     (`list_items_derive_parent_status`, 0005).
   - **App-layer recompute** inside the one action that already changes
     `weddings.wedding_date` (`src/server/actions/settings.ts`) — simpler
     to write and read, but only stays correct as long as that's the only
     write path, which is true today but is an assumption a trigger
     doesn't need to make.
   Recommend the trigger, for the same reason `0005`'s parent-status
   derivation is a trigger and not a call embedded in every action that
   could touch a child's status — but this is a real complexity/robustness
   trade-off, not a detail to decide while building.

**3. Do sub-items get this too, or only top-level items?** Nothing about
`parent_item_id` makes this harder for a sub-item — a sub-item already
carries its own `due_date` today (spec 1 §5a). Likely "yes, same field,
same rule, no special case," but confirming before building saves a
sub-item-specific carve-out nobody actually wants.

**4. What does the picker show: weeks, days, or both?** The planner's own
examples ("Event − 2 weeks," "Event − 4 weeks") suggest weeks are the
natural unit for this specifically, while the underlying column is in
days for precision (a "3 days before" case shouldn't need "0.43 weeks").
Recommend a single number input labelled "weeks before/after," storing
`value * 7` — with a "custom (days)" fallback only if the planner actually
wants finer-than-week control, which nothing in the request suggests.

## 3. Scope

**In (once the above is answered):**
- `list_items.due_date_offset_days integer`, nullable.
- Recompute logic (trigger or app-layer, per question 2) resolving the
  anchor date (per question 1) and rewriting `due_date`.
- `ItemRow`'s fixed/relative toggle and week-offset input.
- `v_timeline_items` needs no change — it already just reads `due_date`,
  whatever produced it.

**Out:**
- No per-item custom anchor beyond "the wedding" or "this item's list's
  event" (question 1) — no picking an arbitrary third date as the anchor.
- No change to template generation's own `offset_days`/`template_key`
  columns — those stay exactly as spec 1 built them; this is a parallel,
  always-live mechanism for ordinary items, not a replacement.
- No UI for relative *recurrence* — spec 1's `repeat_rule` and this
  feature don't interact; an item can have one or the other kind of date
  logic, and recurrence's own next-occurrence math is untouched.

## 4. Test plan (once built)

- Unit: recompute logic in isolation — offset applied against a wedding
  date, against an event date (if question 1 says yes), a wedding date
  that's still unset (no crash, `due_date` stays null until it is), and
  switching an item between fixed and relative in both directions.
- SQL (if a trigger, per question 2): an assertion that changing
  `weddings.wedding_date` rewrites every affected `list_items.due_date` in
  the same transaction.
- Browser pass: set an item to "2 weeks before the wedding," confirm the
  computed date is right and shows on `/timeline`; change the wedding date
  in `/settings`; confirm the item's due date moved with it without
  touching the item itself.
