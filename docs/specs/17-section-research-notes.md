# Feature spec: "Add research under a section" — needs one clarification before this can be scoped

**Status: proposed, not built — genuinely ambiguous, see §1.** This is the
one item from the planner's list that this spec can't turn into a build
plan without a direct answer first; everything else in this round (specs
15, 16, 18, 19, 20) has a concrete interpretation. Written up separately
so it doesn't block the rest.

**Depends on:** Spec 1 (lists/sections/items). Already built.

## 1. Three things "research under a section" could mean

`list_items` already has `title`, `notes`, `url`, and `due_date` (spec 1
§5), and a section is already just a grouping of ordinary items
(`list_sections`) — so depending on which of these is meant, the gap
ranges from "nothing to build" to "a new kind of content."

**A. A free-text notes area attached to the section itself**, separate
from its checklist — e.g. a "Ceremony decor" section gets a small
"Research" text block above its list of tasks, for jotting links, ideas,
and half-formed thoughts that aren't yet a to-do with a due date. This is
new: `list_sections` currently has no notes field at all, only `title` and
`sort_order`.
- Would need: `list_sections.research_notes text`, nullable, editable
  inline the same way a section title becomes editable (spec 15 §A).
- Simplest option, and the best fit for "research" read as reference
  material rather than an action item — closest to how a real wedding
  binder has a "notes" page facing a "to-do" page for the same category.

**B. A distinct item type within a section** — alongside ordinary
checklist items, a "research" item that behaves differently: no checkbox,
no due date, maybe just a title, a note, and a link, rendered visually
apart from the actionable tasks in the same section (a "Research" subgroup
under "Ceremony decor," next to the normal task list).
- Would need: either a `list_items.kind` discriminator
  (`task | research`, alongside the existing `lists.kind`) or a real
  second table. More schema, and a second row-shape the whole
  timeline/board/smart-view machinery would need to know to exclude
  (`v_timeline_items`, `/board`, "Today"/"Scheduled" — none of them should
  surface a research note as if it were due).

**C. Nothing new at all — just make the existing `url`/`notes` fields on
an ordinary item easier to use for this.** `list_items.url` and
`list_items.notes` already exist per spec 1's schema, but neither is
obviously exposed on the add-item form today (item-row.tsx's inline
add is title-only; a note/link gets added, if at all, through `updateItem`
with no dedicated field in the UI). If the real ask is "let me park a link
and a note under a section without it needing a due date," that's mostly
a UI gap on an already-generic row, not new schema — add a URL field to
the item editor, done.

## 2. Why this needs an answer rather than a guess

**B** is real new schema and a new row-shape threaded through every
screen that reads `list_items`. **A** is one column and one inline-edit
wire-up, the same size as spec 15's other three items. **C** might be no
schema at all. Building the wrong one means either over-building (B, when
A would've done) or shipping something that doesn't actually solve what
was meant (A or C, when the planner pictured research items sitting
*inside* the task list as their own rows, not off to the side in a notes
box).

## 3. Recommendation

**A** — a per-section notes field — best matches the phrase "research
*under a section*" (singular, attached to the section, not to an item),
costs the least, and doesn't touch anything time/status-aware that the
timeline, board, or smart views already reason about. If what's actually
wanted is closer to B or C, say so and this spec gets rewritten before
anything is built — same process as spec 8 and spec 9.1's Pinterest half,
which sat unbuilt until their own open questions were answered.

## 4. Open question

**1. Which of A, B, or C (or something else) is meant by "research under a
section"?** Blocks everything past this point — no migration, no screen,
until this is answered, per this repo's own spec process
(`docs/specs/README.md`).
