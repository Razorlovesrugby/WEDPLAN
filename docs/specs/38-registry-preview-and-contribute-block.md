# Feature spec: A live preview on the registry, and a Contribute block you can put above or below the gifts

**Status: proposed, all seven questions answered (2026-11-02) — not built.
Asked for as "a story"; this is the spec. Nothing beyond this file is written,
and nothing is built until the planner says to build it** (`CLAUDE.md`, "Spec
requests are not build authorization"; answering the questions is not it).

## Answered — 2026-11-02

| # | Question | Answer |
| --- | --- | --- |
| 1 | Refresh on Save, or live as you type? | **On Save** (recommended). |
| 2 | Share the site builder's `PreviewFrame`? | **Share it** (recommended): extract to a shared component. |
| 3 | Editable heading and line? | **Yes** (recommended): `contribute_heading`, `contribute_text`. |
| 4 | Bank details visible to anyone with the registry link? | **Yes, with a plain warning** and a guard against the link preview (recommended). |
| 5 | "Button only, hide the fund list" option? | **Yes, add a switch** — **against the recommendation.** See §5.6. |
| 6 | Contribute on a closed registry? | **Yes, keep showing** (recommended). |
| 7 | Preview on the Items tab too? | **Settings tab only** (recommended). |

**Depends on:** spec 36 (the registry page and its settings), spec 28 §6.1 and
`0033` (the site's gift block, Contribute popup and bank details), spec 37 (the
"View our registry" button, which this is the other half of), the site builder's
preview (specs 23/24/28). **`0026`–`0041` are not applied to the live project**
(`docs/HANDOFF.md`); this would be `0042` and stacks on them.

## 1. What was asked

1. "Add a preview builder like the site, for the registry."
2. "A toggle to turn on a **Contribute** — like the gift block on the site — for
   people who don't want to get a gift but want to contribute."
3. "I can choose to put it **above or below** the gifts."

## 2. Story

> **As the couple**, setting up our registry, **I want** to see the page as a
> guest will while I change its words, look and sections, **so that** I'm not
> saving blind and opening a new tab to check.
>
> **As the couple**, **I want** to offer a Contribute button on the registry for
> the guest who'd rather give money than buy a thing, and choose whether it sits
> above the gifts or below them, **so that** the people who don't want to buy an
> item can still give without hunting for how.
>
> **As a guest** with the registry link, who doesn't want to buy an item,
> **I want** a clear Contribute button, **so that** I can see how to give and
> copy the bank details without being pushed through "I'll buy this".

**Acceptance, in plain words**

- On Registry → Page & address there is a preview of the public page beside the
  form, with a phone / laptop switch. After **Save the page** it shows what was
  saved. It never saves anything by itself and nothing pressed inside it counts
  as a real claim.
- There is one control, **Contribute button**, with three choices: *Off*,
  *Above the gifts*, *Below the gifts*. It replaces the existing "Also show
  your gift funds at the bottom" tick.
- Whichever is chosen, the section looks like the site's gifts block: the funds
  (name + line), then the **Contribute** button opening the same popup of
  copyable bank details. Pressing it never takes money and never records who.
- If there is nothing to show (no bank details, no online link, no funds), the
  page shows nothing — and the settings screen says so, with a link to where to
  add them, instead of silently doing nothing.

## 3. What exists today (so the change is the smallest one)

- `registry_settings.show_funds` (boolean, default false) already puts the site's
  `GiftFunds` — funds plus **Contribute** — at the **bottom** of
  `/registry/<slug>`, headed "Or give towards something bigger"
  (`registry-view.tsx`, `settings-form.tsx`, `server/registry/public.ts`).
  What is missing is the **position**, the **wording**, and any **hint when it
  has nothing to show** (`hasFunds` is simply false and the section vanishes).
- The preview is a link, **View as a visitor** (`?preview=1`), that opens the
  page in a new tab. It reads **saved** settings. There is no in-page preview.
- The site builder has the real thing: an iframe laid out at the true device
  width and scaled (`PreviewFrame`, private to `builder.tsx`), refreshed in
  place by a message so scroll position survives (`PreviewBridge`,
  `/site/preview`). The registry has neither the frame nor the bridge.

## 4. Part A — the preview

**4.1 Shape.** On `/gifts/settings`, the form on the left and a preview on the
right (stacked under it on a phone) — the same arrangement as `/site`. The frame
is `/registry/<slug>?preview=1`, already planner-only and already safe to show
(no saving, shows even when the registry is switched off, with its banner).

**4.2 Phone / laptop switch.** Same two widths and the same
laid-out-at-real-width-then-scaled approach as the site's frame (so media
queries resolve at the width a guest has). `PreviewFrame` is currently private
to `builder.tsx`; the cleanest build moves it to a shared component and has both
screens use it. **That touches the site builder** (behaviour unchanged by
reading, but it is a refactor of a screen this build is not otherwise about) —
see Q2.

**4.3 When it refreshes.** The decision for the planner (Q1):

| | Behaviour | Cost |
| --- | --- | --- |
| **Recommended** | Refreshes **after Save**. A line under the frame says "Showing what you last saved" and turns into "You have unsaved changes" while the form differs from what was saved. | Almost nothing: `router.refresh()` already runs on save; the frame reloads in place. |
| Live as you type | The frame re-renders on every keystroke from the unsaved form. | Needs a draft path through a page that reads the database: either autosave (a different save model from the Save button this form has today) or passing an unsaved draft to the page, which then renders content nobody has stored. Real work, and exactly where "the preview says one thing and the guest sees another" bugs come from. |

**4.4 What it must not do.** Open the page in the planner's preview mode only —
the same planner-session check the route already has (`previewAllowed`). It must
not change which public paths exist; the public route stays `/registry/<slug>`
and the planner's screens stay under `/gifts` (the route trap in spec 36).

## 5. Part B — the Contribute block

**5.1 The setting.** One field replaces the boolean:
`registry_settings.contribute_position` — `'off' | 'above' | 'below'`
(text with a check constraint, **not** an enum, so the migration is one file with
no `55P04` split). Default `'off'`.

**5.2 Migration `0042` (additive).** Add the column; backfill
`'below'` where `show_funds` is true and `'off'` otherwise, so no registry changes
appearance; leave `show_funds` in place and **unread** (the precedent is
`gift_funds.target_minor`, kept and ignored, rather than editing or dropping in
an append-only history). `registry_settings` is already audited and in the RLS
list; no new table, so nothing for `18_audit_log.sql` or the tenant-tables array.
A SQL test: default, backfill from `show_funds`, and the check refusing any
other value.

**5.3 Where it renders.**

- **Above:** after the thank-you card, the "no gifts" line and the closed notice,
  and **before** the filter bar and item grid — so it is the first thing after
  the opening words, not wedged between filters and items.
- **Below:** where it is today, after the grid.
- Same markup, in both places, from the existing `GiftFunds` component (the one
  the site's gifts block uses — one definition, so the two cannot drift).

**5.4 Wording (Q3).** Today the heading is fixed: "Or give towards something
bigger". Above the gifts that reads wrongly ("Or" with nothing before it) and
for someone who doesn't want to buy anything the wording matters most. Proposed:
two optional fields, `contribute_heading` and `contribute_text`, blank = a
default that depends on the position (above: "Prefer to contribute?"; below:
"Or give towards something bigger"). Without them the toggle ships with one
awkward line in one of its two positions.

**5.5 When there is nothing to show.** `GiftFunds` renders nothing without funds,
bank details or an online link. The settings control therefore reads the same
data the page does and, if empty, says: "Nothing to show yet — add your bank
details under Site → A gift" with a link, in the same style as the card spec 37
put on `/site/gifts`. The setting is still saved; the page is simply empty until
there's something to show.

**5.6 Contribute-only (Q5: yes, a switch).** The site's block lists funds by
name and line. The registry gets a tick under the position control, **"Show just
the button — don't list the funds"**, stored as
`registry_settings.contribute_button_only boolean not null default false` (a
second column in `0042`). When on, the section renders the heading, the line and
the Contribute button only; the funds are not read for the public page. It does
nothing, and says so, when there are no bank details or online links (a button
with nothing behind it). The site's own gifts block is unchanged.

## 6. Things worth saying out loud

- **The bank details become visible to anyone who has the registry link.** On the
  site the Contribute popup sits behind a household's private address (the
  credential); `/registry/<slug>` is, by design, one address "sent to anyone"
  (spec 36 §3) with no credential. The existing `show_funds` already has this
  property; this spec makes it easier to switch on, so the control's hint must
  say it plainly: "Anyone with the registry link can see these details." The
  page is `noindex`, and the existing rule stands that account details are in
  the page HTML inside the closed dialog and **never** in the link preview, the
  Open Graph image or metadata — a source-guard test for the registry's
  `opengraph-image.tsx` and metadata is cheap and worth adding (Q4).
- **A closed registry** (`open = false`, "stop new claims") still shows
  Contribute by default: contributing isn't a claim, and the page after the
  wedding is mostly a thank-you. (Q6.)
- **Nothing here takes money or knows who gave** — same as the site. The
  contributions ledger spec 25 §16 declined is still not built.

## 7. Build order (when authorized)

1. `0042` + SQL test + `scripts/check-migrations.sql` / migrations README entry.
2. `src/lib/registry/` pure helper for the section order (above / below / off),
   unit-tested; schema, `defaultRegistrySettings`, `saveRegistrySettings`
   (zod: the three values), the public loader reads `contribute_position`.
3. `RegistryView` renders the section in the right place; the settings control
   replaces the tick, with the empty-state hint and the visibility hint.
4. The preview: extract `PreviewFrame` (if Q2 agrees), add it beside the form
   with the device switch and the "last saved / unsaved" line.
5. Verify: `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`
   (non-root user), `npm run build` — and **say which of them was a browser**.

## 8. Test plan

- Unit: placement helper (off/above/below × has-content/empty); zod accepts the
  three values and rejects others; the "unsaved changes" comparison.
- Source guards: the public loader never selects the address or claims (existing,
  must still pass); the registry's OG image and metadata never import bank details.
- SQL: default `'off'`; backfill; check constraint; RLS second-account unchanged.
- Browser (headless Chromium on sample data, as spec 36 did): above, below, off,
  empty; phone and laptop frames; Contribute popup on the registry. **Not
  verifiable here:** Supabase, a real phone, an in-app browser's Clipboard API.

## 9. Open questions — each with a recommendation

1. **Refresh on Save, or live as you type?** *Recommend on Save* (§4.3); live
   typing is a separate, larger piece of work if it turns out to be wanted.
2. **Share the site builder's `PreviewFrame`, or copy it?** *Recommend extract
   and share* — one device-width implementation — accepting a small refactor of
   `builder.tsx`. Copying would leave two that drift.
3. **Editable heading and line for the block?** *Recommend yes* (§5.4).
4. **Is it fine that the registry link shows bank details to anyone holding it?**
   *Recommend yes, with the plain hint and a guard against it leaking into the
   link preview* — it is how the existing toggle already behaves. The
   alternative (show Contribute only to someone who first gives a name) is a
   different feature.
5. **Do you want a "button only, hide the fund list" option on the registry?**
   *Recommend no*, for now (§5.6).
6. **Show Contribute on a closed registry?** *Recommend yes* (§6).
7. **Should the preview also appear on the Items tab**, so adding a gift shows
   in place? *Recommend settings tab only first*; the frame component is the
   same, so it is an hour's work to add later.

## 10. What this deliberately does not do

- Take, track or total contributions, or show who gave (no payment path).
- Change the site's own gifts block, its Contribute popup, or `/site/gifts`.
- Add above/below placement anywhere but the registry page.
- Make the preview editable by clicking in it (the site builder's
  click-to-select) — the registry has no blocks to select.
