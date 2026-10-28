# Feature spec: A registry link, as a block on the invitation site

**Status: proposed, not built.** Asked for as a spec; nothing beyond this file
exists. Per `CLAUDE.md` and `docs/specs/README.md`, nothing is built until the
planner says "build it" in words that mean write code, and answering §9's
questions is not that.

**Depends on:** spec 36 (the registry, `/registry/<slug>`, `registry_settings`),
spec 23/28 (the block catalogue, the household page, the editor), spec 21 (a
household's address is a credential). All built. **No migration is proposed**
(§6) — `site_blocks.type` is free text with a shape check, so a new block type
is code only.

## 1. What was asked

> *Can we please spec out adding the registry link to the invite site as a
> block.*

Read as: the couple's invitation site (the page a household opens from their
own link, `/w/<wedding>/<household>`) should be able to carry a section that
sends people to the gift registry — added from the editor's block palette like
any other section, with the couple's own words, in the site's own theme.

## 2. What exists today, and the gap

- The registry is a public page at `/registry/<wedding slug>`, deliberately
  **separate from every invitation** (spec 36 §3), with its own palette and
  fonts (Q7). It is off until the couple switch it on.
- The invitation site is a stack of blocks. The closest sibling is **A gift**
  (`gift_funds`): bank-transfer funds and a Contribute popup. It is about
  *money*; the registry is about *things*. Spec 36 §9 kept them apart on
  purpose ("one idea per place") and that stands.
- **There is no way to point a guest at the registry from the invitation.**
  Spec 36 §9 left it as "a registry link can be added to the invitation as an
  ordinary link in a block they write". That means pasting
  `https://<host>/registry/<slug>` by hand, which goes stale if the address
  changes, still shows when the registry is off (a "This link isn't active"
  page — the worst thing to hand a guest), and has no button, label or place in
  the palette. This spec replaces that suggestion with a block.

## 3. The shape, in one paragraph

A new block type, **`registry_link`** ("Our registry", family *the day*, next
to *A gift*). It draws the site's usual section heading, one line the couple
write, and **one button** that opens `/registry/<slug>`. The address is
**computed when the page renders**, never typed or stored, and the block shows
**only while the registry is switched on** — so the couple can add it to the
site now, publish, and have the button appear the moment they turn the registry
on. It sends no information about who is clicking. It reads no items, no
claims and no address (§5).

## 4. What a guest sees

- A section in the page's own theme (`siteTokens()` — this is the *site*, not
  the registry; the registry keeps its own look once they arrive):
  `04 · REGISTRY` eyebrow, a heading, a line, a button.
- **Defaults** (all editable, §7): heading **"Gifts"**; line **"Your being
  there is the gift. If you'd like to give something too, we've made a list."**
  (the registry's own hero line, spec 36 §4.2, so the two pages speak alike);
  button **"See our registry"**.
- The button is styled like the Playlist block's (`media.tsx`) and opens in a
  **new tab** (`target="_blank"`, `rel="noopener noreferrer"`) — the same
  convention, for a better reason here (Q3).
- **Nothing else.** No item photos, no counts, no "12 gifts left" (Q1).
- When the registry is off or not set up: **the section is absent** — not an
  empty heading, not a dead button (Q2).
- When the registry is **on but closed** (`open = false`: the page stays up,
  claiming is off): the block stays; the registry page already says thank you.

## 5. Privacy — what the block may and may not touch

The registry's rule is that a visitor never sees another visitor's name or
message, and that the delivery address is shown only after a claim. This block
sits on a page that is *more* sensitive than the registry (a household's
address is a credential and the page holds guest names and RSVP answers), so:

1. **One address for everyone.** The link is `/registry/<slug>`, byte for
   byte the same on every household's page. **No household id, token, suffix or
   `?from=` is appended** — spec 36 §1 ("No custom links per guest") and §3
   ("nothing ties a claim to a guest record"). The registry cannot learn which
   household came, and this block must not make it able to.
2. **No Referer leak.** `rel="noopener noreferrer"` means the registry never
   receives the household's private address as a referrer. The block gets its
   own test for this (§8).
3. **Reads two booleans, nothing more.** The page loader gains a tiny read of
   `registry_settings` — `enabled` and `open` — through the existing
   service-role extras reader. **It must not read `registry_claims`,
   `registry_shipping`, items or tags**, and a source guard in the style of
   `src/server/registry/public.test.ts` fails if those names ever appear in it.
4. **The URL cannot be pointed elsewhere.** The payload has no URL field, so
   the "javascript: in a link the whole guest list clicks" problem
   (`playlist`'s `https` refinement; `contribute_url`'s check) does not arise.
   The only URL is built from `ctx.wedding.slug`, which already passed its own
   slug rules.
5. **The preview-only path never reaches a guest.** In the editor's preview the
   button goes to `/registry/<slug>?preview=1` so the couple can click through
   to a registry they have not switched on yet (the registry page already lets
   the signed-in couple do that). A guest's link never has it. Same pattern as
   `ctx.preview` elsewhere: the preview has no credential, so it can show more
   without being able to change or leak anything.

## 6. Data

**No migration. No new table. No change to the SQL suite.** Facts checked:

- `site_blocks.type` is `text` with `check (type ~ '^[a-z][a-z0-9_]{1,40}$')`
  (`0025`); `registry_link` passes. The app validates against its own
  catalogue on every write.
- The block's payload is two optional strings (`intro`, `button_label`) plus the
  title keys every titled block already gets (`heading`, `eyebrow`,
  `hide_heading`, spec 28 §7.2).
- Existing published revisions are unaffected: `toBlock()` drops types it does
  not know, and nothing publishes this type until a planner adds it.
- No new table, so the **audit-log exception rule** (`18_audit_log.sql`) is not
  triggered. `site_blocks` is already audited.

## 7. Where it goes in the code

Following the repo's conventions (pure logic in `src/lib/`; reads in
`src/server/queries/`; no logic inline in a `"use server"` file). All of this
is for the build, not for now.

| File | Change |
| --- | --- |
| `src/lib/site/blocks.ts` | Add `"registry_link"` to `BLOCK_TYPES` and a `BLOCKS` entry: label "Our registry", family `the day`, `max: 1`, eyebrow "Registry", heading "Gifts", styles `width`, `background`, `align`. |
| `src/lib/site/block-schemas.ts` | `registry_link: z.object({ intro: optionalText, button_label: optionalText })`. A type that forgot this would accept a Title and strip it (spec 28). |
| `src/lib/site/block-fields.ts` | Fields for the two keys; `managedElsewhere: "/gifts/settings"` so the form says where the registry itself is switched on. Not `/registry/…` — the planner's screens are `/gifts` (HANDOFF session 42). |
| `src/lib/site/starter.ts` | An entry (the table is exhaustive over `BlockType`): the §4 defaults as the starter payload, so a new block arrives written, not empty. |
| `src/server/queries/site-extras.ts` | `SiteExtras` gains `registry: { enabled: boolean; open: boolean } \| null`, read with the other extras. An error (e.g. `0039` not applied) reads as `null` — the `giftBank` precedent: costs the section, never the page. |
| `src/lib/site/blocks.ts` — `visibleBlocks` | **See §7.1 — this is the one non-obvious change.** |
| `src/components/site/blocks/render.tsx` | A `registry_link` case; a small `RegistryLink` component beside `Playlist`. |
| `src/lib/site/*.test.ts` | §8. |

### 7.1 The numbering trap (why this isn't just a render case)

`gift_funds` returns `null` from the renderer when there is nothing to show.
But the page's chapter numbers, its rail and its top bar are worked out
**before** rendering, by `sectionNumbers(visibleBlocks(blocks))`
(`builder.tsx:262`, the household page, the preview page). So today a *A gift*
block with no funds still takes a number: a guest sees `03 · …` then `05 · …`,
and a chapter-rail entry that jumps to nothing. `visibleBlocks` already solves
exactly this for "On the day" (it is dropped *there*, "before the numbering,
the chapter list and the top bar are worked out, so none of them is left with a
gap").

So `registry_link` must be dropped in `visibleBlocks` when the registry isn't
live — which means `visibleBlocks` needs one more input
(`visibleBlocks(blocks, { registryLive })`), passed by its three callers.
**The editor and preview must pass `true`** (the planner needs to see and
select the block while the registry is off — shown with a planner-only note,
Q2, never as a hole a guest could see).

The `gift_funds` gap is **pre-existing and not fixed here** (Q6 asks).

## 8. Test plan

- **Pure:** the URL builder (slug in, `/registry/<slug>` out; `?preview=1` only
  when asked; nothing else ever appended — one test that no household-shaped
  input can reach it); defaults when `intro`/`button_label` are blank.
- **`visibleBlocks`:** the block is dropped when the registry is off and kept
  when on; with it dropped, `sectionNumbers` reads 01…N with no gap; the editor
  path (`registryLive: true`) keeps it.
- **Catalogue ties** (these already exist and must keep passing): `blocks.test.ts`,
  `block-schemas.test.ts`, `block-fields.test.ts` (schema accepts exactly the
  form's keys), `starter.test.ts` (exhaustive). `switches.test.ts` needs no
  entry — the block adds no element beyond itself, and the block's own
  `visible` toggle is its switch — confirm at build.
- **Source guards** (the repo's style): the extras reader names neither
  `registry_claims` nor `registry_shipping` nor `registry_items`; the rendered
  anchor has `noopener noreferrer`; the component takes no household or token
  prop.
- **Checks, as this repo runs them:** `npm run typecheck`, `npm test`,
  `npm run build`. `./scripts/verify-migrations.sh` is **not** needed (no SQL)
  and the handoff would say so.
- **Not verifiable by those:** that the block looks right in each palette and
  on a phone, that the editor palette lists it, and that the button reaches a
  live registry. The app has never run against a live Supabase project. The
  build report must say which of these it actually did.

## 9. Open questions — each with a recommendation

| # | Question | Recommendation |
| --- | --- | --- |
| **Q1** | How much does the block show? (a) heading, a line, a button; (b) also a strip of 3–4 item photos, starred first; (c) the registry's hero photo. | **(a).** (b) puts items on every household's page, which means the household-page loader reading `registry_items` — more surface and more to keep in step with the registry's "taken" rules for a link that is one tap from the real thing. Add it later if wanted; nothing here blocks it. |
| **Q2** | Registry off or not set up: hide the section from guests, or show it anyway? | **Hide, checked live.** A button to a "This link isn't active" page is worse than no button; checking at render means turning the registry on needs no site republish, and turning it off removes the button at once. The editor shows a planner-only note ("Your registry is switched off — guests won't see this section yet") with a link to `/gifts/settings`. |
| **Q3** | Same tab or new tab? | **New tab.** It is the Playlist convention, and the one real reason is that a household may be halfway through the reply form (what they've typed lives only in the page's state); leaving the tab would lose them. Costs one extra tap on a phone. |
| **Q4** | The words. Are the §4 defaults ("Gifts" / the hero line / "See our registry") right, or do you want your own? | **Keep, editable.** They are only a starting point; the form lets you change all three. |
| **Q5** | Should new sites' starter templates (the three offered on an empty site) include this block? | **No.** The registry is off by default and most couples won't have one when they first build the site; the palette is where they'll look for it. |
| **Q6** | `gift_funds` has the same numbering gap (§7.1) today. Fix it in the same change by giving `visibleBlocks` the same kind of check? | **Not in this change.** It's a separate, pre-existing bug and "smallest correct change" says to file it. Say so if you want it folded in — it is a few lines once §7.1 exists. |
| **Q7** | Also link the registry from the **save-the-date** page, which is a designed card of its own and not made of blocks? | **No, out of scope.** It would be a different mechanism (a toggle and a line in `save_the_date` config). Worth its own small spec if you want it. |

## 10. What this deliberately does not do

- **No per-household or per-guest registry link**, no tracking of who tapped it
  (§5.1) — the registry is not tied to guests, as spec 36 asked.
- **No registry content on the invitation page** — no items, counts, prices,
  photos or "who bought what" (Q1).
- **No change to the registry itself**, its look, its claims, or the `/gifts`
  screens.
- **No change to *A gift* (`gift_funds`)** — money and things stay in separate
  blocks (spec 36 §9). A couple who want both place the two blocks side by side.
- **No free-form URL field.** The block can only point at this wedding's own
  registry; for any other link there is the Words block or the Playlist
  button.
- **No new email, notification or analytics.**

## 11. Size

Small: one block type, one schema entry, one form entry, one starter entry, one
renderer case and component, one extras field, one parameter on
`visibleBlocks`, and tests. No SQL, no new dependency. The only place a careless
build can do harm is §7.1 (a numbering gap) and §5.1–5.2 (leaking which
household clicked), which is why both have tests of their own.
