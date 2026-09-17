# Feature spec: Linking budget items to a task-list section

**Status: proposed, not built.** Extends spec 6 §7's linking model with the
one grain it explicitly left out.

**Depends on:** Spec 6 (budget management, `budget_item_tasks`,
`budget_item_lists`, `v_budget_item_tasks`, the "Linked tasks" popup), spec
6.1 (the "Link a task…" search). Both already built.

## 1. What this changes

Spec 6 §7 built two link grains — a whole `list` and an individual
`list_item` — and explicitly scoped section-level linking out as "a finer
grain than asked for... a natural later addition if it turns out to
matter" (§7, "Out"). That later addition is what's being asked for now:
"Reception decor" (a section inside a bigger "Decor" list) should be able
to link to the Decor budget line without linking the whole list (which
would also pull in "Ceremony decor," a different budget line) or every
item inside it one by one.

**New join table**, same shape as the two spec 6 already has:

```
budget_item_sections   wedding_id, budget_item_id, section_id, created_at
                        -- PK (budget_item_id, section_id)
```

- Composite FKs: `(budget_item_id, wedding_id)` → `budget_items`,
  `(section_id, wedding_id)` → `list_sections` — same tenancy pattern
  every other join table in this app already follows.
- `v_budget_item_tasks` (spec 6 §7) gains a third source: every item whose
  `section_id` matches a linked section counts as linked "via section,"
  the same way an item in a linked *list* already counts as linked "via
  list." The view's `linked_via_list` boolean becomes a small enum
  (`direct | via_list | via_section`) rather than adding a second parallel
  boolean, so the popup can still tell the three apart in one column.
- The "Linked tasks" popup (`/budget`'s `BudgetLinksPopup`) gains a third
  search box, "Link a section…" — same type-to-filter/click-to-link
  pattern the existing "Link a list…" / "Link a task…" boxes already use,
  searching across every section in every active list.
- The reverse badge: a linked section's own heading
  (`list-detail.tsx`'s `<h2>`) shows the same small 💰 badge a linked list
  or linked item already shows, clicking through to `/budget?item=<id>`
  exactly like the existing two do.

## 2. A decision, not an open question

**Does linking a section put the 💰 badge on every item inside it, the way
a linked whole list does?** No — only the section heading gets the badge.
A linked *list* badges every item inside it because the whole list
genuinely is that budget line (spec 6's own example: a "Reception" list
relevant to one or more budget lines in full). A linked *section* is a
narrower claim — "this part of a bigger list is about this budget line" —
and badging every item under it would make three different link sources
(direct item link, via-list, via-section) visually indistinguishable on
the item itself, which is the exact confusion the `linked_via_list`
distinction already exists to avoid at the list level. Keeping the section
badge on the heading only, and item-level badges reserved for direct item
links (as today), keeps each badge legible about which of the three things
actually produced it.

## 3. Scope

**In:**
- `budget_item_sections` join table + RLS (added to the tenant policy
  array in the same migration).
- `v_budget_item_tasks` extended with the `via_section` case, joined
  through `list_sections.list_id` to reach the item's list/title context
  the same way the existing two cases already do.
- `BudgetLinksPopup`: "Link a section…" search + unlink control.
- `list-detail.tsx`: 💰 badge on a linked section's heading, clicking
  through to `/budget?item=<id>` (same query param the item/list badges
  already use to open that line's popup on load).

**Out:**
- No item-level badge change — see §2.
- No cascading effect from a section link, same "purely descriptive, no
  amount/date copied either direction" rule spec 6 §7 already states for
  the other two grains.
- No change to `budget_item_tasks` or `budget_item_lists` — this adds a
  third table alongside them, doesn't touch either.

## 4. Data model

```
budget_item_sections   wedding_id, budget_item_id, section_id, created_at
                        PK (budget_item_id, section_id)
```

One migration: the new table, its RLS policy, `tenant_tables` array entry,
and the updated `v_budget_item_tasks` (or a new sibling view if changing
the existing one's column shape is judged too disruptive to whatever
already reads `linked_via_list` as a plain boolean — worth checking at
build time rather than assuming the enum swap is free).

## 5. Test plan

- SQL: cross-wedding RLS assertion for `budget_item_sections`
  (`supabase/tests/01_tenancy.sql`), plus a `v_budget_item_tasks`
  assertion covering all three link sources at once (`supabase/tests/03_budget.sql`).
- Browser pass: link a section to a budget line, confirm the section
  heading badge appears and every item in that section shows up in the
  "Linked tasks" popup marked "via section," distinct from an item linked
  directly or via its whole list.
