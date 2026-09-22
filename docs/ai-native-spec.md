# AI-Native Wedding Planner: Product Specification

Companion to [`wedding-platform-spec.md`](wedding-platform-spec.md), which
remains the data and release spec for V1-V3. This document defines the AI layer
and the product thesis, and overturns four decisions in that spec. Those are
listed in section 12.

**Decisions taken before writing this:**

| Question | Answer |
| --- | --- |
| Personal tool or product | Build for our wedding, architect as a product |
| Primary user | Type A, spreadsheet maximalist |
| AI autonomy ceiling | Drafts everything, sends nothing, writes nothing without a tap |

---

## 0. Status against main, added session 30

**This document was written against migration `0003` and describes the repo as
"V1's code is complete".** Main is at `0029` with twenty-five numbered feature
specs behind it. The thesis, the persona, the design principles and the whole
AI layer stand unbuilt and unchanged; the **build order in §14 does not**, because
three of its six phases have been overtaken by work that shipped in a different
order.

| Phase | §14 contents | Status on main |
| --- | --- | --- |
| 0 | Grid, paste-from-Excel, xlsx read/write, multi-sheet mapping | **Not built.** `src/lib/import/` is guest CSV only — `columns.ts`, `plan.ts`, `trigram.ts` and the mapping wizard. There is no xlsx dependency in `package.json`; `@tanstack/react-virtual` is present, `@tanstack/react-table` is not. §7's read of the existing importer is still accurate. |
| 1 | Tasks and checklists | **Built**, spec 1 / `0004_lists.sql`, as one `lists` family rather than the two proposed. See `planning-spreadsheet-gaps.md` §0. |
| 2 | Ingest, extraction, candidates, review queue | **Not built.** No `ingests`, `extractions` or `candidates` table, and no inbound address. |
| 3 | Vigilance, observations, weekly briefing, derived-number registry | **Not built as specified.** No `checks`/`observations`/`assumptions` tables. A weekly digest does exist — spec 2's reminders and `v_reminders_due` — and is the surface a briefing would extend rather than replace. |
| 4 | Vendors, money, search | **Two thirds built, and ahead of phases 0–3.** Vendors shipped as spec 8 / `0029_vendors.sql`; the budget as specs 6, 6.1, 18, 19 and 20. pgvector search and scoped ask are not built. |
| 5 | What-if scenarios, seating, run of show, printed pack | **Partly built.** The run sheet and a themed print sheet shipped in specs 5 and 14. Scenarios and seating are not built. |

**What this means for §14:** the phase ordering is no longer a plan to follow.
Phases 1, 4 and 5 are substantially done and were done out of order, so the
remaining work is phases 0, 2 and 3 — the grid and xlsx import, the ingest
loop, and the vigilance engine — against a schema much richer than the one this
document assumed.

**Three of the four reversals in §12 are unaffected; one has already happened.**
"Tasks and checklists move ahead of vendors" describes what main did. The Gmail
reversal, the promotion of semantic search and the promotion of the decision log
all still stand, and none of the three has been built either way — there is no
inbox in the repo at all, so retiring OAuth costs nothing today.

**Corrections to the document's own content:**

- **§5's check catalogue names tables that do not exist.** `checks.json` marks
  these with `requires`, and the honest count against main is that `contracts`
  and `quotes` are absent, so the flagship check — contract capacity against
  seats above the cut — cannot be written as specified. `vendors`,
  `budget_items`, `payments`, `v_wedding_stats` and `v_budget_category_totals`
  all exist, so the money, vendor-silence and guest-data-quality checks can.
- **§6's registry is further along than it reads.** `seats_above_cut` and
  `attending_guests` are columns on `v_wedding_stats`; `per_head_adult` and
  `per_head_seat` are on `v_budget_summary`; `allocated_by_category` is spec
  19's `v_budget_category_totals`; `outstanding_balance` is derivable from
  `payments`. Four of the eight launch members are already computed somewhere
  and need exposing, not building. `servings_total` and the bottle counts are
  the ones with no home.
- **The drink plan in §6's worked example is half-built already, in the budget.**
  `consumption_components` (`0010_budget.sql`) carries
  `servings_per_guest_per_hour`, `duration_hours`, `price_per_serving`,
  `wastage_buffer_pct` and a `guest_basis` that resolves to a live headcount,
  and `consumptionTotal` in `src/lib/budget.ts` multiplies them out. The
  arithmetic this document presents as a new derived number is a costed budget
  line today. What is genuinely missing is the split into beer/wine/spirit
  shares, the champagne carve-out, the container maths, and a shopping list.
  A `drink_plans` table that recomputes servings independently would be a
  second copy of a number the budget already holds.
- **Currency.** §7 and the import sections predate spec 18: the product is
  NZD-only, with no FX mechanism left. Any xlsx round trip inherits that.

**The §14 precondition still holds, and is the main thing to understand before
building any of this.** Nothing here has run against a live Supabase project or
been opened in a browser, `0022`–`0029` are unapplied, and that was as true at
spec 25 as it was at V1.

---

## 1. Thesis

A spreadsheet maximalist will not leave a spreadsheet for an app that is a worse
spreadsheet. Every planning product on the market loses to Excel on the ground
this user actually cares about: density, keyboard, and being able to see the
formula.

So do not compete on the grid. **Ship a better grid, then add the six things a
grid structurally cannot do.**

| A spreadsheet cannot | The product does |
| --- | --- |
| Chase anyone | Sends RSVP reminders and flags vendor silence |
| Remember a conversation | Ingests email and files, extracts facts, answers from them |
| Recompute downstream | Confirmed headcount drives catering, drinks, per-head cost, seating |
| Check itself | Detects contradictions between contract, quote, ranked list and plan |
| Take two editors | Real presence, per-field audit, a digest instead of nagging |
| Be at the venue | Phone capture and lookup, offline day-of pack |

Everything in this document serves one of those six rows. If a proposed feature
does not, it is a demo, not a product.

---

## 2. The persona, precisely

Type A, spreadsheet maximalist. The stated ask is organisation. The actual
anxieties are two:

1. **What am I forgetting.**
2. **Is this still on track.**

Neither is solved by generation. Both are solved by vigilance.

Three consequences that govern the whole design:

**She decides. The AI prepares.** Autonomy reads as threat to this persona, not
convenience. An AI that books, sends or commits will be switched off after one
bad action, and correctly so. An AI that arrives with everything gathered,
drafted and cross-checked is indispensable. The division of labour is fixed and
non-negotiable: **the AI gathers, drafts, checks and remembers. The human
decides.**

**She will not trust a number she cannot audit.** Every derived figure must
expose its formula, its inputs and its assumptions, and every extracted fact
must link to the line it came from. This is not a power-user affordance. For
this persona it is the price of entry.

**She already has a working system.** The Knot spreadsheet, customised. A second
place to look is worse than one place. Either the app fully replaces the sheet
in the first week or it is abandoned. This is why section 7 (import) comes
before any AI feature in the build order.

---

## 3. Design principles

These are binding. A feature that violates one is wrong, however good it sounds.

1. **Grid first.** Every collection has a dense, sortable, filterable,
   keyboard-navigable table with inline edit. Cards and dashboards are
   secondary views over the same rows.
2. **No black boxes.** Every computed number opens to its formula, its inputs
   and its constants. The constants are editable and the edits are stored per
   wedding.
3. **Nothing is written by a model.** Extraction produces *candidates*. A human
   tap turns a candidate into a row. There is no code path from a model to a
   table.
4. **Provenance or it did not happen.** Every extracted value links to the
   source document and the span inside it. One tap to the highlighted line.
5. **Detection is deterministic, narration is not.** Contradictions and risks
   are found by SQL. The model writes the sentence. It never finds the finding.
6. **Export parity.** Anything on screen leaves as xlsx or CSV at any moment,
   live. This is the anxiety valve that makes switching possible, and it must
   never be degraded as a retention tactic.
7. **The app chases, the partners do not.** No assignment nagging between two
   people who are marrying each other.
8. **Mobile captures and looks up. It does not edit grids.**

---

## 4. The AI layer: ingest and extraction

### Surfaces

Everything arrives unstructured and becomes rows:

| Surface | Example |
| --- | --- |
| Email | Caterer replies with a revised quote |
| File upload | Venue contract PDF |
| Phone photo | A quote handed over on paper at a viewing |
| Voice note | Two minutes in the car after a venue visit |
| Paste | A block of text or cells from anywhere |
| Forward | WhatsApp thread pasted or screenshotted |

### Pipeline

```
ingest -> classify -> extract -> candidates -> review queue -> accepted rows
```

Nothing skips the queue.

### Data

```
ingests        wedding_id, source (email|upload|photo|voice|paste),
               file_path, mime, sha256, received_at, from_addr,
               thread_id, status, error

extractions    wedding_id, ingest_id, kind, model, prompt_version,
               raw (jsonb), tokens, cost_minor, confidence, created_at

candidates     wedding_id, extraction_id, target_table, target_id,
               field, value (jsonb), confidence, span (jsonb),
               status (pending|accepted|rejected|superseded),
               decided_by, decided_at, supersedes_id
```

**Constraints and notes**

- `wedding_id` on all three, per rule 1 of the base spec.
- `sha256` on `ingests` deduplicates the same PDF arriving by email and by
  upload, which happens constantly.
- `span` holds byte offsets for text and a bounding box for images, so
  provenance renders as a highlight on the source, not as a citation string.
- `target_id` null means "create a new row", not null means "amend this one".
  A revised quote from the same vendor is a new `quotes` row, never an update,
  per the base spec.
- `prompt_version` is not optional. Accept and reject rates per field per
  version are the only eval set that matters, and they arrive for free.
- Candidates are **superseded, never deleted**. A rejected extraction that
  turns out to have been right is a thing that happens.

### The review queue

One screen, keyboard driven. Left: the source, with the extracted span
highlighted. Right: the candidate fields. `A` accepts, `R` rejects, `E` accepts
with an edit, `J`/`K` move. A viewing-day backlog of nine documents should clear
in two minutes.

Batch accept is allowed above a confidence threshold the user sets, and the
threshold is visible. It defaults off.

---

## 5. The vigilance engine

The most important system in the product, and it is not a chatbot.

A scheduled job runs a catalogue of **deterministic checks** and writes
**observations**. The model turns an observation into a sentence. It never
decides that there is something to say.

### Data

```
checks          key, title, severity (info|warn|critical), cadence,
                subject_type, definition_sql, enabled_by_default

observations    wedding_id, check_key, severity, subject_type, subject_id,
                fingerprint, facts (jsonb), body, first_seen_at,
                last_seen_at, resolved_at, snoozed_until, dismissed_at
```

**Constraints and notes**

- `fingerprint` is a hash of the check key plus subject plus the material facts.
  Same fingerprint means the same observation, so it updates `last_seen_at`
  rather than creating a duplicate. Without this the user gets the same warning
  every morning and stops reading.
- `facts` holds the numbers. `body` holds the model's sentence. If the model is
  unavailable, the UI renders from `facts` and the product still works.
- Resolution is detected, not clicked. When the condition stops being true,
  `resolved_at` is set by the next run.
- Snooze is per observation with a date. Dismiss is per check, per wedding, and
  is a settings change rather than a gesture, because dismissing a class of risk
  should feel deliberate.

### The check catalogue

Seeded in [`supabase/templates/checks.json`](../supabase/templates/checks.json).
This catalogue is the product. A sample of what it finds:

**Capacity and headcount**

- Seats above the cut line exceed contracted venue capacity
- Confirmed attending exceeds capacity
- A caterer quote's headcount assumption differs from current confirmed by more
  than 10%
- The drink plan headcount is stale against confirmed attending

**Dates**

- The derived final-numbers date is earlier than the RSVP lock date. Venue wants
  numbers 21 days out, caterer wants 28, so the real lock is 35 and the one you
  typed in is wrong
- A contract key date has no corresponding task
- A vendor hold expires before the contract is due to be signed
- A task is overdue and has dependents

**Money**

- Category contracted exceeds allocated by more than a threshold
- Payments falling due in the next 30 days
- A quote has been superseded but the budget line still carries the old figure
- Per-head marginal cost has moved more than 10% since the ranking was last
  reviewed

**Vendors**

- An open thread with no inbound message in N days
- A booked vendor with no signed contract
- A vendor with a deposit paid and no balance schedule

**Guests and data quality**

- Households unresponded with the lock date inside 14 days
- A guest with a dietary requirement and no menu choice
- A guest above the cut with neither email nor postal address
- A confirmed attendee with no seat, inside 14 days

**The flagship is the first one.** Venue contract says 120. Ranked list above
the cut is 134 seats. Caterer quoted on 100. Drink plan set for 120. Four
documents disagree, and no spreadsheet in the world will tell you.

---

## 6. The derived-number registry

This is the most persona-specific feature in the document and the one that wins
a spreadsheet maximalist.

Every computed figure in the app is a named definition with visible inputs and
**editable constants**.

```
assumptions   wedding_id, key, value (jsonb), unit,
              source (default|user|extracted), extraction_id,
              updated_by, updated_at
```

Tapping any number opens a popover with:

- the formula, in plain arithmetic
- each input, linked to the row it comes from
- each constant, editable inline, marked where the user has overridden the
  default
- where an input came from an extraction, a link to the source document

Worked example, the drink plan:

```
servings_total = headcount x hours x intensity - champagne_servings
               = 118      x 5     x 1.00      - 118
               = 472

headcount   118   confirmed attending, live      -> guest list
hours         5   assumption, user set           -> edit
intensity  1.00   assumption, default (average)  -> edit
champagne   118   toast enabled                  -> edit
```

The equivalent spreadsheet cell shows `472` and hides `=A8*C8*C14-C12` behind a
double click. This shows both, and lets her change the 5 without finding the
cell.

Registry members at launch: `servings_total`, bottle counts by type,
`per_head_marginal_cost`, `real_final_numbers_date`, `seats_above_cut`,
`allocated_by_category`, `outstanding_balance`, `projected_final_headcount`.

---

## 7. The grid, and the import that precedes it

### The grid

Make-or-break. Build it properly or the rest is wasted.

- TanStack Table with TanStack Virtual, already the chosen stack for ranking
- Keyboard: arrows to move, tab to next field, enter commits and moves down,
  escape reverts, `cmd+Z` undo with a 50-deep client stack backed by the server
  audit log
- Row multi-select, bulk edit one field across a selection
- **Paste a block from Excel directly into the grid.** Columns map by header,
  a diff preview shows adds, changes and conflicts, then apply. This single
  control is both the import story and the daily-use story
- Column chooser, saved views (`saved_views` already exists), filters in the URL
  so a filtered grid is a link
- Every grid exports to xlsx with formatting and to CSV, live

### Import is the trust moment

**Half of this is already built.** `src/lib/import/` and the import wizard ship
guest CSV import with conservative header detection, a hand-editable mapping
screen and a row-level preview. The detection comment in `columns.ts` makes the
right argument: a wrong guess that looks right is worse than no guess. Keep
that principle and do not let a model loosen it.

What is missing for a spreadsheet maximalist:

1. **xlsx, not just CSV.** She will not export a sheet to CSV first, and asking
   her to is where the switch fails.
2. **Multi-sheet workbooks.** The Knot file is ten sheets. Guests are one of
   them. The importer needs a sheet-to-entity step above the existing
   column-to-field step, so budget, tasks, vendors and checklists land too.
3. **Model-proposed mapping as a first guess only**, feeding the existing
   editable mapping screen rather than replacing it.
4. **Undo for a whole import**, not row by row.
5. **Round trip.** Export back to xlsx with formatting, so the import is
   reversible. This is the anxiety valve from principle 6.

Support The Knot template by name, since its layout is known and seeded. The
moment her 140 households appear correctly is the moment the product becomes
real. Everything else is downstream of that ten minutes.

---

## 8. Search and ask

**Semantic search** over emails, notes, documents, decisions and observations
using pgvector. "What did the caterer say about corkage" returns the paragraph,
the thread and the date. This is what makes ingesting email worth the effort,
and it moves from V4 in the base spec to the first AI release here.

**Ask** is a question box, not a chat. It answers only from her data, always
with citations, and never writes. It declines generic wedding advice, which is
precisely what makes it trustworthy: a tool that will not invent an answer about
the venue is a tool whose answers about the venue can be believed. When it
cannot answer from the data it says so and offers the nearest documents.

---

## 9. What-if, and the decision log

**What-if.** Fork the plan, change something, see what breaks, discard or
commit. Raise capacity from 120 to 130 and see the budget, the per-head cost,
the drink plan and the seating warnings all move, without touching the real
plan. Implemented as a copy-on-write overlay keyed to a `scenario_id`, with the
check catalogue run against the overlay.

A spreadsheet maximalist does this today by duplicating the file, and then has
two files. This is the feature that gets her to stop.

**Decision log.** Already in the base spec, and underrated there. What was
decided, when, what the options were, why, with the quotes and threads linked.
For this persona it is not documentation, it is the thing that stops the same
argument happening twice in March and again in July. Promote it from a V2 table
to a first-class surface, and let the model draft the rationale from the linked
thread for her to edit.

---

## 10. Two people

- `collaborators` already carries owner and partner
- Live presence per grid, so nobody edits the same row twice
- Per-field audit: `changes(wedding_id, table_name, row_id, field, old, new, by, at)`,
  which also backs undo
- A **weekly briefing**, one email on Sunday evening: what moved, what is at
  risk, what needs a decision this week, five bullets, both partners. This is
  the retention loop and the single highest-value generated artifact in the
  product
- **The app chases, the partners do not.** No task assignment notifications
  between the two of them, ever. The system is allowed to nag. They are not.

---

## 11. Mobile

Capture and lookup, per principle 8.

- Photograph a quote at a viewing, it lands in the review queue
- Voice note on the drive home becomes candidate tasks and notes
- Lookup: who is at table 4, what is the florist's number, what did we agree
- The day-of pack, offline, because venue wifi fails

No grid editing on a phone. Attempting it produces a bad grid and a bad phone
app.

---

## 12. What this overturns in the base spec

### Gmail. The forwarding address replaces OAuth entirely.

The base spec spends a page on Gmail OAuth in Testing mode, refresh tokens that
expire every 7 days, a permanent reconnect banner, and CASA if it is ever
published. All of that was reasoned correctly for a personal tool. Architected
as a product, it is disqualifying.

**Use a per-wedding inbound address.** `w-8f3a21@in.example.com`. She sets one
forwarding rule, or forwards threads by hand. Vendors can be given the address
directly.

- No OAuth, no verification, no CASA, no restricted scopes
- No 7-day token expiry and no reconnect banner
- Works with Gmail, Outlook, iCloud and anything else, identically
- Survives productisation with no change
- Sending already goes out over the authenticated domain from V1, so threading
  by `In-Reply-To` and `References` works without Gmail

The cost is that forwarding must be set up once, and that a thread only exists
in the app from the point forwarding starts. Both are acceptable. Retire options
1, 2 and 3 from the base spec's Gmail section.

### Semantic search moves from V4 to the first AI release

It is the payoff for ingestion, not a nice-to-have after it.

### Tasks and checklists move ahead of vendors

Already argued in [`planning-spreadsheet-gaps.md`](planning-spreadsheet-gaps.md).
The AI layer reinforces it: extraction needs somewhere to write, and tasks and
checklists are the cheapest useful targets.

### The decision log is promoted

From a V2 table to a first-class surface with model-drafted rationale.

---

## 13. Deliberately not building

No chatbot as the primary surface. No AI mood boards, theme suggestions or
colour palettes. No generated vows or speeches. No auto-send to vendors. No
auto-seating. No vendor marketplace. No AI that books anything.

Every one of these is a demo that this persona would find either useless or
insulting, and several of them are how competitors have already lost her.

---

## 14. Build order

**V1's code is complete. V1 is not done, and this is phase 0's real
prerequisite.** Guest list, ranking, invitations, RSVP and exports are built,
type-checked and unit-tested, and none of it has talked to the live database,
been opened in a browser, sent an email or been printed. `docs/HANDOFF.md`
section 4 has the list, and none of it can be closed from a coding session
alone.

Nothing below starts until that is closed. Building a better grid on top of an
application nobody has ever signed into is how you find out in month four that
the RLS policies never held. The sending domain in particular sits days of DNS
propagation in front of the one immovable deadline.

| Phase | Contents | Why here |
| --- | --- | --- |
| **0. Grid and import** | Grid control, paste-from-Excel, xlsx read and write, multi-sheet workbook mapping on top of the existing CSV importer | No AI in the user's way. This is the week she either switches or does not. Guest CSV import already ships |
| **1. Tasks and checklists** | Per the gaps addendum: checklist primitive, four seed templates, task templates generated from the wedding date, plus the answers view V1 never built | Cheap, gives extraction somewhere to write, and two vigilance checks need answers readable |
| **2. Ingest and extraction** | Inbound address, upload, photo, voice, candidates, review queue, provenance | The core AI loop |
| **3. Vigilance** | Check catalogue, observations, weekly briefing, derived-number registry | The reason she keeps it |
| **4. Vendors, money, search** | V2 of the base spec, plus pgvector search and scoped ask | The heavy half |
| **5. What-if and the day** | Scenarios, then V3 seating, run of show and the printed pack | Only useful once RSVPs are in |

**Every table in this document is a new migration.** `0001`-`0003` are applied
to the live project and frozen, per `docs/HANDOFF.md` section 8. Add `0004_...`
and later; never edit an existing one, or a fresh database and the live one
diverge silently.

Phases 0 and 1 contain no AI at all. That is deliberate. The product has to be
worth using before the model does anything, or the model is decorating an app
she has already abandoned.

---

## 15. Honest risks

**Extraction quality on PDFs is uneven** and vendor quotes are the worst of it:
scanned, photographed, laid out in tables that are really images. Mitigation is
the candidates model, which makes a bad extraction a rejected suggestion rather
than a corrupt row. Measure accept rate per field per prompt version from week
one, and be willing to disable extraction for a document class that does not
clear a bar.

**Hallucination in narration.** Mitigated structurally: the model never detects
and never writes to a table. It renders `facts` into a sentence, and the UI can
render `facts` without it. If the model is wrong, the sentence is wrong and the
number is still right.

**Cost per wedding.** Ingestion plus embeddings plus a weekly briefing across a
14-month engagement is a real number that has to be known before anything is
priced. Instrument `extractions.cost_minor` from the first call.

**The grid is a genuine engineering project**, not a weekend. Underbuilding it
loses the user in week one, which makes every phase after it moot.

**Inbound email is a spam and abuse surface** once addresses are public. Verify
the sender against known vendor contacts, quarantine the rest, and rate-limit
per address.

---

## 16. Open decisions

1. **Inbound email provider.** Postmark, Mailgun or SES for the receiving side.
   Decide alongside the existing sending provider, ideally the same vendor.
2. **Model routing.** One capable model for extraction and a cheap one for
   narration, or one model throughout. Affects cost materially and nothing else.
3. **How far the product framing goes now.** Multi-tenancy is already in the
   schema. Billing, onboarding and support are not, and should stay out until
   after the wedding.
4. **Whether what-if scenarios ship before the day-of tooling.** Argued for
   above, but it is the one phase that could slip without hurting the wedding.
