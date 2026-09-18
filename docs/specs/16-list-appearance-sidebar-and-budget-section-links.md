# Feature spec: List appearance, sidebar cleanup, and budget links at the section level

**Status: built, same session.** `0017_budget_section_links.sql`
(`budget_item_sections`, `v_budget_item_tasks`'s `linked_via_list` boolean
replaced with a `link_source` enum-shaped text ranking direct > via_list >
via_section, and `v_timeline_items` gaining `list_icon` for §2's
calendar/timeline cards). The sidebar's Move up/down buttons are gone,
replaced by a live outstanding-item count (`getOpenItemCounts`); a list's
color and icon are mutually exclusive everywhere a list's identity renders
(sidebar, `/lists/[id]`'s header and section-badge, `ItemRow`'s list badge,
`TaskPreviewPopup`, `/calendar`, `/timeline`, `/board`, and
`ListAppearanceEditor`, which now disables its swatch strip while an icon
is set); the "Linked tasks" popup gained a "Link a section…" search and a
"Linked sections" list, and a linked section badges its own `/lists/[id]`
heading. `npm run typecheck`, `npm test` (384 tests), `verify-migrations.sh`
(198 SQL assertions, +6 for this migration), `verify-bootstrap.sh`, and
`npm run build` all pass. Not opened against a live project or a real
browser. **One deliberate scope boundary beyond what's written below:** the
reminder digest email's own list-color left-border accent
(`src/lib/email/templates.ts`) is untouched — it isn't one of the sites §2
names, and extending it would mean threading an icon through
`v_reminders_due`/`DigestItem`, a separate, well-tested pipeline this pass
didn't touch.

**Depends on:** Spec 3 (`list.color`, `list.icon`), spec 6 / 6.1 (budget
linking — `budget_item_tasks`, `budget_item_lists`,
`v_budget_item_tasks`), spec 7 (`LIST_COLOR_PALETTE`), spec 12
(`ListsSidebar`'s drag + Move up/down). All already built.

## 1. Drop the sidebar's ↑/↓ buttons for an outstanding-task count

`SortableListLink` (`lists-sidebar.tsx:146`) renders a drag handle (⠿), the
list link, and Move up/down buttons — spec 12 built the buttons as a
touch-friendly fallback. The drag handle plus dnd-kit's own keyboard
sortable interaction (already wired via `KeyboardSensor`) cover reordering
without them, so the buttons come out.

In the space they occupied: a small numeric badge showing that list's
outstanding (not-done) item count, **including sub-items** — a sub-item is
a real, separately completable thing, and excluding it would undercount a
list that leans on sub-tasks. This needs a new per-list count alongside
whatever query already feeds `ListsSidebar`'s `lists` prop (`list_items`
grouped by `list_id` where `status != 'done'`).

## 2. A list is either a color or an emoji, never both

Every place a list's identity renders (`ListsSidebar`, `item-row.tsx`'s
list badge, `calendar-view.tsx`, `timeline-view.tsx`, `board-view.tsx`,
`ListAppearanceEditor`) currently shows the color dot *and* the icon at
once when both are set. This makes them mutually exclusive: icon wins when
one is set, color dot shows otherwise. No schema change — `lists.color`
and `lists.icon` already exist independently; this is a rendering rule
("icon if set, else color dot") applied consistently at every site above.

In `ListAppearanceEditor`, the color swatch strip becomes visually
disabled (not removed) while an icon is set, so it's clear which one is
"on"; clicking a swatch while an icon is set clears the icon, and vice
versa — picking one is choosing "not the other," not a silent no-op.

## 3. Linking a budget item to a section

Spec 6 §7 built two link grains — a whole list, and an individual task —
and explicitly scoped section-level linking out as "a natural later
addition if it turns out to matter." That addition: a decor budget line
should be able to link to just the "Reception decor" section of a bigger
"Decor" list, without pulling in "Ceremony decor" (linking the whole list)
or every item one by one.

```
budget_item_sections   wedding_id, budget_item_id, section_id, created_at
                        PK (budget_item_id, section_id)
```

Same shape and tenancy pattern as `budget_item_tasks`/`budget_item_lists`.
`v_budget_item_tasks`'s `linked_via_list` boolean becomes a small enum
(`direct | via_list | via_section`) so the "Linked tasks" popup can still
tell all three apart in one column. The popup gains a third search box,
"Link a section…," same type-to-filter pattern as the existing two.

**Decided: a linked section badges its own heading only, not every item
inside it.** A linked *list* badges every item because the whole list
genuinely *is* that budget line; a linked *section* is a narrower claim,
and badging every item under it would make three link sources
indistinguishable on the item itself — the exact confusion
`linked_via_list` already exists to prevent at the list level.

## 4. Scope

**In:**
- `lists-sidebar.tsx`: remove the Move up/down buttons; add the
  outstanding-count badge and its backing query.
- Icon-over-color rendering rule at every site in §2; `ListAppearanceEditor`'s
  disabled-while-icon-set swatch strip.
- `budget_item_sections` table + RLS, the `v_budget_item_tasks` enum
  change, the popup's "Link a section…" search, and the section-heading
  💰 badge in `list-detail.tsx`.

**Out:**
- No change to `reorderLists` or drag behavior itself (§1) — only the
  redundant buttons come out; the five smart views stay non-reorderable
  and get no count badge, same boundary spec 12 already drew.
- No item-level badge from a section link (§3) — see the decision above.
- No cascading effect from any link — purely descriptive, same rule spec
  6 §7 already states for the other two grains.

## 5. Data model

```
budget_item_sections   wedding_id, budget_item_id, section_id, created_at
                        PK (budget_item_id, section_id)
```

One migration: the new table, its RLS policy, the `tenant_tables` array
entry, and the updated `v_budget_item_tasks`. §1 and §2 need no schema
change — both are query/rendering work over existing columns.

## 6. Test plan

- `npm run typecheck`, `npm test`, `npm run build`.
- SQL: cross-wedding RLS assertion for `budget_item_sections`
  (`supabase/tests/01_tenancy.sql`), plus a `v_budget_item_tasks`
  assertion covering all three link sources at once
  (`supabase/tests/03_budget.sql`).
- Browser pass: confirm the sidebar shows a live outstanding count and no
  arrows, dropping to 0 as items are ticked off; set an icon on a list and
  confirm its color dot disappears everywhere the list's identity shows,
  then clear the icon and confirm the original color returns; link a
  section to a budget line, confirm the section heading badge appears and
  the "Linked tasks" popup marks it "via section," distinct from a direct
  or via-list link.
