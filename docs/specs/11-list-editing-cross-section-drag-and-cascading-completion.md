# Feature spec: Editable list titles, drag-and-drop between sections, and completing a task closes its sub-tasks

**Status: proposed, not built.** Three requests about the same screen
(`/lists/[id]`) and the same action file (`src/server/actions/lists.ts`),
each small on its own but each with at least one real decision behind it —
per `docs/specs/README.md`, nothing here is built until §4's questions have
answers.

**Not to be confused with spec 13, part A** — renaming the *nav entry*
"Lists" to "Tasks" (a terminology change, no schema, no per-list data). This
spec is about renaming an *individual list's own title* ("Wedding Day" →
"Wedding Day (final)"), which is a different, narrower thing. Read both
before answering either — the wording the planner used ("list names
editable," "rename lists to tasks") bundles the two together, and they
don't have to ship together.

**Depends on:** Spec 1 (lists, sections, sub-items — `lists.title`,
`list_sections`, `list_items.parent_item_id`), spec 10 (`sortCompletedLast`,
which every part of this spec renders on top of unchanged). All already
built.

## 1. What this changes

### A. A list's own title becomes editable

`updateList` in `src/server/actions/lists.ts` already accepts a `title`
patch — `listFields` validates it, nothing about the server side needs to
change. What's missing is a place to type one in. Today a list's title
renders as plain text in exactly two places:

- `/lists/[id]`'s header (`ListDetail`, `list-detail.tsx` line 138) — an
  `<h1>`, no click handler.
- `/settings`'s "List appearance" row (`ListAppearanceEditor` →
  `ListAppearanceRow`, `list-appearance-editor.tsx` line 48) — a
  `<span className="truncate">`, sitting next to that same row's already-
  editable color swatches and icon field.

Both become `InlineText` (`src/components/guests/inline-text.tsx`, already
used across the guest screens for exactly this — click, an input appears,
Enter or blur saves, Escape cancels) wired to `updateList(list.id, {
title })`. No new component, no new action.

### B. Dragging a task between sections

Today's drag-and-drop (`SectionGroup` in `list-detail.tsx`) is scoped to one
section's own `DndContext` — its `order` state, its own `SortableContext`,
its own `reorderItems` call. A task can be dragged up and down within the
section it's already in, and moved to a different section only through the
full edit form's `section_id` select. There is no way to drag a card out of
"Ceremony" and into "Reception."

This makes that a drag, using the same dnd-kit primitives `BoardView`
already uses for a conceptually identical problem (moving a card between
three fixed containers) generalised to however many sections a list has:

- One `DndContext` per list (lifted from `SectionGroup` up into
  `ListDetail`), each section rendering as its own droppable/sortable
  container, tracking which section a dragged card is currently hovering
  over during `onDragOver` (dnd-kit's documented "multiple containers"
  pattern) so the card visually moves into the section it's over before the
  drop, not just on drop.
- A new server action, `moveItemToSection(itemId, sectionId, orderedIdsInDestinationSection)`
  — `reorderItems` alone can't do this because it never touches
  `section_id`, only `sort_order`. The new action sets `section_id` and
  renumbers the destination section the same way `reorderItems` renumbers
  today (`(index + 1) * 10`); the section the card left needs no renumbering
  since `sort_order` doesn't need to be contiguous, only ordered.
- **Sub-items stay out of this entirely**, same as `BoardView`'s existing
  rule ("a sub-item ... moving here is not possible — one level of nesting
  only"). `ListDetail`'s `topLevel` filter already excludes them from
  section grouping; this drag only ever picks up a `topLevel` card. Moving a
  parent to a new section does **not** rewrite its sub-items' own
  `section_id` — that column is already vestigial for a sub-item (§2,
  `subItemsByParent` renders every sub-item under its parent regardless of
  the sub-item's own `section_id`, and always has), so leaving it stale
  costs nothing and touching it would be a second write for no visible
  effect.
- A touch-friendly fallback is needed — this app's standing rule (spec 3
  §7 decision 6): every drag gesture gets a non-drag way to do the same
  thing. `BoardView`'s pattern is a "move to…" `<select>` on the card,
  since there's no "next" container among named columns; the same shape
  fits here — a "Move to section ▾" select alongside the existing Move
  up/down buttons, disabled (or absent) on a list with only one section.

### C. Completing a task closes its sub-tasks with it

Marking a parent item done today (`setStatus(itemId, "done")`) only ever
touches that one row. Its sub-items, if it has any, are left exactly as
they were — the planner has asked twice for the opposite: ticking the
parent off should tick every sub-item off too.

This sits right next to an **existing, opposite-direction** trigger that
has to keep working: `list_items_derive_parent_status` (0005), which
already derives a *parent's* status from its children — done when none are
open moves it nowhere automatically (spec 1's own rule: "every sub-item
done" stays a manual call on the parent), part-done moves it to
`in_progress`, none-done moves it to `not_started`. That trigger fires
*after* any child's status changes and only ever writes to the *parent*. It
is not touched by this change and does not need to be — walking through
what happens once cascading writes are added:

- `setStatus` marks the parent done, then does the equivalent of `setStatus`
  on every one of its sub-items (not a bare column update — see below for
  why). Each sub-item write fires the existing trigger, which recomputes the
  parent from its children: all now done → "no automatic transition," so the
  parent's just-set `done` status is left alone. No ping-pong, no extra
  round trip needed to protect it.
- **Reopening** a parent (moving it off `done`) is the open question in §4.1
  — the planner's wording ("closes with it") only says what happens when a
  task *closes*. Symmetric behaviour (reopening the parent reopens every
  sub-item) is the more consistent default, but it's the one part of this
  section actually worth asking about before it's built, since the answer
  changes what un-checking a parent does to work someone already finished.

**Why this goes through the same logic as `setStatus`, not a raw
`update({ status: "done" })` on the children:** a sub-item can carry its own
`repeat_rule` (nothing stops it — schema-wise a sub-item is a `list_items`
row like any other) and `setStatus` already knows how to spawn that item's
next occurrence when it's completed (`spawnNextOccurrence`, same file). A
cascade that bypassed that would silently stop recurring sub-items from
recurring the moment their parent, rather than they themselves, is what
closes them. The cascade calls the same completion path per sub-item —
`done_at`/`done_by` set the same way, recurrence spawned the same way —
just triggered by the parent's own `setStatus` call instead of a separate
click on each child.

## 2. Scope

**In:**
- `InlineText` wired into `list-detail.tsx`'s `<h1>` and
  `list-appearance-editor.tsx`'s title span, both calling `updateList`.
- `src/server/actions/lists.ts`: new `moveItemToSection`.
- `list-detail.tsx`: `DndContext` lifted to `ListDetail`, multi-container
  drag tracking, a "Move to section" select per card, section renumbering
  on drop.
- `setStatus`: cascades a `done` (and, pending §4.1, a reopen) write to
  every direct sub-item of the item being changed, through the same
  completion path (status, `done_at`/`done_by`, recurrence spawn) `setStatus`
  already applies to the item itself.

**Out:**
- No change to `list_items_derive_parent_status` (0005) — it already does
  the opposite-direction job correctly and needs no edit for this to work
  (§1C).
- No change to how sub-items are grouped, filtered, or rendered — still one
  level of nesting, still excluded from section-level drag, still displayed
  under their parent regardless of `section_id` (§1B).
- No change to `/board`'s own drag-between-status-columns, which is a
  different screen with a different (status, not section) grouping.
- No bulk "close whole section" or "close whole list" control — this is
  about a task's own sub-items, not a new bulk action.

## 3. Data model

No schema change. `moveItemToSection` writes `list_items.section_id` and
`list_items.sort_order`, both existing columns; the cascade in `setStatus`
writes `status`/`done_at`/`done_by`/(recurrence spawn columns), all
existing. No migration.

## 4. Open questions — need the planner's answers before anything is built

1. **Does reopening a parent reopen its sub-items too, or only closing
   cascades?** Recommendation: yes, symmetric — un-checking a parent
   reopens every sub-item that was closed along with it. The alternative
   (closing cascades, reopening doesn't) is cheaper to explain but means a
   parent you accidentally ticked and immediately un-ticked leaves its
   sub-items marked done, which reads as a bug the first time it happens.
2. **Does a "Move to section" select exist per card (the touch fallback),
   or is drag-only acceptable given a mouse/trackpad user always has it?**
   Recommendation: build the select — it's the same one line of UI
   `BoardView` already has for exactly this problem, and this app has
   committed to a touch fallback for every drag surface so far (spec 3 §7
   decision 6, spec 10, this list's own Move up/down buttons).
3. **Do the existing Move up/down buttons ever cross a section boundary** —
   pressing "up" on the first item in a section moves it to the end of the
   previous section — **or do they stay scoped to the section they're in,
   with only drag (and the new select) able to move a card across
   sections?** Recommendation: keep Move up/down scoped to their own
   section, same as today, and let the select be the deliberate,
   named-destination way to cross a section boundary — an "up" arrow that
   sometimes jumps a card into a different section with no warning is a
   worse surprise than a select that names where the card is going.
4. **Is the settings-page rename (§1A, `ListAppearanceEditor`) wanted as
   well as the `/lists/[id]` header rename, or just one of the two?**
   Recommendation: both — `updateList` already accepts the write either way,
   and there's no reason renaming should work from one screen a list
   appears on but not the other.
