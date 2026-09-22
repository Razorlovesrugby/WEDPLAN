# Addendum: what a full planning spreadsheet does that this app does not

Source: *The Knot Wedding Planning Spreadsheet*, ten sheets, analysed against
[`wedding-platform-spec.md`](wedding-platform-spec.md) and the V1 schema in
`supabase/migrations/0001_core_schema.sql`.

This is a gap analysis, not a new plan. It adds four things to the existing
V1-V4 arc and changes the ordering of one. Everything else in the sheet is
already modelled, usually better.

Machine-readable seeds extracted from the sheet live in
[`supabase/templates/`](../supabase/templates/): 175 timeline tasks with day
offsets, four checklists totalling 293 items, and 22 budget categories with
percentage shares.

---

## 0. Status against main, added session 30

**This document was written against migration `0003`. Main is at `0029`.**
Most of what it proposes has since shipped, usually under a different name,
and reading it as a to-do list would rebuild built features — the exact
failure `docs/HANDOFF.md` session 29 names when it corrected four stale
status documents. What each section actually stands at:

| § | Proposal | Status on main |
| --- | --- | --- |
| 3 | Pattern A, the checklist primitive | **Built**, as `lists`. Spec 1 / `0004_lists.sql` merged checklists and tasks into one table family rather than the three tables proposed here, and the migration's own header explains why. `checklist_items.budget_item_id` and `.task_id` are unnecessary under that model; the budget link shipped as spec 6 §7 and spec 16's `budget_item_sections`. |
| 3 | Four seed templates | **Partly built.** `supabase/templates/checklists.json` is in the repo and is the file this section describes. It is not yet loaded into `list_templates`, so the Decor, Invitation suite, Shot list and Registry lists are seed data on disk that no screen offers. |
| 4 | Pattern B, tasks generated from the wedding date | **Built.** Also spec 1 / `0004`. There is no `task_templates` table: a dated template is a `list_templates` row whose items carry `offset_days`, generated into real `list_items`. `supabase/templates/task-timeline.json` on main is this file's 175 tasks **reshaped into that payload**; the bundle's flat `tasks` array is the older shape and must not overwrite it. |
| 5 | Pattern D, top-down budget allocation | **Built**, and further than proposed. Spec 19 / `0020_budget_allocations.sql` gives `weddings.total_budget` and `allocation_pct` on categories and items; spec 20 adds per-section allocation. `budget_allocations` as a table was not needed. `budget_benchmarks` is **not** built. |
| 5 | Pattern C, the drink calculator | **Built, session 30** — `0030_drink_plans.sql`, `src/lib/drinks.ts`, `/budget/drinks`. See "Build status" below for the two places the build departed from this section. |
| 5 | The gift calculator | **Not built**, and has nowhere to live until the registry template is loaded. |
| 6 | Save the date as a distinct send | **Built**, `0016_save_the_date.sql`. |
| 6 | Seed the menu-choice question | **Superseded.** Spec 14 shipped a full question builder with `single_select` and guest scope, so this is a starter-library entry, not schema. |
| 8 | Release placement | **Obsolete.** The V1.5/V2 split described here did not happen; the repo builds one numbered spec at a time per `docs/specs/README.md`. |

**Two corrections to the document's own content, not just its status:**

- §5 calls the seeded budget shares US figures to be replaced with **UK**
  ones. The product is **NZD-only** as of spec 18 — there is no multi-currency
  mechanism left to replace. `supabase/templates/budget-categories.json` ships
  as a taxonomy with US shares attached and a warning in its own header; the
  shares are wrong for this product twice over.
- §4's claim that the wedding date blocks nothing is correct and is now
  demonstrated rather than argued: generation against a null date has shipped.

**What is genuinely left here:** the gift calculator (§5), the two unloaded
checklist templates (§3, and see below), `budget_benchmarks` (§5), and
per-vendor PDF export of the shot list (§3, open question 3).

### Build status: the drink calculator, session 30

Built end to end and authorised directly — `0030_drink_plans.sql`
(`drink_headcount_source`, `drink_plans`, `v_drink_plans`), `src/lib/drinks.ts`
with 17 unit tests, `src/server/queries/drinks.ts`,
`src/server/actions/drinks.ts`, `/budget/drinks` and its two components, and
`supabase/tests/13_drink_plans.sql` with 18 assertions. 625 tests, 442 SQL
assertions, both migration checks, bootstrap and build all clean.
**Never opened in a browser and never run against the live project** — the same
caveat every session since 12 carries, and `0022`–`0030` are all unapplied.

**Two departures from §5 as written, both deliberate:**

1. **`drink_plans` stores no `hours`-times-headcount result, and no cost.**
   §5 proposed a table that recomputes servings independently of
   `consumption_components`, which already does that arithmetic against a live
   guest basis and prices it. Two tables multiplying the same three numbers is
   a second copy of the truth. The table holds only the inputs a human
   chooses; the headcount is resolved on read by `v_drink_plans` and the
   container maths by `src/lib/drinks.ts`. `budget_item_id` links the two for
   navigation and neither side writes to the other. The migration header
   carries the full argument.
2. **Three headcount sources, not four.** §5 lists
   `confirmed | invited | above_cut | manual`. In this schema
   `budget_guest_population` is already restricted to tier A, and tier A is
   what "above the cut" means — so `above_cut` would be a synonym for
   `invited` dressed as a choice. `13_drink_plans.sql` asserts the distinction
   that does exist: one RSVP moves a `confirmed` plan and leaves an `invited`
   one alone.

The §5 constraint that mattered most is enforced where it belongs: the three
alcohol shares and the three wine shares each sum to 1 as a database CHECK on
exact `numeric`, with the same rule mirrored in the action so the planner sees
"has to add up to 100%" rather than a constraint violation.

### Not built, and why: the two unloaded checklist templates (§3)

§3 asks for four seed templates and the repo loads two. `scripts/seed-templates.mjs`
already loads decor, stationery and the timeline; the photography shot list and
the registry/gift list sit in `checklists.json` deliberately unloaded, because
**spec 1's open question 1 was answered by the planner** to drop the registry as
US-shaped and ship those three only.

This document argues the other way — the registry as a gift list with URLs, the
shot list as a photographer's brief. That is a reasonable case, and it is a
reversal of an answered spec question, so it needs the planner rather than a
build. It is two lines in `TO_LOAD` once decided. The gift calculator (§5) is
blocked behind the same decision: it was specified as a header on the registry
checklist, and there is no registry checklist until this is settled.

---

## 1. What the sheet loses to the existing spec

Stated first so the addendum is not read as a list of failures.

| Sheet | Status | Why the spec wins |
| --- | --- | --- |
| Vendor Contact Info | Covered by V2 | The sheet carries `deposit` and `balance`, which is one number recorded twice and guaranteed to disagree. V2's four numbers (estimated, quoted, contracted, paid, with paid summed from `payments`) is the correct model. |
| Wedding Day Schedule | Covered by V3 | The sheet cascades by summing durations from a single start time. Nothing can be pinned, so a vendor call time or a ceremony licence slot moves when anything upstream slips. `timeline_items.pinned` / `predecessor_id` fixes exactly this. |
| Wedding Guest List | Covered by V1 | The sheet is one row per invite with a `# of guests` integer. Households-plus-guests gives real per-guest dietary, age band and per-event RSVP, which a headcount column cannot. |
| Budget Planner (tracking half) | Covered by V2 | Estimate and actual, two columns. V2 carries four and derives variance. |

Two columns from the Guest List sheet are **not** gaps, on inspection:

- **Menu choice** is already built. `question_type` includes `single_select`,
  `question_scope` includes `guest`, and main now carries a question builder
  and rich RSVP field types. A per-event menu choice is a seeded question, not
  a new column and not new code.
- **Table number** is V3 `seat_assignments`, deliberately later.

One column *is* a gap: **save the date sent**, tracked separately from
**invite sent**. See section 6.

---

## 2. The finding: ten sheets, four patterns

Five sheets are the same thing. Three more are the same thing as each other.
Building ten features here would be a mistake.

| Pattern | Sheets | What it actually is |
| --- | --- | --- |
| **A. Checklist** | Decor (37), Stationery (15), Photography shot list (94), Registry (147) | `checklist -> sections -> checkable items with notes`. One primitive, four seed templates. |
| **B. Date-derived task list** | Checklist & Timeline (175) | Tasks with a *relative* offset from the wedding date, materialised into real tasks when the date is set and recomputed when it moves. |
| **C. Headcount calculator** | Drink calculator, Registry gift calculator, Budget allocation | A number typed into a yellow box, multiplied out. In this app that number comes from confirmed RSVPs. |
| **D. Top-down budget** | Budget Planner (allocation half) | Enter a total, split it by category percentage, then measure drift. The spec only models bottom-up. |

Pattern C is the one worth being loud about. Every calculator in that file
takes a guessed guest count as input. This app knows the real one, per event,
live. That is the difference between reimplementing a spreadsheet and replacing
it.

---

## 3. Pattern A: the checklist primitive

### Data

```
checklist_templates   key, title, kind, locale, version, payload (jsonb)
checklists            wedding_id, key, title, kind, vendor_id, event_id,
                      sort_order, archived_at
checklist_sections    wedding_id, checklist_id, title, sort_order
checklist_items       wedding_id, checklist_id, section_id, title, notes,
                      qty, url, done_at, done_by, sort_order,
                      budget_item_id, task_id, assigned_to
```

**Constraints and notes**

- `wedding_id` on all three tenant tables, per rule 1. `checklist_templates` is
  the one table with no `wedding_id`: it is global reference data, readable by
  all, writable by nobody through the API.
- `done_at timestamptz` rather than `done boolean`. "When did we tick this"
  answers questions a boolean cannot, and it costs one column.
- `kind` drives the screen, not the schema:
  `decor | stationery | shots | registry | generic`.
- `checklist_items.budget_item_id` is the payoff. A decor checklist whose items
  link to budget lines stops decor being the category that quietly runs 40%
  over, which is the single most common spreadsheet failure in this file.
- `checklist_items.task_id` lets any item become a dated task, so the checklist
  and the timeline are one system, not two.
- Instantiating a template **copies** rows. It does not reference the template.
  Templates get edited; a user's ticked list must not change underneath them.

### Screens

| Route | What it does |
| --- | --- |
| `/checklists` | All lists, progress bar each, add from template or blank |
| `/checklists/[id]` | Sections, inline add, tick, notes, qty and URL where the kind uses them, link an item to a budget line or a task |

### Seeds

`supabase/templates/checklists.json`, extracted verbatim from the sheet:

| Template | Sections | Items |
| --- | --- | --- |
| Decor | Ceremony, Reception, Cocktail hour | 37 |
| Invitation suite | 1 | 15 |
| Photography shot list | 8 | 94 |
| Registry / gift list | Kitchen, Tabletop, Bedding, Bath, Indoor living, Outdoor living, Lifestyle | 147 |

The photography shot list earns its place beyond the tick boxes: filtered and
exported per vendor it becomes the photographer's brief, which is the V4 vendor
portal with no vendor portal. Ship the PDF export with the checklist and the
portal can wait indefinitely.

The registry template is the weakest of the four and the most US-shaped. See
section 7.

---

## 4. Pattern B: tasks generated from the wedding date

This is the sheet's strongest idea and the app has nothing like it. 175 tasks,
each tagged with a bucket from "13 months before" down to "1 day before",
with due dates computed from the wedding date. Enter one date, get a plan.

The spec has `tasks` in V2 with no notion of a template and no generation.

### Data

```
task_templates   key, title, offset_days, bucket, category, note,
                 locale, version, depends_on_key
tasks (V2)       + template_key, generated_at, offset_days, snoozed_until
```

**Constraints and notes**

- `offset_days` is negative, measured from `weddings.wedding_date`. The
  extracted range is **-391 to -1**. Storing days rather than months avoids
  month-length arithmetic and makes a date change a single integer add.
- Generation is **idempotent and non-destructive**. Keyed on
  `(wedding_id, template_key)`. Re-running after a date change moves the due
  date of tasks that are still `pending` and leaves completed, edited and
  manually created tasks alone. A task the user has retitled is theirs now.
- `depends_on_key` resolves into `task_dependencies` at generation time. The
  sheet has implicit ordering only ("book the venue" before "schedule ceremony
  site tours" is nowhere stated), so seed this sparsely and only where the
  dependency is real.
- A shortened engagement compresses the front of the list into the past.
  Generation must clamp: anything with a computed due date before today lands
  in an **Overdue on import** bucket rather than silently appearing as failure.

### Screens

Reuses V2 `/tasks` (list, board, calendar, mine, this week, overdue). The only
new surface is `/setup/plan`: pick a template, preview the generated dates,
generate.

### No dependency on a date being chosen

`weddings.wedding_date` is nullable and migration 0001 is already shipped, so
nothing here is blocked. The base spec's claim that the date blocks the first
migration is falsified by its own schema.

A null date means generation is a no-op and the plan screen shows an empty
state asking for one. Offsets are stored in days, so the feature works for any
date and any engagement length, which is the only behaviour a product can have.

---

## 5. Patterns C and D: budget allocation and live calculators

### Budget allocation

The spec models budget bottom-up: a line per thing, four numbers per line. The
sheet models it top-down: one total, split by percentage, and the split is what
you argue about in month one when nothing has a quote yet.

Both are needed. They are different phases of the same problem.

```
budget_allocations   wedding_id, category, share numeric(6,4), currency,
                     allocated_minor
budget_benchmarks    locale, category, share, median_minor, currency,
                     source, as_of
```

- `budget_items.category` (V2) joins to `budget_allocations.category`, giving
  allocated vs estimated vs quoted vs contracted vs paid per category. Five
  numbers, and the first two are the ones that expose an unrealistic plan while
  it is still cheap to change.
- Shares are stored, not derived, so a deliberately lopsided split survives.
- `supabase/templates/budget-categories.json` carries the sheet's 22 categories
  and shares. **These are US figures from The Knot's 2025 study and must not
  ship as UK defaults.** Venue at 24.3% and catering at 17.8% do not describe a
  London wedding. Treat the file as the category taxonomy, which is sound, and
  replace the shares.
- The sheet allocates exactly 100% with no contingency line. A contingency
  category is added to the seed at 0%, to be set deliberately.

### The drink calculator

Worth implementing precisely because it is the clearest demonstration of what
the app has that the sheet does not: a real headcount.

```
drink_plans   wedding_id, event_id, hours, intensity, champagne_toast,
              beer_share, wine_share, spirit_share,
              red_share, white_share, rose_share,
              headcount_source (confirmed|invited|above_cut|manual),
              manual_headcount
```

Formulas, taken from the sheet's cells rather than its prose:

```
champagne_servings = champagne_toast ? headcount : 0
servings_total     = headcount * hours * intensity - champagne_servings

beer_servings      = servings_total * beer_share      -> 1 serving per can
wine_servings      = servings_total * wine_share      -> 5 servings per 750ml
spirit_servings    = servings_total * spirit_share    -> 19 servings per 1L
champagne                                             -> 6 servings per 750ml
```

`intensity` is `0.85` light, `1.00` average, `1.15` heavy, `1.30` extra heavy.
Sheet defaults: beer/wine/spirits 25/25/50, wine split red/white/rose 40/40/20.
Mixers are fractions of spirit servings: cola 0.2, diet cola 0.2, tonic 0.1,
ginger ale 0.2, soda water 0.2, each at 12 servings per 2L; juice 0.1 at 6
servings per litre; water at 2 bottles per head.

Expose as a view, `v_drink_plan`, joined to `v_wedding_stats.attending_guests`
so the shopping list moves as RSVPs land. Feed the result into the alcohol
budget line and into the per-head marginal cost the spec already wants on the
ranking screen. Dragging a household above the cut line should visibly cost
beer.

**Constraint worth enforcing:** the three alcohol shares and the three wine
shares each sum to 1. The sheet asks the user to check this by eye and silently
produces nonsense when they get it wrong.

### The gift calculator

Two lines of arithmetic (register for 2x guest count, banded by price) and the
only part of the registry sheet with any logic in it. Fold it into the registry
checklist header rather than building a screen.

---

## 6. Smaller corrections to V1

**Save the date as a distinct send.** `message_kind` is
`('invitation','reminder','update','test')`. Add `save_the_date`. A save the
date goes out roughly six months before the invitation, to a list that is
usually shorter, and "who have we told, versus who have we invited" is a real
question during the gap. No new table: `message_log` already carries
`household_id`, `kind`, `channel`, `sent_at` and a dedupe key.

**Seed the menu-choice question.** Ship a `single_select` guest-scoped RSVP
question per event where a menu applies, rather than treating it as missing
schema.

---

## 7. What is not being taken from the sheet, and why

- **US dollar benchmarks and the tipping cheat sheet.** UK weddings do not tip
  vendors as a norm and the dollar figures are noise. Categories in, numbers
  out.
- **Store registries.** The sheet's registry model assumes US registry
  platforms with US bank payouts. The UK equivalent is a cash or honeymoon
  fund, which the spec already flags as a Stripe-and-tax decision, not a
  checklist. Ship the 147-item registry list as a *gift list* checklist with
  URLs, and leave money movement alone.
- **Every "Find a vendor on The Knot" link.** Marketplace referral, not
  function.
- **The sheet's 13-month assumption.** Seeded as offsets so a 7-month or
  20-month engagement works. The bucket labels are display only.

---

## 8. Revised release placement

| Item | Was | Now | Reason |
| --- | --- | --- | --- |
| Checklist primitive + 4 seeds | absent | **V1.5** | No dependency on vendors, money or the inbox. Two tables and a screen. Useful the day RSVPs start landing and you switch to decor. |
| Save the date, menu question seed | absent / V1 | **V1.5** | Enum value and a seed. |
| `task_templates` + generation | part of V2 | **V1.5** | The timeline is the highest-value sheet in the file and needs none of V2. Bring `tasks` forward ahead of vendors and split V2. |
| Budget allocation | absent | **V2** | Needs `budget_items.category`, so it lands with the budget. |
| Drink calculator | absent | **V2** | Needs the alcohol budget line to be worth more than a number on a page. Could ship standalone in V1.5 if the shopping list is wanted before quotes exist. |
| Gift calculator | absent | **V1.5** | Rides along with the registry checklist. |
| Registry as gift-list checklist | V4 | **V1.5** | As a checklist it is free. As a cash fund it stays in V4. |

The one structural change: **V2 splits**. Tasks and templates come forward into
a V1.5 that needs no Gmail, no vendors and no money. What remains in V2 is
vendors, budget and the inbox, which is the hard, slow half.

---

## 9. Decisions this forces

1. **UK budget shares.** The seeded percentages are US. Either source UK
   figures or set the split from your own venue and catering quotes and skip
   benchmarks entirely. Recommend the latter: two real quotes beat a national
   median.
2. **Whether V1.5 exists as a release or the checklist work lands piecemeal.**
   It is roughly two tables, one screen, one generator and four seed files.
3. **Whether the photography shot list exports per vendor in V1.5.** If yes,
   server-side PDF arrives earlier than planned, and the V3 printed-pack
   tooling gets built and tested a year ahead of the day it matters. Argues
   for yes.
