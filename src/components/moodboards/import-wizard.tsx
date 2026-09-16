"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listPinterestBoards, listPinterestPins, type PinterestBoardSummary } from "@/server/actions/pinterest";
import { uploadFiles } from "./uploader";
import type { ImportableePin } from "@/lib/pinterest";

/**
 * Importing a Pinterest board.
 *
 * The pixels are handled in this browser, not on the server: the server lists
 * the pins (it holds the OAuth token), and here we fetch each image,
 * downscale it on a canvas and push it through the same upload path as a
 * dragged file. One upload path means one set of caps and one set of checks.
 *
 * THE ONE UNKNOWN, handled rather than assumed: whether Pinterest's CDN sends
 * permissive CORS headers. If it does not, fetching the image here fails (or
 * taints a canvas), so every fetch falls back to /api/proxy-image — same
 * origin, so nothing is tainted. Which path actually runs is the first thing
 * to find out when this is tried against a real board.
 */

type Step = "boards" | "pins";

export function ImportWizard({
  moodboardId,
  alreadyImported,
}: {
  moodboardId: string;
  alreadyImported: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("boards");
  const [boards, setBoards] = useState<PinterestBoardSummary[] | null>(null);
  const [pins, setPins] = useState<ImportableePin[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const imported = new Set(alreadyImported);

  function loadBoards() {
    startTransition(async () => {
      const result = await listPinterestBoards();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBoards(result.data);
      setError(null);
    });
  }

  function loadPins(boardId: string) {
    startTransition(async () => {
      const result = await listPinterestPins(boardId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPins(result.data.pins);
      // A 400-pin board is several calls; say so rather than showing a
      // partial board as if it were the whole thing.
      setNotice(
        [
          result.data.skipped > 0 ? `${result.data.skipped} pin(s) had no usable image and were skipped.` : null,
          result.data.truncated ? "This board has more pins than one pass fetches — import, then come back." : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      );
      // Default to everything not already on the board: the choosing is the
      // point, but "all of it" is the common case.
      setSelected(new Set(result.data.pins.filter((pin) => !imported.has(pin.externalId)).map((p) => p.externalId)));
      setStep("pins");
      setError(null);
    });
  }

  async function toFile(pin: ImportableePin): Promise<File | null> {
    const attempts = [pin.imageUrl, `/api/proxy-image?url=${encodeURIComponent(pin.imageUrl)}`];
    for (const url of attempts) {
      try {
        const response = await fetch(url, { mode: url.startsWith("/") ? "same-origin" : "cors" });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) continue;
        return new File([blob], `${pin.externalId}.img`, { type: blob.type });
      } catch {
        // CORS, or the network. Try the proxy next.
      }
    }
    return null;
  }

  function runImport() {
    const chosen = pins.filter((pin) => selected.has(pin.externalId) && !imported.has(pin.externalId));
    if (chosen.length === 0) return;

    startTransition(async () => {
      const files: Parameters<typeof uploadFiles>[1][number][] = [];
      const failures: string[] = [];

      for (const [index, pin] of chosen.entries()) {
        setProgress(`Fetching ${index + 1} of ${chosen.length}…`);
        const file = await toFile(pin);
        if (!file) {
          failures.push(pin.caption ?? pin.externalId);
          continue;
        }
        files.push({
          file,
          meta: {
            origin: "pinterest",
            externalId: pin.externalId,
            caption: pin.caption,
            sourceUrl: pin.sourceUrl,
            credit: pin.credit,
          },
        });
      }

      const outcome = await uploadFiles(moodboardId, files, (done, total) =>
        setProgress(`Adding ${done} of ${total}…`),
      );
      setProgress(null);

      const allFailures = [
        ...failures.map((name) => `${name}: couldn't be fetched`),
        ...outcome.failures.map((failure) => `${failure.name}: ${failure.reason}`),
      ];
      setError(allFailures.length > 0 ? allFailures.slice(0, 8).join(" · ") : null);

      if (outcome.uploaded > 0) router.push(`/moodboards/${moodboardId}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? <p className="card p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-muted">{notice}</p> : null}
      {progress ? <p className="text-sm">{progress}</p> : null}

      {step === "boards" ? (
        <>
          {boards === null ? (
            <button type="button" className="btn-primary" disabled={pending} onClick={loadBoards}>
              {pending ? "Loading…" : "Show my Pinterest boards"}
            </button>
          ) : boards.length === 0 ? (
            <p className="text-sm text-muted">No boards came back for that account.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((board) => (
                <li key={board.id} className="card overflow-hidden">
                  <button
                    type="button"
                    className="block w-full text-left"
                    disabled={pending}
                    onClick={() => loadPins(board.id)}
                  >
                    {board.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={board.coverUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="aspect-[4/3] bg-line/30" />
                    )}
                    <span className="block p-3">
                      <span className="block font-medium">{board.name}</span>
                      <span className="block text-sm text-muted">
                        {board.pinCount ?? "?"} pins{board.privacy && board.privacy !== "PUBLIC" ? " · secret" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={() => setStep("boards")}>
              ← Boards
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSelected(new Set(pins.filter((p) => !imported.has(p.externalId)).map((p) => p.externalId)))}
            >
              Select all
            </button>
            <button type="button" className="btn" onClick={() => setSelected(new Set())}>
              Select none
            </button>
            <button type="button" className="btn-primary ml-auto" disabled={pending || selected.size === 0} onClick={runImport}>
              Import {selected.size}
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pins.map((pin) => {
              const done = imported.has(pin.externalId);
              return (
                <li key={pin.externalId} className={`card overflow-hidden ${done ? "opacity-50" : ""}`}>
                  <label className="block cursor-pointer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pin.imageUrl} alt={pin.caption ?? ""} className="aspect-square w-full object-cover" />
                    <span className="flex items-start gap-2 p-2 text-xs">
                      <input
                        type="checkbox"
                        checked={done || selected.has(pin.externalId)}
                        disabled={done}
                        onChange={(event) => {
                          const next = new Set(selected);
                          if (event.target.checked) next.add(pin.externalId);
                          else next.delete(pin.externalId);
                          setSelected(next);
                        }}
                      />
                      <span>{done ? "Already on this board" : (pin.caption ?? "Untitled")}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
