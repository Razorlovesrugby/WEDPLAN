# Spec 24 — The builder, as a tool you can work in

**Status: proposed, not built.** No migration, no SQL, no new table — every
change here is presentation and interaction over the model
[spec 23](23-site-builder-and-widgets.md) already built. Its §9 open questions
need answers before anything is written, per
[`docs/specs/README.md`](README.md).

**Depends on:** spec 23 (the block catalogue, `site_blocks`, `site_revisions`,
the builder, the preview route), built 2026-09-21. Nothing in spec 14, 21 or 22
changes.

**Scope, decided before writing:** the *editing feel* — the preview keeping its
place, a new block arriving with something in it, one rule about saving,
controls that speak English, a block list you can read at a glance, and the
phone. Click-the-preview-to-edit, a publish diff and draft undo were considered
in the same round and deliberately left out; §8 says why and what it would take.

---

## 1. What was asked

> "Last session I started with the blocks as part of the wedding invites, now
> let's brainstorm a spec to make it look more functional."

Spec 23 built the right model. `site_blocks` as the draft, `site_revisions` as
what guests see, twenty-one types in one catalogue, one renderer for three
callers — none of that is in question here and none of it changes. What it did
not get is the hour of work that makes a builder feel like a builder rather
than a form with a picture beside it.

## 2. The caveat this spec is written under

**Nothing in spec 23 has ever been opened in a browser**, and `0022`–`0025` are
not applied to the live project. Every problem below was read off the source,
not off a screen. They are solid readings — most are a single identifiable line
— but a planner spending half an hour with this running would almost certainly
reorder the list and add three things nobody has thought of. That is worth
doing before or alongside this build, not instead of it.

The one class of problem this spec therefore cannot contain is the one that
needs eyes: whether the Script theme's blocks actually sit well next to each
other, whether the type scale holds on a photo band, whether the preview at
390px is legible. Those are a browser pass, not a spec.

## 3. What is wrong, and the line it is wrong on

| # | What it does | Why it reads as unfinished |
| --- | --- | --- |
| 1 | The preview scrolls to the top on every edit | `previewKey` is a JSON hash of every block's payload (`src/app/(planner)/site/page.tsx:69`) used as the iframe's React `key` (`builder.tsx:311`). Every save remounts the frame. Edit the footer, watch the hero |
| 2 | A new block is invisible | `addBlock` inserts `payload: {}` (`site-blocks.ts:199`). Add a photo band and the preview shows nothing — the block is there, rendering empty. The first press of "Add a block" looks broken |
| 3 | Two save rules in one panel | The words need the Save button; style, audience and the photo picker write immediately. §5 of spec 23 specified autosave and the build shipped a button |
| 4 | The controls speak schema | Background reads `paper / tinted / ink`, width `contained / wide / full`, shape `natural / square / portrait / wide`. The repeat-group heading prints the raw payload key (`block-inspector.tsx:148`), so the FAQ editor has a section headed **"items"** |
| 5 | The block list is unreadable at a glance | Rows carry the type label only. A photo-led page is `Photo band / Photo band / Photo band`; two `Words` blocks are indistinguishable |
| 6 | The phone has no preview at all | The preview column is `hidden lg:block` (`builder.tsx:286`), where spec 23 Q7 said it becomes a toggle. There is also no reorder on a phone — the drag handle is `lg:block` (`builder.tsx:355`) with no fallback |

Six items, five of them a line or two. That ratio is the case for doing this
now rather than filing it as polish: the gap between how this feature reads and
how much work it needs is the widest in the project.

## 4. The preview keeps its place

**The problem is the remount, not the refresh.** The `key` prop is doing the
job of "show me the new draft" by destroying and rebuilding the frame, which
also throws away scroll position, any open FAQ accordion, and the lightbox.

**Decided: a one-way refresh message, parent to frame.** `/site/preview`
mounts a small client component that listens for a same-origin `postMessage`
and calls `router.refresh()`. The route is already `force-dynamic` and reads
`listDraftBlocks`, so a refresh re-renders it server-side against the current
draft — with the scroll position intact, because nothing unmounted. The builder
posts that message when a write succeeds, in place of changing `previewKey`.

`previewKey` then goes away entirely, and with it the JSON-stringify of every
payload on every render of `/site`.

**One way only, and that is the whole point.** The frame never posts back.
Frame-to-parent is what click-to-edit needs (§8), it is a much larger design,
and building the outbound half now does not commit us to it.

**A companion, nearly free: anchor the frame at the block being edited.**
`blockNavItems` already renders `#<type>` ids into every navigable block, so
`/site/preview#schedule` lands on the schedule. When the planner selects a
block, the preview scrolls to it. This is the half that makes a long page
workable, and it is worth having whether or not the message channel lands
first — see §10 question 1.

**And debounce.** A refresh per keystroke-save is a server round trip per
keystroke. ~400ms after the last write, once.

## 5. A new block arrives with something in it

An empty payload is honest and unusable: the planner presses a palette entry,
nothing appears, and the only recovery is to guess that the block exists and
needs filling in.

**Decided: every block type gets starter content, written in the catalogue
beside its blurb.** `addBlock` inserts that instead of `{}`. The FAQ block
already has the shape of this in `FAQ_LIBRARY` and its "Add the usual
questions" button; this generalises it to one `starter` field per `BlockDef`.

A photo block has no words to start with, so its starter is the placeholder
tile the renderer already needs for a `gallery` with no images — a framed grey
panel saying "Choose a photo", visible in the preview and never in a published
revision (§10 question 2 settles whether that promise is enforced or merely
intended).

**What this costs, said plainly:** starter words are words on a page, and a
publish is one button. Somebody will publish "We met in a queue for coffee" to
a real wedding site. §10 question 2 is that trade — sample prose the planner
edits, versus ghost text that cannot be published and cannot show what the
block looks like full.

## 6. One rule about saving

**Decided: everything autosaves, and the Save button goes.** Spec 23 §5 asked
for this and the build did not get there. The draft is not public — that is the
entire architecture — so there is nothing a stray keystroke in it can damage.

- Text fields save ~600ms after typing stops, and on blur.
- Style, audience and the photo picker keep saving immediately, as now.
- The panel says "Saved" against a timestamp rather than offering a button,
  which is the only way the planner can tell autosave is working.
- A failed write says so in place and keeps the typed value on screen. The one
  thing autosave must never do is lose words silently while looking calm.

Field-level validation stays where it is: `BLOCK_SCHEMAS` in
`src/server/actions/site-blocks.ts` is the only thing standing between a
malformed payload and a wedding site, and autosave does not soften it. A field
that fails validation is not saved and says why, exactly as the Save path does
today.

## 7. Controls in English, and a list you can read

### Style controls

Width, background, alignment and shape become labelled choices rather than
enum values in a `<select>`:

| Key | Today | Proposed |
| --- | --- | --- |
| `width` | contained / wide / full | Normal / Wide / Edge to edge |
| `background` | paper / tinted / ink | Plain / Tinted / Dark |
| `align` | left / centre | Left / Centred |
| `shape` | natural / square / portrait / wide | As taken / Square / Tall / Wide |

The stored values do not change — this is a label map, so no migration and no
rewrite of existing rows. Background and shape are the two worth rendering as
swatches rather than words, because both are questions about how something
looks and neither has an answer in text.

### The repeat-group heading

`block-inspector.tsx:148` prints `form.repeat.key`. Every form already carries
`repeat.noun` — `"milestone"`, `"question"`, `"person"`, `"suggestion"` — used
two lines later in "Add a {noun}". The heading should use the noun, pluralised
and capitalised. **A one-word change that turns a section headed "items" into
one headed "Questions."**

### The block list

Each row gains, beside the type label:

- **A content snippet** — the block's own heading, or the first few words of
  its first text field, or the photo's alt text. Twenty-odd characters. This is
  what makes three `Photo band` rows into three distinguishable rows.
- **A thumbnail, for photo blocks only.** `/site/page.tsx` already signs every
  `site_assets` URL for the picker, so the image a `hero`, `gallery`,
  `photo_band` or `photo_text` block points at is already in hand — the
  thumbnail is a lookup, not a new query. Non-photo blocks get their family's
  icon; rendering an actual thumbnail of an arbitrary block means rendering the
  block, which is §8's problem.
- **An "empty" marker** on a block whose payload is still its starter or blank,
  so a page with three unfinished blocks says so in the list rather than only
  in the preview.

### The page notes

`pageNotes` produces good advice ("No schedule yet. It is the thing guests look
for first") and the builder renders it as a plain grey `<ul>` of `text-xs`
above the columns, which is where advice goes to be ignored. Same words,
rendered as something a planner reads once and acts on — grouped under one
heading, tone-differentiated between thin and bloated, dismissible for the
session. No change to the function.

## 8. Deliberately out, and what it would take

**Click a section in the preview to edit it.** The thing that would make this
feel like Squarespace. It needs the return half of §4's channel: the renderer
tagging each block's outer element with its id, the frame catching clicks and
posting the id out, the builder selecting that block. It is a real design — the
shared renderer would need to know it is being previewed, which is exactly the
property that makes the current preview honest — and it is several times the
work of everything else in this spec. §4's outbound message is deliberately
built in a way that does not preclude it.

**A diff before publishing.** "3 unpublished changes" is a number with no way
to see which three, and publish is the one deliberate act in the feature.
`getPublishState` already computes the comparison positionally to produce that
count — showing *what* changed is a different and larger job than counting.

**Undo on the draft.** Delete goes through `window.confirm`
(`builder.tsx:219`) and is then gone; `site_revisions` covers published
versions only. A soft delete or an undo toast is the fix and it is its own
piece of work.

Those three are one spec's worth of "do you dare touch it", and they belong
together rather than smuggled in here.

**Also still out, from spec 23's own list:** the crop UI, palette thumbnails
rendered in the current theme, and wiring the "preview as a household" picker
to the `?as=` parameter that already works. The last of those is genuinely
small and would be reasonable to fold in — §10 question 4.

## 9. Test plan

No SQL, so `./scripts/verify-migrations.sh` runs unchanged and its 356
assertions stay 356. What is worth unit-testing is the pure part, which is most
of what this spec adds:

- `starterPayload(type)` for every one of the twenty-one types, asserted
  against `BLOCK_SCHEMAS` — a starter payload that fails its own validation is
  a block that cannot be saved.
- The style label map: total over every key and value, so a new enum member
  cannot ship without a label.
- Pluralising and capitalising `repeat.noun`, including `"person"`.
- `blockSnippet(block)` for each type: present, absent, and rubbish payloads.
- `isBlockEmpty(block)` — starter content counts as empty, an edit does not.

Then `npm run typecheck`, `npm test`, `npm run build` — and, for the first time
in this feature's life, **somebody opening `/site` in a browser.** Every item
in §3 is a claim about what a screen looks like. None of them is verified by a
green check, and §3 item 1 in particular is a claim about scroll behaviour that
only a browser can settle.

## 10. Open questions

Nothing here is built until these have answers.

| # | Question | Why it is yours and not mine |
| --- | --- | --- |
| 1 | **The preview: message channel, anchors, or both?** Both is the proposal. The anchor alone is an afternoon and fixes most of the pain; the channel is the correct fix and a day. | A scope call, and the anchor might be enough for how you actually work |
| 2 | **Starter content: sample prose, or ghost text?** Sample prose ("We met in a queue for coffee") shows what a full block looks like and can be published by accident. Ghost text cannot be published and cannot show you anything. A third option: sample prose, with publish refusing any block still carrying it untouched. | It is your site that carries the consequence, and the third option is a rule about publishing rather than a default |
| 3 | **Reordering on a phone?** Spec 23 Q7 decided layout is a laptop job. Move up/down buttons — the pattern `src/components/rank/rank-list.tsx` already uses as its touch fallback — would mildly reopen that. | Q7 is your decision and this asks you to revisit it |
| 4 | **Fold in the "preview as a household" picker?** `/site/preview?as=<id>` works; nothing links to it. Half the page is personalised and you currently cannot see that half. Small, and not in this spec's scope as written. | Scope |
| 5 | **The style labels in §7 — are those your words?** "Plain / Tinted / Dark", "As taken / Square / Tall / Wide". | They are copy, and copy is yours |

## 11. Build order, if it is authorized

1. **The English pass** — style labels, the `repeat.noun` heading, the swatches.
   No behaviour change, nothing to regress, and it is the largest ratio of
   perceived quality to work in the whole spec.
2. **The preview's scroll** — whichever of question 1's answers lands. Do this
   second because everything after it is easier to judge in a preview that
   stays where you put it.
3. **Starter content** — the catalogue field, `addBlock`, the placeholder tile,
   and whatever question 2 decides about publishing.
4. **Autosave** — the save rule, the timestamp, the failure path.
5. **The block list** — snippet, thumbnail, empty marker; then the page notes.
6. **The phone** — the preview toggle, and reordering if question 3 says so.

1 and 2 are independent of everything else and could ship alone. 4 is the one
with a way to go wrong — a lost keystroke is worse than a Save button — so it
wants the most care and is deliberately not first.
