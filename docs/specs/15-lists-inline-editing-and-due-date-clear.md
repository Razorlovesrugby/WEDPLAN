# Feature spec: Editable section/task/subtask titles, real assignee names, and a way to actually clear a due date

**Status: proposed, not built.** Four small, independent fixes to
`/lists/[id]` and `/settings`, in the same vein as spec 07 and spec 11 — each
has an unambiguous answer except Part C, which needs one decision (below).

**Depends on:** Spec 1 (lists/sections/items, `assigned_to`), spec 11
(`InlineText` already wired to a list's own title). All already built.

## 1. What this changes

### A. Section titles become editable

`renameSection(sectionId, title)` already exists in
`src/server/actions/lists.ts:342` — nothing server-side is missing. The gap
is purely the UI: `list-detail.tsx:432` renders a section's name as a plain
`<h2>{section.title}</h2>`. This becomes `InlineText` (same component spec
11 wired to a list's own title), calling `renameSection`.

### B. Task and sub-task titles become editable

Same gap, same fix, one level down: `item-row.tsx:185` renders
`<span>{item.title}</span>` with no way to change it after creation.
`updateItem(itemId, { title })` already exists and already accepts a
`title` patch (it's a generic partial-patch action validated against
`itemFields`). Sub-items render through the same `ItemRow` component as
top-level items, so wiring `InlineText` to this one span covers both "edit
task names" and "edit subtask names" in one change — there's no separate
sub-item row component to touch.

### C. Assignment shows a real name, not just "You" / "Owner" / "Partner"

Spec 1 built `assigned_to` (`list_items.assigned_to references auth.users`)
but deliberately labelled the picker by role, not by name — `auth.users`
lives outside the schema PostgREST exposes, and this app has never had a
profile table (spec 1 §"What's genuinely simplified"). That gap is what's
being asked to close now.

`collaborators` (the table `getCollaborators` already reads to build the
assign picker) currently has only `id, wedding_id, user_id, role,
created_at` — no name field at all. This adds one:

```
collaborators   display_name text, nullable
```

- Editable in `/settings`, next to wherever the collaborator's role already
  shows — a plain text field, save-on-blur, same pattern as the icon field
  in `ListAppearanceEditor`.
- The assign picker and every place that renders an assignee (item rows,
  `TaskPreviewPopup`, the "assigned to me" smart view label, the reminder
  digest) reads `display_name`, falling back to the existing role label
  ("You" / "Partner") when it's unset — so a wedding that never sets a name
  keeps working exactly as it does today.
- Nullable, no backfill needed.

### D. A due date can't be blanked once it's set

`setDueDate`/`onDateChange` already handle a `null` correctly — clearing
the field sends `null` and the server stores it (`item-row.tsx:104`,
`lists.ts:503`). The bug is the native `<input type="date">` widget itself:
Safari (including iOS) has no built-in clear affordance at all, and even
where one exists (Chrome's small "×"), it's easy to miss once a date is
sitting in the field. This adds an explicit "Clear" control next to the
date input — a small × button, visible only when a date is set, calling
the same `onDateChange("")` path already wired.

## 2. Scope

**In:**
- `InlineText` wired to `list-detail.tsx`'s section `<h2>` (calls
  `renameSection`) and `item-row.tsx`'s title span (calls
  `updateItem(id, { title })`), covering task and sub-task rows alike.
- `collaborators.display_name text` (new column, nullable), a new
  `updateCollaboratorName` action (or an extra field on whatever action
  `/settings` already uses to save the current user's own row — same
  "single call site" shape as every other settings field), and every
  assignee-rendering surface reading it with the existing role-label
  fallback.
- An explicit clear (×) button next to the due-date input in `ItemRow`.

**Out:**
- No change to who can edit whose name — either collaborator can set
  either name, same as spec 12 treated `lists.sort_order` as one shared
  value both collaborators can change (see §3, this is the one open
  question).
- No avatar, initials badge, or color-per-person — just the label text
  swapping from a role word to a typed name.
- No validation beyond "non-empty" on any of the three renamed things —
  same as every other title field in this app.

## 3. Open question

**1. Can either collaborator edit either person's `display_name`, or only
their own?** The two-collaborator model already treats plenty of shared
state as jointly editable (list titles, section names, `lists.sort_order`)
with no per-person ownership check — the same shape would make this a
single settings list where either person can fix a typo in either name.
The alternative — each collaborator can only rename themselves — is more
conventional but adds a real access check that nothing else in `/settings`
currently has. Recommend the shared-edit shape for consistency; flagging
since it's the one genuine judgment call in this spec.

## 4. Data model

```
collaborators   display_name text, nullable  -- new column, no backfill
```

One migration, additive. Nothing else in this spec touches schema — B and D
are UI-only, A reuses an already-built action.

## 5. Test plan

- `npm run typecheck`, `npm test`, `npm run build`.
- SQL: extend `supabase/tests/01_tenancy.sql`'s existing `collaborators`
  coverage (if any) to include the new column; no new RLS surface since
  `collaborators` already has a tenant policy.
- Browser pass: rename a section and a task inline; rename a sub-task
  inline; set a display name in `/settings` and confirm it shows on an
  assigned item, `TaskPreviewPopup`, and the reminder digest; set a due
  date on an item, clear it with the new × control, confirm it disappears
  from `/timeline` and the item shows no date.
