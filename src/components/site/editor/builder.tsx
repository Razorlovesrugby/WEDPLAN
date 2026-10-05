"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { Modifier } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BLOCKS,
  STARTER_LAYOUTS,
  type BlockDef,
  type BlockType,
  palletableBlocks,
  pageNotes,
  sectionNumbers,
  typesAtLimit,
  isFoldedIntoSchedule,
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
import {
  PREVIEW_CHANNEL,
  insertionAfter,
  insertionLineY,
  isFromPreview,
  type BlockRect,
  type ToPreview,
} from "@/lib/site/preview-messages";
import type { SiteTheme } from "@/lib/theme/presets";
import { BlockInspector } from "./block-inspector";
import { LookSections, Section } from "./rail";
import { applyVibe, restoreVibe } from "@/server/actions/site-vibes";
import type { StyleSnapshot } from "@/server/site/vibes";
import { PALETTES } from "@/lib/theme/presets";
import { TEMPLATES, VIBES, getVibe, type Vibe } from "@/lib/site/vibes";
import type { PhotoOption } from "./photo-picker";
import type { PreviewHousehold } from "@/lib/site/preview-households";

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

/** How long a delete can be taken back. */
const UNDO_MS = 8000;
/** A restyle touches the whole page, so it gets longer to be reconsidered. */
const VIBE_UNDO_MS = 12000;

/** The id of the droppable laid over the preview while a new block is dragged. */
const PREVIEW_DROP = "preview-drop";

type Removal = { id: string; label: string; wasVisible: boolean };

/**
 * Where a dragged-in block will go: after which block, and where to draw the line.
 * `offscreen` is set when the foot of that block is outside the visible frame (a
 * tall block), so the line is pinned to the frame's edge and says where it means.
 */
type Insertion = {
  afterId: string | null;
  top: number;
  label: string;
  offscreen: "above" | "below" | null;
};

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
  households,
}: {
  blocks: SiteBlock[];
  photos: PhotoOption[];
  theme: SiteTheme;
  publishedAt: string | null;
  unpublished: number;
  /** Who the preview can be shown as, the household with the most events first. */
  households: PreviewHousehold[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped when the planner clicks a block's *title* in the preview, which asks
  // the inspector to put the cursor in that block's Title field (spec 28 §7.2).
  const [titleFocus, setTitleFocus] = useState(0);
  const [order, setOrder] = useState(() => blocks.map((block) => block.id));
  const [device, setDevice] = useState<Device>("desktop");
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  // Who the preview is of (spec 27 E7). Always a household: every page a guest
  // can reach is somebody's own (spec 28 §7a.4), so there is no neutral version
  // to preview. Empty only for a wedding with no households yet.
  const [viewAs, setViewAs] = useState<string>(households[0]?.id ?? "");
  // The reply form as a household that has not answered yet would see it
  // (spec 28 §4.3, Q5): by default it shows their real answers.
  const [blank, setBlank] = useState(false);
  const previewSrc = `/site/preview?${[viewAs ? `as=${viewAs}` : "", blank ? "blank=1" : ""]
    .filter(Boolean)
    .join("&")}`;
  const viewingAs = households.find((household) => household.id === viewAs) ?? null;

  // ---- deleting with an undo (spec 24 §8, spec 27 E6) ----
  // A delete is not performed when it is clicked. The block is hidden at once —
  // so the preview follows and nothing is lost — and a toast offers to put it
  // back for UNDO_MS; only then is it really deleted. Undo is "show it again as
  // it was", which needs no schema: `visible` is already a column.
  const [removals, setRemovals] = useState<Removal[]>([]);
  const removalTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removingIds = useMemo(() => new Set(removals.map((removal) => removal.id)), [removals]);

  // ---- one-click restyles, and taking them back (spec 27 E3, E6) ----
  const [vibeToast, setVibeToast] = useState<{ label: string; snapshot: StyleSnapshot } | null>(null);
  const vibeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- dragging a new block onto the page (spec 27 E5) ----
  const [dragType, setDragType] = useState<BlockType | null>(null);
  const [insertion, setInsertion] = useState<Insertion | null>(null);
  const rects = useRef<{ blocks: BlockRect[]; scrollY: number }>({ blocks: [], scrollY: 0 });
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
    () =>
      order.flatMap((id) => (byId.get(id) && !removingIds.has(id) ? [byId.get(id)!] : [])),
    [order, byId, removingIds],
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
   */
  const marks = useMemo(() => sectionNumbers(visibleBlocks(ordered)), [ordered]);

  const hero = useMemo(() => ordered.find((block) => block.type === "hero") ?? null, [ordered]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Selecting a block takes the preview to it, so the list and the page always
  // agree about where the planner is.
  useEffect(() => {
    toPreview({ channel: PREVIEW_CHANNEL, type: "highlight", blockId: selected });
    if (selected) toPreview({ channel: PREVIEW_CHANNEL, type: "scroll-to", blockId: selected });
  }, [selected, toPreview]);

  // …and clicking a block in the preview selects it here.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isFromPreview(event.data)) return;

      // Where every block is, in answer to `measure` — kept for the drop.
      if (event.data.type === "rects") {
        rects.current = { blocks: event.data.blocks, scrollY: event.data.scrollY };
        return;
      }
      if (!byId.has(event.data.blockId)) return;

      setSelected(event.data.blockId);
      setPane("edit");
      if (event.data.field === "heading") setTitleFocus((count) => count + 1);
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

  /**
   * Which droppable the pointer is over. A block being reordered is placed by
   * its centre, as a sortable list always is; a new block being dragged in is
   * placed by where the *pointer* is, because that is where the planner is
   * pointing and the preview has no rows to be near.
   */
  const collisions: CollisionDetection = (args) =>
    args.active.data.current?.kind === "palette" ? pointerWithin(args) : closestCenter(args);

  // Where the pointer actually is, read from the pointer itself. dnd-kit's
  // `delta` includes scroll adjustments (the rail scrolls under a drag that
  // began near its foot), so "where it started plus how far it moved" drifts.
  const pointer = useRef({ x: 0, y: 0 });
  const trackPointer = useCallback((event: PointerEvent) => {
    pointer.current = { x: event.clientX, y: event.clientY };
  }, []);
  useEffect(() => () => document.removeEventListener("pointermove", trackPointer, true), [trackPointer]);

  /** The preview's on-screen box, and how much it is scaled. */
  function frameGeometry() {
    const frame = iframeRef.current;
    if (!frame) return null;
    const box = frame.getBoundingClientRect();
    const zoom = frame.offsetWidth > 0 ? box.width / frame.offsetWidth : 1;
    return { box, zoom: zoom || 1 };
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.kind !== "palette") return;
    setDragType(data.type as BlockType);
    pointer.current = { x: (event.activatorEvent as MouseEvent).clientX, y: (event.activatorEvent as MouseEvent).clientY };
    document.addEventListener("pointermove", trackPointer, true);
    // Ask the frame where its blocks are, once, now: nobody scrolls mid-drag.
    toPreview({ channel: PREVIEW_CHANNEL, type: "measure" });
  }

  function onDragMove(event: DragMoveEvent) {
    if (event.active.data.current?.kind !== "palette") return;
    const geometry = frameGeometry();
    if (!geometry || event.over?.id !== PREVIEW_DROP) {
      setInsertion(null);
      return;
    }
    // Pointer → the frame's own document coordinates.
    const pageY = (pointer.current.y - geometry.box.top) / geometry.zoom + rects.current.scrollY;
    const afterId = insertionAfter(rects.current.blocks, pageY);
    const lineY = insertionLineY(rects.current.blocks, afterId);
    const raw = (lineY - rects.current.scrollY) * geometry.zoom;
    const inside = Math.min(Math.max(raw, 1), geometry.box.height - 2);
    const after = afterId ? byId.get(afterId) : null;
    setInsertion({
      afterId,
      top: inside,
      label: after ? `After ${BLOCKS[after.type].label.toLowerCase()}` : "At the top",
      offscreen: raw < 1 ? "above" : raw > geometry.box.height - 2 ? "below" : null,
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const data = active.data.current;

    // A new block dropped on the preview, or on a row of the list.
    if (data?.kind === "palette") {
      const type = data.type as BlockType;
      const where = insertion;
      document.removeEventListener("pointermove", trackPointer, true);
      setDragType(null);
      setInsertion(null);
      if (!over) return;

      let after: string | null | undefined;
      if (over.id === PREVIEW_DROP) after = where?.afterId;
      else if (byId.has(String(over.id))) after = String(over.id);
      if (after === undefined) return;

      startTransition(async () => {
        const result = await addBlock(type, after);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setMessage(null);
        setSelected(result.data.id);
        afterWrite();
      });
      return;
    }

    if (!over || active.id === over.id) return;

    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    run(() => reorderBlocks(next));
  }

  /**
   * Restyle the page as a Vibe. It rewrites nobody's words — only the theme and
   * each block's Look — and what it overwrote comes back in a snapshot, which is
   * held for the length of the toast so a click that changes the whole page can
   * be undone with one.
   */
  function applyVibeNow(vibe: Vibe) {
    startTransition(async () => {
      const result = await applyVibe(vibe.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(null);
      if (vibeTimer.current) clearTimeout(vibeTimer.current);
      setVibeToast({ label: vibe.label, snapshot: result.data.snapshot });
      vibeTimer.current = setTimeout(() => setVibeToast(null), VIBE_UNDO_MS);
      afterWrite();
    });
  }

  function undoVibe() {
    const toast = vibeToast;
    if (!toast) return;
    if (vibeTimer.current) clearTimeout(vibeTimer.current);
    setVibeToast(null);
    startTransition(async () => {
      const result = await restoreVibe(toast.snapshot);
      if (!result.ok) setMessage(result.error);
      afterWrite();
    });
  }

  /** Hide it now, delete it for real once the undo window has passed. */
  function removeBlock(block: SiteBlock) {
    if (selected === block.id) setSelected(null);
    setRemovals((was) => [
      ...was,
      { id: block.id, label: BLOCKS[block.type].label, wasVisible: block.visible },
    ]);
    startTransition(async () => {
      const result = await setBlockVisible(block.id, false);
      if (!result.ok) setMessage(result.error);
      else afterWrite();
    });
    removalTimers.current.set(
      block.id,
      setTimeout(() => finishRemoval(block.id), UNDO_MS),
    );
  }

  function finishRemoval(id: string) {
    const timer = removalTimers.current.get(id);
    if (timer) clearTimeout(timer);
    removalTimers.current.delete(id);
    setRemovals((was) => was.filter((removal) => removal.id !== id));
    void deleteBlock(id).then(afterWrite);
  }

  function undoRemoval(removal: Removal) {
    const timer = removalTimers.current.get(removal.id);
    if (timer) clearTimeout(timer);
    removalTimers.current.delete(removal.id);
    setRemovals((was) => was.filter((entry) => entry.id !== removal.id));
    startTransition(async () => {
      await setBlockVisible(removal.id, removal.wasVisible);
      afterWrite();
    });
  }

  // Leaving with a delete still pending completes it: the planner asked for it,
  // and a block left hidden forever is a worse outcome than one deleted.
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        void deleteBlock(id);
      }
      timers.clear();
    };
  }, []);

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
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <h1 className="font-serif text-2xl">Your site</h1>
        <p className="text-sm text-muted">
          Start from one of these and change anything you like — a page that already looks like
          something is a much easier thing to edit than a blank one. Your names and date go in
          for you; the words that are only here to show you how it looks are yours to replace.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((template) => {
            const vibe = getVibe(template.vibe)!;
            const tokens = PALETTES[vibe.theme.palette].tokens;
            return (
              <button
                key={template.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => applyStarterLayout(template.layout, template.vibe),
                    `Started from ${template.label}`,
                  )
                }
                className="card overflow-hidden text-left hover:border-accent"
              >
                {/* The ground and the two colours that carry it: the first thing
                    you see of a look is its colour, before its type. */}
                <span
                  className="flex h-24 items-end gap-1.5 p-3"
                  style={{ background: tokens.paper }}
                  aria-hidden="true"
                >
                  <span className="block h-1.5 w-10 rounded-full" style={{ background: tokens.accent }} />
                  <span className="block h-1.5 w-6 rounded-full" style={{ background: tokens.ink, opacity: 0.8 }} />
                </span>
                <span className="block p-4">
                  <span className="block font-medium">{template.label}</span>
                  <span className="mt-1 block text-sm text-muted">{template.blurb}</span>
                  <span className="mt-2 block text-xs text-muted">{vibe.label} look</span>
                </span>
              </button>
            );
          })}
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

      <DndContext
        // A fixed id: dnd-kit numbers its accessibility nodes from a module
        // counter, which differs between the server render and the browser and
        // logs a hydration mismatch on every load.
        id="site-builder"
        sensors={sensors}
        collisionDetection={collisions}
        modifiers={[keepNewBlocksFree]}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          document.removeEventListener("pointermove", trackPointer, true);
          setDragType(null);
          setInsertion(null);
        }}
      >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,25rem)_minmax(0,1fr)]">
        {/* ---- the rail ---- */}
        <div
          className={`divide-y divide-[#f0ece5] border-r border-line bg-white lg:sticky lg:top-[62px] lg:max-h-[calc(100vh-62px)] lg:self-start lg:overflow-y-auto ${
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

          <Section
            title="Vibes"
            blurb="One click restyles the whole page — the theme, colours, type, movement and each block's layout. None of your words change, and you can undo it."
          >
            <div className="grid grid-cols-2 gap-2">
              {VIBES.map((vibe) => {
                const tokens = PALETTES[vibe.theme.palette].tokens;
                const current =
                  theme.preset === vibe.theme.preset && theme.palette === vibe.theme.palette;
                return (
                  <button
                    key={vibe.id}
                    type="button"
                    disabled={pending}
                    aria-pressed={current}
                    title={vibe.blurb}
                    onClick={() => applyVibeNow(vibe)}
                    className={`overflow-hidden rounded-md border text-left ${
                      current ? "border-accent" : "border-line hover:border-ink"
                    }`}
                  >
                    <span
                      className="flex h-10 items-end gap-1 p-1.5"
                      style={{ background: tokens.paper }}
                      aria-hidden="true"
                    >
                      <span className="block h-1 w-5 rounded-full" style={{ background: tokens.accent }} />
                      <span className="block h-1 w-3 rounded-full" style={{ background: tokens.ink, opacity: 0.8 }} />
                    </span>
                    <span className="block px-2 py-1.5 text-xs font-medium">{vibe.label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Remounted when the theme changes on the server, so a Vibe's choices
              are what the controls below show rather than a stale local echo. */}
          <LookSections key={JSON.stringify(theme)} theme={theme} onSaved={afterWrite} />

          <Section
            title="Chapters"
            blurb="Drag to reorder. The numbers are worked out from what is showing, so the page always reads 01 to the end."
          >
            {unfinished.length > 0 ? (
              <UnfinishedNotice entries={unfinished} onSelect={(id) => setSelected(id)} />
            ) : null}

            <SortableContext
              items={ordered.map((block) => block.id)}
              strategy={verticalListSortingStrategy}
            >
                <ul className="divide-y divide-[#f0ece5] rounded-md border border-line">
                  {ordered.map((block, index) => (
                    <ChapterRow
                      key={block.id}
                      block={block}
                      number={marks.get(block.id)?.number ?? null}
                      folded={isFoldedIntoSchedule(block, ordered)}
                      selected={block.id === selected}
                      pending={pending}
                      thumb={photoFor(block, photoById)}
                      canMoveUp={index > 0}
                      canMoveDown={index < ordered.length - 1}
                      onMove={(delta) => move(block.id, delta)}
                      onSelect={() => setSelected(block.id === selected ? null : block.id)}
                      onToggle={() => run(() => setBlockVisible(block.id, !block.visible))}
                      onDelete={() => {
                        removeBlock(block);
                      }}
                    />
                  ))}
                </ul>
            </SortableContext>

            {/* Dashed chips rather than a palette panel: everything you can
                add, including a second page-break band, visible at a glance.
                Click adds it after the selected chapter; drag it onto the page
                and it goes where the line says. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {palletableBlocks()
                .filter((def) => !atLimit.has(def.type))
                .map((def) => (
                  <PaletteChip
                    key={def.type}
                    def={def}
                    disabled={pending}
                    onAdd={() =>
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
                  />
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
                  focusTitle={titleFocus}
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
                [previewSrc, "Open the preview"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href!}
                    target={label === "Open the preview" ? "_blank" : undefined}
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
        {/* Sticky, so the preview stays in view however long the rail gets
            (spec 28 §4.2). Its size depends on the window and the Phone/Desktop
            toggle and on nothing else. */}
        <div
          className={`bg-paper lg:sticky lg:top-[62px] lg:self-start ${
            pane === "edit" ? "hidden lg:block" : ""
          }`}
        >
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
              href={previewSrc}
              target="_blank"
              className="ml-auto text-xs text-muted underline"
            >
              Open in a tab
            </Link>
          </div>

          {/* Who the page is shown to: a household's page is addressed to them. */}
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
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}
                  {household.eventCount > 0 ? "" : " (no events yet)"}
                </option>
              ))}
            </select>
            <label className="ml-auto flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={blank} onChange={(event) => setBlank(event.target.checked)} />
              Show a blank reply
            </label>
          </div>
          {households.length === 0 ? (
            <p className="px-5 pb-3 text-xs text-muted">
              Add a household on Guests and the preview becomes their page — their name on the
              cover, their events, their reply form.
            </p>
          ) : viewingAs && viewingAs.eventCount === 0 ? (
            <p className="px-5 pb-3 text-xs text-muted">
              {viewingAs.name} isn&rsquo;t invited to any events yet, so the weekend and the reply
              form are empty here. Pick another household, or invite them from Guests.
            </p>
          ) : null}

          <PreviewFrame
            device={device}
            iframeRef={iframeRef}
            src={previewSrc}
            // A reload (a different household) forgets which block is selected.
            onLoaded={() =>
              toPreview({ channel: PREVIEW_CHANNEL, type: "highlight", blockId: selected })
            }
          >
            <PreviewDropZone active={dragType !== null} insertion={insertion} />
          </PreviewFrame>
        </div>
      </div>

      {/* The block being dragged in, following the pointer. */}
      <DragOverlay dropAnimation={null}>
        {dragType ? (
          <div className="rounded border border-ink bg-white px-2 py-1 text-xs shadow-lg">
            + {BLOCKS[dragType].label}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {vibeToast ? (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-4 rounded bg-[#2b2724] px-4 py-2.5 text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span>Restyled as {vibeToast.label}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={undoVibe}>
            Undo
          </button>
        </div>
      ) : null}

      {/* A delete is only a hide until this goes away (spec 24 §8). */}
      {removals.length > 0 ? (
        <div className="fixed bottom-4 left-4 z-50 space-y-2" role="status" aria-live="polite">
          {removals.map((removal) => (
            <div
              key={removal.id}
              className="flex items-center gap-4 rounded bg-[#2b2724] px-4 py-2.5 text-sm text-white shadow-lg"
            >
              <span>Deleted the {removal.label.toLowerCase()}</span>
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => undoRemoval(removal)}
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A palette entry: a click adds it, a drag places it. */
function PaletteChip({
  def,
  disabled,
  onAdd,
}: {
  def: BlockDef;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${def.type}`,
    data: { kind: "palette", type: def.type },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      disabled={disabled}
      title={`${def.blurb} Click to add it, or drag it onto the page.`}
      onClick={onAdd}
      className={`rounded border border-dashed border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      + {def.label}
    </button>
  );
}

/**
 * Laid over the preview only while a new block is being dragged.
 *
 * An iframe swallows pointer events, so dnd-kit cannot see a pointer that is
 * over one; this transparent layer is what it drops onto. The line is where the
 * block will go — the foot of the block it will follow — drawn in the preview's
 * own scaled coordinates.
 */
function PreviewDropZone({
  active,
  insertion,
}: {
  active: boolean;
  insertion: Insertion | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PREVIEW_DROP });
  // Always mounted, so dnd-kit has measured it by the time a drag starts; it
  // only takes pointer events while one is under way. Mounting it on drag start
  // meant it was not yet measured, and a drop found nothing under the pointer.
  // It must take them then, because an iframe swallows the pointer and the
  // sensor would otherwise never hear it cross the frame.
  return (
    <div
      ref={setNodeRef}
      className={`absolute inset-0 z-10 ${active ? "" : "pointer-events-none"} ${
        active && isOver ? "bg-[#7a5c3c]/5" : ""
      }`}
      aria-hidden="true"
    >
      {active && insertion ? (
        <>
          <div
            className="absolute left-0 right-0 h-0.5 bg-[#7a5c3c] shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
            style={{ top: insertion.top }}
          />
          {/* Says where it means, which matters most when the foot of that block
              is somewhere the frame is not showing. */}
          <span
            className="absolute right-2 -translate-y-full rounded-sm bg-[#7a5c3c] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
            style={{ top: insertion.offscreen === "above" ? insertion.top + 22 : insertion.top }}
          >
            {insertion.offscreen === "below" ? "↓ " : insertion.offscreen === "above" ? "↑ " : ""}
            {insertion.label}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * dnd-kit's modifier for the chapter list keeps a reordered block on the
 * vertical axis. A block being dragged *in* is not in the list, and has to be
 * free to travel to the preview on the other side of the screen.
 */
const keepNewBlocksFree: Modifier = (args) =>
  args.active?.data.current?.kind === "palette" ? args.transform : restrictToVerticalAxis(args);

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
  onLoaded,
  children,
}: {
  device: Device;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  src: string;
  onLoaded?: () => void;
  /** Laid over the frame — the drop zone, while a block is being dragged in. */
  children?: React.ReactNode;
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
        // `overflow: clip`, not `hidden`: a hidden box is still a scroll
        // container, and anything inside the iframe that asks its ancestors
        // to scroll can move it — which is how the preview used to collapse to
        // a strip (spec 28 §4.2). A clipped box cannot be scrolled at all.
        className="relative overflow-clip border border-line bg-white"
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
          onLoad={onLoaded}
          title="Preview"
          style={{
            width,
            height: `calc(78vh / ${zoom})`,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            border: 0,
          }}
        />
        {children}
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
  folded,
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
  /** "On the day" on a page that has The weekend: its notes are drawn there now. */
  folded: boolean;
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
  const status = block.visible && !folded ? blockStatus(block) : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 px-2.5 py-2 ${isDragging ? "opacity-60" : ""} ${
        selected ? "bg-[#f6f3ee]" : ""
      } ${folded ? "bg-[#faf9f7]" : ""}`}
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
          className={`block truncate text-sm ${
            block.visible ? (folded ? "text-[#a9a298]" : "") : "text-[#a9a298] line-through"
          }`}
        >
          {def.label}
        </span>
        {folded ? (
          // Spec 28 §5.3: a deprecated block the page no longer draws, said
          // plainly, with the delete beside it.
          <span className="block truncate text-xs text-muted">
            Now part of The weekend — you can delete this
          </span>
        ) : snippet || status ? (
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
