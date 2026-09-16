"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/browser";
import {
  deleteMoodboardItem,
  reorderMoodboardItems,
  setCoverItem,
  updateMoodboardItem,
} from "@/server/actions/moodboards";
import { uploadFiles } from "./uploader";
import type { SignedItem } from "@/server/queries/moodboards";

/**
 * The board itself: a masonry grid, drag to reorder, drop/paste to upload,
 * click a tile to edit it.
 *
 * The 4px PointerSensor activation constraint is the app's standing fix for
 * dnd-kit swallowing a plain click as a zero-distance drag (session 15), and
 * this screen needs it more than most — every tile is both draggable and
 * clickable.
 */

export function BoardGrid({
  moodboardId,
  items,
  weddingId,
}: {
  moodboardId: string;
  items: SignedItem[];
  weddingId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function ingest(files: File[]) {
    if (files.length === 0) return;
    setFailures([]);
    setBusy(`Adding ${files.length} image${files.length === 1 ? "" : "s"}…`);
    const outcome = await uploadFiles(
      moodboardId,
      files.map((file) => ({ file })),
      (done, total) => setBusy(`Adding ${done} of ${total}…`),
    );
    setBusy(null);
    setFailures(outcome.failures);
    router.refresh();
  }

  /**
   * Paste is not a nicety. The real workflow is "screenshot something, get it
   * onto the board", and a paste target removes the save-to-disk step.
   */
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length > 0) {
        event.preventDefault();
        void ingest(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodboardId]);

  /**
   * Live updates, as a NUDGE rather than a data channel.
   *
   * The inserted row is not renderable on its own — the bucket is private, so
   * an image needs a signed URL and signing is a server capability. So the
   * event carries nothing and the page re-renders on the server, which signs.
   * RLS applies to this subscription because it runs on the planner's own
   * session, which is what makes it acceptable where a socket carrying image
   * data would not be.
   */
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`moodboard-${moodboardId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moodboard_items",
          filter: `moodboard_id=eq.${moodboardId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [moodboardId, router]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const toIndex = items.findIndex((item) => item.id === over.id);
    if (toIndex === -1) return;

    startTransition(async () => {
      await reorderMoodboardItems(moodboardId, String(active.id), toIndex);
      router.refresh();
    });
  }

  const current = items.find((item) => item.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void ingest([...event.dataTransfer.files].filter((file) => file.type.startsWith("image/")));
        }}
        className={`rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-line text-muted"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void ingest([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          Add images
        </button>
        <span className="ml-3">or drop them here, or paste a screenshot</span>
        {busy ? <p className="mt-2 text-ink">{busy}</p> : null}
      </div>

      {failures.length > 0 ? (
        <ul className="card space-y-1 p-3 text-sm text-red-700">
          {failures.map((failure, index) => (
            <li key={index}>
              {failure.name ? <strong>{failure.name}: </strong> : null}
              {failure.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Nothing on this board yet. Add images, clip them from the web, or import a Pinterest board.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
              {items.map((item) => (
                <Tile key={item.id} item={item} onOpen={() => setSelected(item.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {current ? (
        <ItemPanel
          item={current}
          weddingId={weddingId}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({ item, onOpen }: { item: SignedItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const pending = item.uploaded_at === null;

  return (
    <figure
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative break-inside-avoid overflow-hidden rounded-lg border border-line bg-white ${
        isDragging ? "opacity-60" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      {pending ? (
        <div className="flex aspect-square items-center justify-center p-4 text-center text-xs text-red-700">
          This one didn&rsquo;t finish uploading.
        </div>
      ) : item.thumbUrl ? (
        // Plain <img>: these are signed, time-boxed URLs on a private bucket,
        // which is exactly what next/image's optimiser cannot cache sensibly.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbUrl}
          alt={item.caption ?? ""}
          loading="lazy"
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          className="w-full"
          style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined}
        />
      ) : (
        <div className="flex aspect-square items-center justify-center text-xs text-muted">
          Image unavailable
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        {item.is_cover ? "★ " : ""}
        {item.caption ?? "Edit"}
      </button>
    </figure>
  );
}

function ItemPanel({
  item,
  onClose,
  onChanged,
}: {
  item: SignedItem;
  weddingId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [caption, setCaption] = useState(item.caption ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [sourceUrl, setSourceUrl] = useState(item.source_url ?? "");
  const [credit, setCredit] = useState(item.credit ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
      <div className="card max-h-full w-full max-w-3xl overflow-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-serif text-xl">Image</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {item.displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.displayUrl} alt={item.caption ?? ""} className="w-full rounded" />
          ) : null}

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">Caption — everyone sees this</span>
              <input className="field mt-1" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>

            <label className="block text-sm">
              <span className="text-muted">
                Private note — only shown on a share link you switch it on for
              </span>
              <textarea
                className="field mt-1"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="text-muted">Where it came from</span>
              <input className="field mt-1" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            </label>

            <label className="block text-sm">
              <span className="text-muted">Credit</span>
              <input className="field mt-1" value={credit} onChange={(e) => setCredit(e.target.value)} />
            </label>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await updateMoodboardItem(item.id, {
                      caption,
                      note,
                      sourceUrl,
                      credit,
                    });
                    if (!result.ok) setError(result.error);
                    else onChanged();
                  })
                }
              >
                Save
              </button>

              <button
                type="button"
                className="btn"
                disabled={pending || item.is_cover}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setCoverItem(item.id);
                    if (!result.ok) setError(result.error);
                    else onChanged();
                  })
                }
              >
                {item.is_cover ? "Cover image" : "Make cover"}
              </button>

              <button
                type="button"
                className="btn text-red-700"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Delete this image? It's removed from storage too.")) return;
                  startTransition(async () => {
                    const result = await deleteMoodboardItem(item.id);
                    if (!result.ok) setError(result.error);
                    else onChanged();
                  });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
