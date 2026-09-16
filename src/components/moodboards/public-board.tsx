"use client";

import { useState } from "react";
import type { PublicBoard } from "@/server/moodboards/resolve";

/**
 * A board as an audience sees it: the photographer, or a guest wondering what
 * "garden party formal" means.
 *
 * Grid, not canvas. Almost everyone who opens one of these opens it on a
 * phone, and a board that needs panning is a board people close.
 */
export function PublicBoardView({ board }: { board: PublicBoard }) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? null : board.items[open];

  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {board.items.map((item, index) => (
          <figure key={item.id} className="break-inside-avoid overflow-hidden rounded-lg bg-white">
            <button
              type="button"
              className="block w-full"
              onClick={() => setOpen(index)}
              aria-label={item.caption ?? "Open image"}
            >
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl}
                  alt={item.caption ?? ""}
                  loading="lazy"
                  className="w-full"
                  style={
                    item.width && item.height
                      ? { aspectRatio: `${item.width} / ${item.height}` }
                      : undefined
                  }
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-muted">
                  Image unavailable
                </div>
              )}
            </button>
            {item.caption || item.note ? (
              <figcaption className="space-y-1 p-2 text-sm">
                {item.caption ? <p>{item.caption}</p> : null}
                {/* Only present at all when the share says so — the server
                    drops the column otherwise, so it never reaches the page. */}
                {item.note ? <p className="text-muted">{item.note}</p> : null}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>

      {current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal
          onClick={() => setOpen(null)}
        >
          <div className="max-h-full max-w-5xl overflow-auto text-center">
            {current.displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.displayUrl} alt={current.caption ?? ""} className="mx-auto max-h-[80vh] w-auto" />
            ) : null}
            {current.caption ? <p className="mt-3 text-sm text-white">{current.caption}</p> : null}
            {current.note ? <p className="mt-1 text-sm text-white/70">{current.note}</p> : null}
            {current.source_url ? (
              <a
                href={current.source_url}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="mt-2 inline-block text-xs text-white/70 underline"
                onClick={(event) => event.stopPropagation()}
              >
                {current.credit ?? "Source"}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {board.showCredits && board.items.some((item) => item.credit || item.source_url) ? (
        <section className="mt-10 border-t border-line pt-4 text-xs text-muted">
          <h2 className="font-medium">Where these came from</h2>
          <ul className="mt-2 space-y-1">
            {board.items
              .filter((item) => item.credit || item.source_url)
              .map((item) => (
                <li key={item.id}>
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noreferrer noopener nofollow" className="underline">
                      {item.credit ?? item.source_url}
                    </a>
                  ) : (
                    item.credit
                  )}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
