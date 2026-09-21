"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BLOCKS,
  BLOCK_FAMILIES,
  STARTER_LAYOUTS,
  pageNotes,
  typesAtLimit,
  type BlockType,
  type SiteBlock,
} from "@/lib/site/blocks";
import { BLOCK_FORMS } from "@/lib/site/block-fields";
import {
  addBlock,
  applyStarterLayout,
  deleteBlock,
  duplicateBlock,
  publishSite,
  reorderBlocks,
  setBlockVisible,
} from "@/server/actions/site-blocks";
import { formatRelative } from "@/lib/format";
import { BlockInspector } from "./block-inspector";
import type { PhotoOption } from "./photo-picker";

/**
 * The builder (spec 23 §5).
 *
 *   ┌─ Blocks ──────────┬─ Preview ──────────[▯][▭]─┐
 *   │ ⠿ Hero · photo    │                            │
 *   │ ⠿ Countdown       │        Ray & Olivia        │
 *   │ + Add a block     │        12 June 2027        │
 *   └───────────────────┴────────────────────────────┘
 *
 * The preview on the right is an iframe of `/site/preview`, which renders the
 * draft through the **same components a guest gets**. Not a mock-up and not a
 * second implementation: a preview that is its own renderer is a preview that
 * lies as soon as anybody changes the real one.
 *
 * Drag-to-reorder is desktop only (Q7). On a phone the list still edits,
 * hides and publishes; dragging a dozen blocks around a 390px screen is real
 * work for a task nobody does on a bus.
 */

export function SiteBuilder({
  blocks,
  photos,
  publishedAt,
  unpublished,
  previewKey,
}: {
  blocks: SiteBlock[];
  photos: PhotoOption[];
  publishedAt: string | null;
  unpublished: number;
  /** Changes whenever the draft does, so the iframe reloads. */
  previewKey: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(blocks[0]?.id ?? null);
  const [order, setOrder] = useState(() => blocks.map((block) => block.id));
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [showPalette, setShowPalette] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const ordered = useMemo(
    () => order.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    [order, byId],
  );
  const atLimit = useMemo(() => typesAtLimit(blocks), [blocks]);
  const notes = useMemo(() => pageNotes(ordered), [ordered]);

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
      <div className="space-y-4">
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

  return (
    <div className="space-y-4">
      {/* The publish bar. A draft system whose state is invisible is a bug
          generator — somebody edits for an hour and cannot work out why
          nothing changed. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="text-sm">
          {unpublished > 0 ? (
            <span className="font-medium">
              {unpublished} unpublished {unpublished === 1 ? "change" : "changes"}
            </span>
          ) : (
            <span className="text-muted">Everything here is published</span>
          )}
          <span className="ml-2 text-muted">
            {publishedAt
              ? `Guests are seeing the version from ${formatRelative(publishedAt)}`
              : "Nothing published yet — guests see an empty page"}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {notes.length > 0 ? (
        <ul className="space-y-1">
          {notes.map((note, index) => (
            <li key={index} className="text-xs text-muted">
              {note.text}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* ---- the page, as a list ---- */}
        <div className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="card divide-y divide-line">
                {ordered.map((block) => (
                  <BlockRow
                    key={block.id}
                    block={block}
                    selected={block.id === selected}
                    pending={pending}
                    onSelect={() => setSelected(block.id === selected ? null : block.id)}
                    onToggle={() => run(() => setBlockVisible(block.id, !block.visible))}
                    onDuplicate={() => run(() => duplicateBlock(block.id))}
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

          <button type="button" className="btn w-full" onClick={() => setShowPalette((was) => !was)}>
            {showPalette ? "Close" : "+ Add a block"}
          </button>

          {showPalette ? (
            <div className="card space-y-4 p-3">
              {BLOCK_FAMILIES.map((family) => {
                const inFamily = Object.values(BLOCKS).filter((def) => def.family === family);
                if (inFamily.length === 0) return null;
                return (
                  <div key={family}>
                    <h3 className="mb-1 text-xs uppercase tracking-wide text-muted">{family}</h3>
                    <ul className="space-y-1">
                      {inFamily.map((def) => {
                        const full = atLimit.has(def.type);
                        return (
                          <li key={def.type}>
                            <button
                              type="button"
                              disabled={pending || full}
                              onClick={() => {
                                run(() => addBlock(def.type, selected ?? undefined));
                                setShowPalette(false);
                              }}
                              className="w-full rounded p-2 text-left hover:bg-paper disabled:opacity-40"
                              // Greyed out rather than hidden: "why can't I add
                              // another hero" is answerable, "where did the
                              // hero go" is not.
                              title={full ? "Your page already has one of these" : undefined}
                            >
                              <span className="block text-sm font-medium">{def.label}</span>
                              <span className="block text-xs text-muted">{def.blurb}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}

          {selected && byId.get(selected) ? (
            <BlockInspector
              key={selected}
              block={byId.get(selected)!}
              form={BLOCK_FORMS[byId.get(selected)!.type]}
              photos={photos}
              onDone={() => router.refresh()}
            />
          ) : null}

          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </div>

        {/* ---- the preview ---- */}
        <div className="hidden lg:block">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">Preview</span>
            <button
              type="button"
              className={`btn px-2 py-0.5 text-xs ${device === "phone" ? "border-accent" : ""}`}
              onClick={() => setDevice("phone")}
            >
              Phone
            </button>
            <button
              type="button"
              className={`btn px-2 py-0.5 text-xs ${device === "desktop" ? "border-accent" : ""}`}
              onClick={() => setDevice("desktop")}
            >
              Desktop
            </button>
            <Link href="/site/preview" target="_blank" className="text-xs text-muted underline">
              Open in a tab
            </Link>
          </div>
          <div className="flex justify-center border border-line bg-paper p-3">
            <iframe
              // The key remounts the frame whenever the draft changes, which
              // is what makes an edit show up without a manual refresh.
              key={previewKey}
              src="/site/preview"
              title="Preview"
              className={`h-[75vh] bg-white ${device === "phone" ? "w-[390px]" : "w-full"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  selected,
  pending,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  block: SiteBlock;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
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
      className={`flex items-center gap-2 px-3 py-2 ${isDragging ? "opacity-60" : ""} ${
        selected ? "bg-paper" : ""
      }`}
    >
      <button
        type="button"
        className="hidden cursor-grab text-muted lg:block"
        aria-label={`Reorder ${def.label}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <button type="button" onClick={onSelect} className="flex-1 text-left">
        <span className={`text-sm ${block.visible ? "" : "text-muted line-through"}`}>
          {def.label}
        </span>
        {block.audience !== "everyone" ? (
          <span className="ml-2 text-xs text-muted">
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
      {def.max === undefined ? (
        <button
          type="button"
          className="text-xs text-muted hover:underline"
          disabled={pending}
          onClick={onDuplicate}
        >
          Duplicate
        </button>
      ) : null}
      <button
        type="button"
        className="text-xs text-red-700 hover:underline"
        disabled={pending}
        onClick={onDelete}
      >
        Delete
      </button>
    </li>
  );
}
