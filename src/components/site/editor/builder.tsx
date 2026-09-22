"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import type { SiteTheme } from "@/lib/theme/presets";
import { BlockInspector } from "./block-inspector";
import { LookSections, Section } from "./rail";
import type { PhotoOption } from "./photo-picker";

/**
 * The builder (spec 23 §5, recomposed by spec 24).
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
 * real one. The `previewKey` remount is what makes an edit appear without a
 * manual refresh.
 *
 * Drag-to-reorder stays desktop only (Q7). On a phone the list still edits,
 * hides and publishes; dragging a dozen blocks around a 390px screen is real
 * work for a task nobody does on a bus.
 */

/** Desktop is shown at a readable fraction of 1280px; a phone nearly full size. */
const DEVICE = {
  phone: { width: 430, zoom: 0.9 },
  desktop: { width: 1280, zoom: 0.52 },
} as const;

type Device = keyof typeof DEVICE;

export function SiteBuilder({
  blocks,
  photos,
  theme,
  publishedAt,
  unpublished,
  previewKey,
  siteHref,
}: {
  blocks: SiteBlock[];
  photos: PhotoOption[];
  theme: SiteTheme;
  publishedAt: string | null;
  unpublished: number;
  /** Changes whenever the draft does, so the iframe reloads. */
  previewKey: string;
  siteHref: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState(() => blocks.map((block) => block.id));
  const [device, setDevice] = useState<Device>("desktop");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  /**
   * The number each chapter will actually wear on the page.
   *
   * Computed over the *visible* blocks, exactly as the renderer does, so the
   * rail and the page agree — hide block 03 and everything after it
   * renumbers in both places at once. A band has no eyebrow and so has no
   * number; the rail shows an em dash for it rather than a gap.
   *
   * `false` for `forHousehold`, which is what `/site/preview` passes with no
   * `?as=`: these numbers match the preview sitting beside them. A block set
   * to "invited only" therefore shows no number here, because it has none on
   * the page this rail is numbering.
   */
  const marks = useMemo(() => sectionNumbers(visibleBlocks(ordered, false)), [ordered]);

  const hero = useMemo(() => ordered.find((block) => block.type === "hero") ?? null, [ordered]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function run(action: () => Promise<{ ok: boolean; error?: string }>, note?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error ?? "That didn't work");
        return;
      }
      setMessage(note ?? null);
      router.refresh();
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

  return (
    <div className="-m-4 sm:-m-6">
      {/* ---- the publish bar ----
          A draft system whose state is invisible is a bug generator: somebody
          edits for an hour and cannot work out why nothing changed. */}
      <header className="flex h-[62px] flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5">
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
            onClick={() => run(() => publishSite(), "Published — guests see this now")}
          >
            Publish
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(300px,25rem)_minmax(0,1fr)]">
        {/* ---- the rail ---- */}
        <div className="divide-y divide-[#f0ece5] border-r border-line bg-white lg:max-h-[calc(100vh-62px)] lg:overflow-y-auto">
          <NamesAndDate
            key={hero?.id ?? "no-hero"}
            hero={hero}
            pending={pending}
            onSaved={() => router.refresh()}
          />

          <Section title="Cover photo">
            <p className="text-xs leading-relaxed text-muted">
              The photograph behind your names. Select the <strong>Hero</strong> chapter below and
              pick it there — it is the same picker, and this way you can see what you are choosing
              against the words that sit on it.
            </p>
          </Section>

          <LookSections theme={theme} />

          <Section
            title="Chapters"
            blurb="Drag to reorder. The numbers are worked out from what is showing, so the page always reads 01 to the end."
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-[#f0ece5] rounded-md border border-line">
                  {ordered.map((block) => (
                    <ChapterRow
                      key={block.id}
                      block={block}
                      number={marks.get(block.id)?.number ?? null}
                      selected={block.id === selected}
                      pending={pending}
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
                    onClick={() => run(() => addBlock(def.type, selected ?? undefined))}
                    className="rounded border border-dashed border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink"
                  >
                    + {def.label}
                  </button>
                ))}
            </div>

            {notes.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {notes.map((note, index) => (
                  <li key={index} className="text-xs text-[#8b8378]">
                    {note.text}
                  </li>
                ))}
              </ul>
            ) : null}

            {message ? <p className="mt-3 text-xs text-muted">{message}</p> : null}
          </Section>

          {selectedBlock ? (
            <Section title="Selected chapter">
              <BlockInspector
                key={selectedBlock.id}
                block={selectedBlock}
                form={BLOCK_FORMS[selectedBlock.type]}
                photos={photos}
                onDone={() => router.refresh()}
              />
            </Section>
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
        <div className="hidden bg-paper lg:block">
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
            <Link href="/site/preview" target="_blank" className="ml-auto text-xs text-muted underline">
              Open in a tab
            </Link>
          </div>

          <PreviewFrame device={device} previewKey={previewKey} />
        </div>
      </div>
    </div>
  );
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
 */
function PreviewFrame({ device, previewKey }: { device: Device; previewKey: string }) {
  const { width, zoom } = DEVICE[device];

  return (
    <div className="flex justify-center px-5 pb-5">
      <div
        className="overflow-hidden border border-line bg-white"
        // The visible box is the scaled size. Heights are viewport units and
        // a `calc`, not a measurement, so nothing here touches `window` —
        // this component server-renders as part of the page.
        style={{ width: width * zoom, height: "78vh" }}
      >
        <iframe
          // The key remounts the frame whenever the draft changes, which is
          // what makes an edit show up without a manual refresh.
          key={previewKey}
          src="/site/preview"
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
              // a write per character would be a write per character, and the
              // preview remounts on each one.
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
  onSelect,
  onToggle,
  onDelete,
}: {
  block: SiteBlock;
  /** Null for a block the page does not number — a band, or a hidden one. */
  number: string | null;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const def = BLOCKS[block.type];

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

      <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-[#a9a298]">
        {number ?? "—"}
      </span>

      <button type="button" onClick={onSelect} className="flex-1 truncate text-left">
        <span className={`text-sm ${block.visible ? "" : "text-[#a9a298] line-through"}`}>
          {def.label}
        </span>
        {block.audience !== "everyone" ? (
          <span className="ml-2 text-xs text-[#8b8378]">
            {block.audience === "invited" ? "invited only" : "shared site only"}
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
