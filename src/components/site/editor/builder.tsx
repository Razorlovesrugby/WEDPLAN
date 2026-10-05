"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BLOCKS,
  STARTER_LAYOUTS,
  palletableBlocks,
  pageNotes,
  sectionNumbers,
  typesAtLimit,
  visibleBlocks,
  type BlockFamily,
  type PageNote,
  type SiteBlock,
} from "@/lib/site/blocks";
import { BLOCK_FORMS } from "@/lib/site/block-fields";
import {
  addBlock,
  applyStarterLayout,
  deleteBlock,
  publishSite,
  reorderBlocks,
  saveBlock,
  setBlockVisible,
} from "@/server/actions/site-blocks";
import { formatRelative } from "@/lib/format";
import { blockSnippet, blockStatus, blocksNeedingWork, type BlockStatus } from "@/lib/site/starter";
import { PREVIEW_CHANNEL, isFromPreview, type ToPreview } from "@/lib/site/preview-messages";
import type { SiteTheme } from "@/lib/theme/presets";
import { BlockInspector } from "./block-inspector";
import { LookSections, Section } from "./rail";
import type { PhotoOption } from "./photo-picker";

/**
 * The builder (spec 23 §5, recomposed by spec 24, extended by spec 27).
 *
 *   ┌─ Your site · N unpublished changes ······ History · Publish ─┐
 *   │ rail (25rem)         │ preview                               │
 *   │  Names & date        │  [Phone][Desktop]                     │
 *   │  Cover photo         │  ┌──────────────────────────────┐     │
 *   │  Theme               │  │ the real renderer, zoomed    │     │
 *   │  Palette             │  │                              │     │
 *   │  Typography          │  └──────────────────────────────┘     │
 *   │  Chapters (drag)     │                                       │
 *   │  Block inspector     │                                       │
 *   └──────────────────────┴───────────────────────────────────────┘
 *
 * What changed from the block-list-and-iframe version: the controls that used
 * to live on `/site/theme` are in the rail, beside the thing they change.
 * Choosing a palette from a page that does not show you the page was always
 * the wrong shape.
 *
 * **What did not change, and must not:** the preview is an iframe of
 * `/site/preview`, which renders the draft through the same components a
 * guest gets. Not a mock-up and not a second implementation — a preview that
 * is its own renderer is a preview that lies as soon as anybody changes the
 * real one. An edit reaches it as a message asking it to refresh in place
 * (`PreviewBridge`), never as a remount: remounting threw away the scroll
 * position, any open accordion and the reader's place on every save.
 *
 * Drag-to-reorder is the desktop gesture. Under `lg` each chapter has Move up
 * and Move down instead (spec 24 Q3), and the rail and the preview become two
 * panes you switch between, because neither fits beside the other on a phone.
 */

/** Desktop is shown at a readable fraction of 1280px; a phone nearly full size. */
const DEVICE = {
  phone: { width: 430, zoom: 0.9 },
  desktop: { width: 1280, zoom: 0.52 },
} as const;

type Device = keyof typeof DEVICE;

/** A glyph per family, for blocks with no photograph to show in the list. */
const FAMILY_GLYPH: Record<BlockFamily, string> = {
  essentials: "◆",
  photos: "▣",
  "the day": "◷",
  music: "♪",
  travel: "➚",
};

const STATUS_LABEL: Record<Exclude<BlockStatus, null>, string> = {
  sample: "sample text",
  blank: "empty",
};

export function SiteBuilder({
  blocks,
  photos,
  theme,
  publishedAt,
  unpublished,
  siteHref,
  households,
}: {
  blocks: SiteBlock[];
  photos: PhotoOption[];
  theme: SiteTheme;
  publishedAt: string | null;
  unpublished: number;
  siteHref: string;
  /** Who the preview can be shown as. */
  households: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState(() => blocks.map((block) => block.id));
  const [device, setDevice] = useState<Device>("desktop");
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  // Who the preview is of (spec 27 E7). A household by default: the greeting,
  // the weekend and the reply bar exist only on a household's own page, and a
  // preview of the shared site would show a planner none of what they are
  // editing. "shared" is the shared site, for when that is the question.
  const [viewAs, setViewAs] = useState<string>(households[0]?.id ?? "shared");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- the channel to the preview frame ----
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toPreview = useCallback((payload: ToPreview) => {
    iframeRef.current?.contentWindow?.postMessage(payload, window.location.origin);
  }, []);

  /**
   * Everything that writes to the draft ends here: refresh the builder's own
   * numbers, then — after a short pause, so a burst of writes is one refresh —
   * ask the preview to re-render in place.
   */
  const afterWrite = useCallback(() => {
    router.refresh();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(
      () => toPreview({ channel: PREVIEW_CHANNEL, type: "refresh" }),
      400,
    );
  }, [router, toPreview]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // A block added or deleted on the server changes the list under us. Without
  // this the new block never joins `order` and simply does not appear.
  useEffect(() => {
    setOrder((was) => {
      const ids = blocks.map((block) => block.id);
      const kept = was.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return added.length === 0 && kept.length === was.length ? was : [...kept, ...added];
    });
  }, [blocks]);

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const ordered = useMemo(
    () => order.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    [order, byId],
  );
  const atLimit = useMemo(() => typesAtLimit(blocks), [blocks]);
  const notes = useMemo(() => pageNotes(ordered), [ordered]);
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const unfinished = useMemo(() => blocksNeedingWork(ordered), [ordered]);

  /**
   * The number each chapter will actually wear on the page.
   *
   * Computed over the *visible* blocks, exactly as the renderer does, so the
   * rail and the page agree — hide block 03 and everything after it
   * renumbers in both places at once. A band has no eyebrow and so has no
   * number; the rail shows an em dash for it rather than a gap.
   *
   * Computed for whoever the preview is *of*: a block set to "invited only"
   * has a number when previewing a household and none on the shared site,
   * because that is what the page beside this list is showing.
   */
  const marks = useMemo(
    () => sectionNumbers(visibleBlocks(ordered, viewAs !== "shared")),
    [ordered, viewAs],
  );

  const hero = useMemo(() => ordered.find((block) => block.type === "hero") ?? null, [ordered]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Selecting a block takes the preview to it, so the list and the page always
  // agree about where the planner is.
  useEffect(() => {
    if (selected) toPreview({ channel: PREVIEW_CHANNEL, type: "scroll-to", blockId: selected });
  }, [selected, toPreview]);

  // …and clicking a block in the preview selects it here.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isFromPreview(event.data)) return;
      if (!byId.has(event.data.blockId)) return;

      setSelected(event.data.blockId);
      setPane("edit");
      // After the rail has re-rendered with the inspector in it.
      setTimeout(
        () =>
          document
            .getElementById("selected-chapter")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        50,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [byId]);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    note?: string,
    then?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "That didn't work");
        return;
      }
      setMessage(note ?? null);
      then?.();
      afterWrite();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    run(() => reorderBlocks(next));
  }

  function move(id: string, delta: -1 | 1) {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    run(() => reorderBlocks(next));
  }

  // An empty page is the worst first screen a builder can have: it asks
  // somebody with no design training to invent a page from nothing.
  if (blocks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="font-serif text-2xl">Your site</h1>
        <p className="text-sm text-muted">
          Start from one of these and change anything you like — deleting a block you do not want is
          a much easier job than inventing a page.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {STARTER_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              disabled={pending}
              onClick={() => run(() => applyStarterLayout(layout.id), `Added ${layout.label}`)}
              className="card p-4 text-left hover:border-accent"
            >
              <span className="block font-medium">{layout.label}</span>
              <span className="mt-1 block text-sm text-muted">{layout.blurb}</span>
              <span className="mt-2 block text-xs text-muted">
                {layout.types.length} blocks to start with
              </span>
            </button>
          ))}
        </div>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </div>
    );
  }

  const selectedBlock = selected ? byId.get(selected) : undefined;
  const sampleCount = unfinished.filter((entry) => entry.status === "sample").length;

  return (
    <div className="-m-4 sm:-m-6">
      {/* ---- the publish bar ----
          A draft system whose state is invisible is a bug generator: somebody
          edits for an hour and cannot work out why nothing changed. */}
      <header className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-lg">Your site</span>
          <span className="text-sm">
            {unpublished > 0 ? (
              <span className="font-medium">
                {unpublished} unpublished {unpublished === 1 ? "change" : "changes"}
              </span>
            ) : (
              <span className="text-muted">Everything here is published</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            {publishedAt
              ? `Guests are seeing the version from ${formatRelative(publishedAt)}`
              : "Nothing published yet — guests see an empty page"}
          </span>
          <Link href="/site/history" className="btn">
            History
          </Link>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            title={
              sampleCount > 0
                ? `${sampleCount} ${sampleCount === 1 ? "chapter still has" : "chapters still have"} sample text`
                : undefined
            }
            onClick={() => run(() => publishSite(), "Published — guests see this now")}
          >
            Publish
          </button>
        </div>
      </header>

      {/* What the last action said — a refused publish most of all. It lives
          under the bar rather than inside a rail section because the Publish
          button is up here and the answer should be too. */}
      {message ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 border-b border-line bg-[#faf6ee] px-5 py-2.5 text-sm"
        >
          <span>{message}</span>
          <button
            type="button"
            className="shrink-0 text-xs text-muted hover:underline"
            onClick={() => setMessage(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Two panes under `lg`: the rail and the preview do not fit side by
          side on a phone, and the preview is the thing the rail exists for. */}
      <div className="flex gap-1 border-b border-line bg-white px-5 py-2 lg:hidden" role="tablist">
        {(["edit", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={pane === option}
            className={`btn px-3 py-1 text-xs capitalize ${
              pane === option ? "border-accent bg-[#f6f3ee]" : ""
            }`}
            onClick={() => setPane(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,25rem)_minmax(0,1fr)]">
        {/* ---- the rail ---- */}
        <div
          className={`divide-y divide-[#f0ece5] border-r border-line bg-white lg:max-h-[calc(100vh-62px)] lg:overflow-y-auto ${
            pane === "preview" ? "hidden lg:block" : ""
          }`}
        >
          <NamesAndDate
            key={hero?.id ?? "no-hero"}
            hero={hero}
            pending={pending}
            onSaved={afterWrite}
          />

          <Section title="Cover photo">
            <p className="text-xs leading-relaxed text-muted">
              The photograph behind your names. Select the <strong>Hero</strong> chapter below and
              pick it there — it is the same picker, and this way you can see what you are choosing
              against the words that sit on it.
            </p>
          </Section>

          <LookSections theme={theme} onSaved={afterWrite} />

          <Section
            title="Chapters"
            blurb="Drag to reorder. The numbers are worked out from what is showing, so the page always reads 01 to the end."
          >
            {unfinished.length > 0 ? (
              <UnfinishedNotice entries={unfinished} onSelect={(id) => setSelected(id)} />
            ) : null}

            <DndContext
              // A fixed id: dnd-kit numbers its accessibility nodes from a
              // module counter, which differs between the server render and
              // the browser and logs a hydration mismatch on every load.
              id="site-chapters"
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-[#f0ece5] rounded-md border border-line">
                  {ordered.map((block, index) => (
                    <ChapterRow
                      key={block.id}
                      block={block}
                      number={marks.get(block.id)?.number ?? null}
                      selected={block.id === selected}
                      pending={pending}
                      thumb={photoFor(block, photoById)}
                      canMoveUp={index > 0}
                      canMoveDown={index < ordered.length - 1}
                      onMove={(delta) => move(block.id, delta)}
                      onSelect={() => setSelected(block.id === selected ? null : block.id)}
                      onToggle={() => run(() => setBlockVisible(block.id, !block.visible))}
                      onDelete={() => {
                        if (!window.confirm(`Delete the ${BLOCKS[block.type].label} block?`)) return;
                        run(() => deleteBlock(block.id));
                        if (selected === block.id) setSelected(null);
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            {/* Dashed chips rather than a palette panel: everything you can
                add, including a second page-break band, visible at a glance. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {palletableBlocks()
                .filter((def) => !atLimit.has(def.type))
                .map((def) => (
                  <button
                    key={def.type}
                    type="button"
                    disabled={pending}
                    title={def.blurb}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await addBlock(def.type, selected ?? undefined);
                        if (!result.ok) {
                          setMessage(result.error);
                          return;
                        }
                        setMessage(null);
                        // Straight into the new block, and the preview follows.
                        setSelected(result.data.id);
                        afterWrite();
                      })
                    }
                    className="rounded border border-dashed border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink"
                  >
                    + {def.label}
                  </button>
                ))}
            </div>

            <PageNotes notes={notes} />
          </Section>

          {selectedBlock ? (
            <div id="selected-chapter">
              <Section title="Selected chapter">
                <BlockInspector
                  key={selectedBlock.id}
                  block={selectedBlock}
                  form={BLOCK_FORMS[selectedBlock.type]}
                  photos={photos}
                  onDone={afterWrite}
                  heroDefault={theme.heroStyle}
                />
              </Section>
            </div>
          ) : null}

          {/* The screens a block's content lives on. The inspector links to
              whichever one belongs to the selected block; these are here so
              none of them is reachable only through a block you happen to
              have added. */}
          <Section title="Elsewhere">
            <ul className="space-y-1 text-sm">
              {[
                ["/site/attire", "What to wear"],
                ["/site/gifts", "A gift"],
                ["/site/songs", "Song requests"],
                ["/site/guestbook", "Guestbook"],
                [siteHref, "See it live"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href!}
                    target={href === siteHref ? "_blank" : undefined}
                    className="text-accent underline underline-offset-2"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* ---- the preview ---- */}
        <div className={`bg-paper ${pane === "edit" ? "hidden lg:block" : ""}`}>
          <div className="flex items-center gap-2 px-5 py-3">
            {(["phone", "desktop"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={device === option}
                className={`btn px-2.5 py-1 text-xs capitalize ${
                  device === option ? "border-accent bg-[#f6f3ee]" : ""
                }`}
                onClick={() => setDevice(option)}
              >
                {option}
              </button>
            ))}
            <Link
              href={`/site/preview?as=${viewAs}`}
              target="_blank"
              className="ml-auto text-xs text-muted underline"
            >
              Open in a tab
            </Link>
          </div>

          {/* Who the page is shown to. The shared site is addressed to nobody;
              a household's page is addressed to them. */}
          <div className="flex items-center gap-2 px-5 pb-3 text-xs">
            <label htmlFor="preview-as" className="text-muted">
              Previewing as
            </label>
            <select
              id="preview-as"
              className="field w-auto max-w-[16rem] py-1 text-xs"
              value={viewAs}
              onChange={(event) => setViewAs(event.target.value)}
            >
              <option value="shared">The shared site</option>
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}
                </option>
              ))}
            </select>
          </div>

          <PreviewFrame device={device} iframeRef={iframeRef} src={`/site/preview?as=${viewAs}`} />
        </div>
      </div>
    </div>
  );
}

/** The photograph a block points at, for its thumbnail in the list. */
function photoFor(block: SiteBlock, photos: Map<string, PhotoOption>): PhotoOption | null {
  const payload = (block.payload ?? {}) as Record<string, unknown>;
  const id = typeof payload["image_id"] === "string" ? payload["image_id"] : block.style.bgImage;
  return id ? (photos.get(id) ?? null) : null;
}

/**
 * The preview, scaled.
 *
 * The iframe is laid out at the real device width and then transformed, so
 * the page inside it genuinely believes it is 430px or 1280px wide. Setting
 * the frame to the *scaled* width instead would show a 1280px layout's media
 * queries resolving at 666px, which is a preview of a page nobody will ever
 * see. The outer box takes the scaled size so the surrounding layout is not
 * pushed around by the untransformed element.
 *
 * The zoom is the device's preferred one, shrunk to fit when the column is
 * narrower than that — which on a phone it always is.
 */
function PreviewFrame({
  device,
  iframeRef,
  src,
}: {
  device: Device;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  src: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { width, zoom: preferred } = DEVICE[device];
  // 40px is the wrapper's `px-5` gutters.
  const zoom = available && available > 40 ? Math.min(preferred, (available - 40) / width) : preferred;

  return (
    <div ref={wrap} className="flex justify-center px-5 pb-5">
      <div
        className="overflow-hidden border border-line bg-white"
        // The visible box is the scaled size. Heights are viewport units and
        // a `calc`, not a measurement, so nothing here touches `window` —
        // this component server-renders as part of the page.
        style={{ width: width * zoom, height: "78vh" }}
      >
        <iframe
          ref={iframeRef}
          // No `key`: the frame is never remounted. An edit is a message
          // asking it to re-render where it stands (`PreviewBridge`).
          src={src}
          title="Preview"
          style={{
            width,
            height: `calc(78vh / ${zoom})`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            border: 0,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Chapters that still need the planner, said once and with a way in.
 *
 * `sample` blocks are the ones publish will refuse; `blank` ones are only
 * noted, because an empty photo band has always rendered as nothing and
 * refusing it would turn every existing site's next publish into a chore.
 */
function UnfinishedNotice({
  entries,
  onSelect,
}: {
  entries: ReturnType<typeof blocksNeedingWork>;
  onSelect: (id: string) => void;
}) {
  const sample = entries.filter((entry) => entry.status === "sample");
  const blank = entries.filter((entry) => entry.status === "blank");

  const links = (list: typeof entries) =>
    list.map((entry, index) => (
      <span key={entry.id}>
        {index > 0 ? ", " : ""}
        <button type="button" className="underline" onClick={() => onSelect(entry.id)}>
          {entry.label}
        </button>
      </span>
    ));

  return (
    <div className="mb-3 rounded-md border border-[#e7d9b6] bg-[#fbf6e6] p-3 text-xs leading-relaxed">
      {sample.length > 0 ? (
        <p>
          <strong>
            Sample text left in {sample.length === 1 ? "one chapter" : `${sample.length} chapters`}.
          </strong>{" "}
          Publishing waits until you have written your own or hidden{" "}
          {sample.length === 1 ? "it" : "them"}: {links(sample)}.
        </p>
      ) : null}
      {blank.length > 0 ? (
        <p className={sample.length > 0 ? "mt-1.5" : ""}>Nothing in yet: {links(blank)}.</p>
      ) : null}
    </div>
  );
}

/**
 * `pageNotes`' advice, rendered as something a planner reads once.
 *
 * Same words as before — the function is untouched — but grouped under a
 * heading, tone-coloured, and dismissible for the session. A plain grey list
 * of `text-xs` is where advice goes to be ignored.
 */
function PageNotes({ notes }: { notes: PageNote[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (notes.length === 0 || dismissed) return null;

  return (
    <div className="mt-3 rounded-md border border-line bg-[#fafaf7] p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          A few thoughts
        </h3>
        <button
          type="button"
          className="text-xs text-muted hover:underline"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
      <ul className="space-y-1.5">
        {notes.map((note, index) => (
          <li
            key={index}
            className={`flex gap-2 text-xs leading-snug ${
              note.tone === "bloated" ? "text-[#8a5a2b]" : "text-muted"
            }`}
          >
            <span aria-hidden="true">{note.tone === "bloated" ? "▲" : "○"}</span>
            <span>{note.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Names, date and place — written straight through to the hero block.
 *
 * Not a fourth place to type the couple's names: these are the hero's own
 * payload fields, which is why the section disappears entirely when the page
 * has no hero rather than writing somewhere else.
 */
function NamesAndDate({
  hero,
  pending,
  onSaved,
}: {
  hero: SiteBlock | null;
  pending: boolean;
  onSaved: () => void;
}) {
  const payload = (hero?.payload ?? {}) as Record<string, unknown>;
  const asText = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : "");

  const [values, setValues] = useState({
    headline: asText("headline"),
    date_label: asText("date_label"),
    location: asText("location"),
  });
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!hero) {
    return (
      <Section title="Names & date">
        <p className="text-xs text-muted">
          Add the <strong>Hero</strong> chapter below and these appear here.
        </p>
      </Section>
    );
  }

  function commit() {
    startSaving(async () => {
      const result = await saveBlock(hero!.id, { ...payload, ...values });
      setSaved(result.ok);
      if (result.ok) onSaved();
    });
  }

  const fields: [keyof typeof values, string, string][] = [
    ["headline", "The two of you", "Ray & Olivia"],
    ["date_label", "The date, as guests read it", "Saturday 12 June 2027"],
    ["location", "Where", "The Swan, Wells"],
  ];

  return (
    <Section title="Names & date">
      <div className="space-y-2">
        {fields.map(([name, label, placeholder]) => (
          <label key={name} className="block">
            <span className="mb-1 block text-xs text-muted">{label}</span>
            <input
              className="w-full rounded border border-line px-2.5 py-2 text-sm outline-none focus:border-accent"
              value={values[name]}
              placeholder={placeholder}
              disabled={pending || saving}
              onChange={(event) => {
                setValues((was) => ({ ...was, [name]: event.target.value }));
                setSaved(false);
              }}
              // Saved when the field is left rather than on every keystroke:
              // these three are the names on the front of the invitation, and
              // a write per character is a preview refresh per character.
              onBlur={commit}
            />
          </label>
        ))}
        {saved ? <p className="text-xs text-muted">Saved to your draft</p> : null}
      </div>
    </Section>
  );
}

function ChapterRow({
  block,
  number,
  selected,
  pending,
  thumb,
  canMoveUp,
  canMoveDown,
  onMove,
  onSelect,
  onToggle,
  onDelete,
}: {
  block: SiteBlock;
  /** Null for a block the page does not number — a band, or a hidden one. */
  number: string | null;
  selected: boolean;
  pending: boolean;
  /** The photograph this block points at, when it has one. */
  thumb: PhotoOption | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: -1 | 1) => void;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const def = BLOCKS[block.type];
  const snippet = blockSnippet(block);
  const status = block.visible ? blockStatus(block) : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 px-2.5 py-2 ${isDragging ? "opacity-60" : ""} ${
        selected ? "bg-[#f6f3ee]" : ""
      }`}
    >
      <button
        type="button"
        className="hidden cursor-grab text-[#a9a298] lg:block"
        aria-label={`Reorder ${def.label}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      {/* The touch fallback for the drag handle (spec 24 Q3). */}
      <span className="flex flex-col lg:hidden">
        <button
          type="button"
          className="px-1 text-[10px] leading-none text-muted disabled:opacity-25"
          disabled={!canMoveUp || pending}
          aria-label={`Move ${def.label} up`}
          onClick={() => onMove(-1)}
        >
          ▲
        </button>
        <button
          type="button"
          className="px-1 text-[10px] leading-none text-muted disabled:opacity-25"
          disabled={!canMoveDown || pending}
          aria-label={`Move ${def.label} down`}
          onClick={() => onMove(1)}
        >
          ▼
        </button>
      </span>

      <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[#a9a298]">
        {number ?? "—"}
      </span>

      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
        <img src={thumb.url} alt="" className="h-7 w-9 shrink-0 rounded-sm object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-7 w-9 shrink-0 items-center justify-center rounded-sm bg-[#f3f0ea] text-xs text-[#a9a298]"
        >
          {FAMILY_GLYPH[def.family]}
        </span>
      )}

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span
          className={`block truncate text-sm ${block.visible ? "" : "text-[#a9a298] line-through"}`}
        >
          {def.label}
          {block.audience !== "everyone" ? (
            <span className="ml-2 text-xs text-[#8b8378]">
              {block.audience === "invited" ? "invited only" : "shared site only"}
            </span>
          ) : null}
        </span>
        {snippet || status ? (
          <span className="block truncate text-xs text-muted">
            {status ? (
              <span className="mr-1.5 rounded-sm bg-[#fbf0d3] px-1 py-px text-[10px] uppercase tracking-wide text-[#8a6a1f]">
                {STATUS_LABEL[status]}
              </span>
            ) : null}
            {snippet}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        className="text-xs text-muted hover:underline"
        disabled={pending}
        onClick={onToggle}
      >
        {block.visible ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        className="text-xs text-[#a33a3a] hover:underline"
        disabled={pending}
        onClick={onDelete}
      >
        Delete
      </button>
    </li>
  );
}
