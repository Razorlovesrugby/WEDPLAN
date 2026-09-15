# Feature spec: Checklists

**Status: schema landed (`supabase/migrations/0004_checklists.sql`), verified
against `verify-migrations.sh` and `verify-bootstrap.sh`. No server action,
query, screen, or seed loader exists yet. Open questions below are
unanswered — nothing past schema gets built until they are.**

## 1. What this replaces

The decor, stationery, photography shot list and gift-registry tabs of a
wedding planning spreadsheet: a titled list, grouped into sections, each
item checkable with an optional note, quantity or URL. Four tabs in one
spreadsheet become four instances of one primitive.

## 2. Scope

**In:**
- A checklist primitive: `checklists` → `checklist_sections` →
  `checklist_items`, any wedding can have any number of checklists.
- Four seed templates (`supabase/templates/checklists.json`, 293 items) a
  collaborator can instantiate: decor, stationery, photography shot list,
  registry/gift list.
- Tick an item, add a note/qty/URL, add items and sections by hand,
  reorder.
- Turn a checklist item into a dated task (link to the task-timeline
  feature, spec 02) — the column (`checklist_items.task_id`) exists in the
  schema; the action to use it belongs to whichever of these two features
  ships second.

**Out, explicitly:**
- No link to a budget line (`budget_item_id`) — that table doesn't exist
  until V2.
- No vendor link — same reason.
- No PDF export of the photography shot list for a vendor — real value
  (the earlier planning pass flagged it as effectively "the V4 vendor
  portal with no vendor portal"), but it's an addition to this spec, not a
  requirement of it. Question 4 below asks whether to pull it forward.
- No collaborative "assign this item to a person" beyond `done_by` (who
  ticked it) — see question 5.

## 3. Data model — landed in `0004_checklists.sql`

```
checklist_templates   id, key, title, kind, sort_order, payload (jsonb)
                       -- global reference data, no wedding_id, read-only via API
checklists             id, wedding_id, template_key, title, kind, event_id,
                       sort_order, archived_at
checklist_sections     id, wedding_id, checklist_id, title, sort_order
checklist_items        id, wedding_id, checklist_id, section_id, title,
                       notes, qty, url, done_at, done_by, sort_order
                       -- task_id added by 0005, once `tasks` exists
```

- `kind` (`decor | stationery | registry | generic`) picks the screen
  treatment — a stationery checklist doesn't need a `qty` column shown, a
  registry one benefits from `url`.
- Instantiating a template **copies** its rows into the tenant tables.
  Never reference `checklist_templates` directly from a rendered screen —
  templates get corrected later, and a user's ticked-off list must not move
  underneath them.
- `done_at timestamptz`, not a `done boolean` — matches `invitations.sent_at`
  / `rsvps.responded_at` elsewhere in the schema: "when did we tick this"
  answers a question a boolean can't, for one extra column.
- RLS: `checklist_templates` is readable by any authenticated collaborator,
  writable by nobody through the API (service role only, at seed time).
  `checklists` / `checklist_sections` / `checklist_items` follow the
  standard tenant-table policy (`is_collaborator(wedding_id)`).

## 4. Screens

| Route | What it does |
| --- | --- |
| `/checklists` | All checklists for the wedding, a progress bar on each, "add from template" or "add blank" |
| `/checklists/[id]` | Sections, inline add/edit, tick, notes/qty/url where `kind` uses them |

Both are net-new routes; nothing in V1 touches this area.

## 5. Server actions & queries needed

- `src/server/queries/checklists.ts` — list checklists with progress
  (`done items / total items`), read one checklist with its sections and
  items.
- `src/server/actions/checklists.ts` — instantiate a template (copy
  `checklist_templates.payload` into real rows), create/rename/archive a
  checklist, add/edit/reorder a section, add/edit/tick/reorder/delete an
  item.
- `scripts/seed-templates.mjs` (shared with task timeline, spec 02) — load
  `supabase/templates/checklists.json` into `checklist_templates`, upsert on
  `key` so a title fix doesn't need a new migration.

## 6. Test plan

- Unit tests for anything with real logic — progress-percentage
  calculation, template-instantiation copy logic (a copy, not a reference,
  per section 3).
- `verify-migrations.sh` / `verify-bootstrap.sh` stay green (already true).
- Add a cross-wedding RLS assertion for `checklists` (or at least one of the
  four new tables) to `supabase/tests/01_tenancy.sql` — none exists yet,
  flagged in `docs/HANDOFF.md` section 1.
- `typecheck`, `npm test`, `npm run build` clean.
- Opened in a browser: instantiate each of the four templates, tick an
  item, reload, confirm it's still ticked. `docs/HANDOFF.md` section 6 has
  two real bugs (`/guests/rank`) that passed every automated check and only
  showed up on an actual screen — a virtualised or drag-heavy checklist UI
  would be exposed to the same class of bug if built that way.

## 7. Open questions

**1. Which of the four seed templates do you actually want at launch?**
The registry/gift-list template (147 items) is the most US-shaped of the
four — the earlier gap-analysis pass flagged the sheet's registry model as
assuming US registry platforms with US bank payouts, which don't map to a
UK wedding. Ship all four as-is, ship three and skip registry, or ship
registry but re-labelled as a plain gift list with no US-specific items?

**2. Custom checklists from scratch, or templates only?**
Templates-only is less to build (no blank-checklist creation flow) but
locks the user into the four categories above. Do you want a fifth,
generic checklist for anything not covered — a honeymoon packing list, a
beauty/hair-and-makeup list, anything the four templates don't fit?

**3. Should any checklist be visible on the public site (`/w`)?**
E.g., a public registry/gift-list page for guests, similar in spirit to how
`/w` already renders public event info. Or is this feature entirely
planner-facing, with guests never seeing it?

**4. Photography shot-list export — pull forward or defer?**
Filtered and exported (PDF), the shot-list checklist becomes a brief for
the photographer with no vendor portal needed. That's a real addition
beyond "tick boxes," using the same PDF/print machinery `/invitations/print`
already has (`docs/HANDOFF.md` section 7 — QR print sheet conventions would
apply here too, e.g. no live data fetched per row). Worth building now, or
strictly out of scope for this pass?

**5. Per-item assignment between the two of you, or fully shared?**
`checklist_items.done_by` already records who ticked something. Is that
enough, or do you want to assign an item to a specific collaborator before
it's done (an "assigned to" field, filterable per person)? The AI-native
planning pass explicitly argued against task-assignment nagging between two
people marrying each other — worth deciding deliberately rather than
defaulting either way.

**6. Any additional checklist categories beyond the seeded four?**
Anything from your own spreadsheet that doesn't map to decor, stationery,
photography or registry.
