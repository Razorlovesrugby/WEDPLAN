"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteLayoutDraft, makeLayoutLive, renameLayout, restoreLayoutDraft, tryLayout } from "@/server/actions/seating-layouts";
import { guestName } from "@/lib/seating/model";
import { orderLayouts, recentlyDeleted, suggestDraftName, swapReport } from "@/lib/seating/layouts";
import { pluralise } from "@/lib/format";
import { useSeating } from "./seating-state";

/**
 * The layouts of this event (spec 57 Part G): the live one, and drafts the
 * couple is trying beside it. A draft is edited exactly like the live layout
 * and has its own seating; nothing a guest or a day link reads changes until
 * a draft is made live.
 */
export function LayoutTabs() {
  const { eventId, data, assignments, setError } = useSeating();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "try" | "rename" | "swap">("idle");
  const [name, setName] = useState("");

  const layouts = orderLayouts(data.layouts);
  const current = data.layouts.find((l) => l.id === data.layoutId) ?? null;
  const live = data.layouts.find((l) => l.isLive && !l.deletedAt) ?? null;
  const deleted = recentlyDeleted(data.layouts);
  const hrefFor = (id: string, isLive: boolean) => (isLive ? `/events/${eventId}/seating` : `/events/${eventId}/seating?layout=${id}`);

  // Nothing placed yet and no draft: there is nothing to try, so the strip stays out of the way.
  if (!current && data.layouts.length === 0) return null;

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) =>
    startTransition(async () => {
      const r = await job();
      if (!r.ok) setError(r.error ?? "That didn't work");
      else then?.();
      router.refresh();
    });

  const report = current && !current.isLive ? swapReport(data.guests, assignments) : null;

  return (
    <section aria-label="Layouts" className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Layouts" className="flex flex-wrap gap-1">
          {layouts.map((l) => {
            const selected = l.id === current?.id;
            return (
              <Link
                key={l.id}
                role="tab"
                aria-selected={selected}
                href={hrefFor(l.id, l.isLive)}
                scroll={false}
                className={`rounded border px-3 py-1.5 text-sm ${selected ? "border-ink bg-ink text-white" : "border-line text-muted hover:bg-line/50"}`}
              >
                {l.name}
                {l.isLive ? <span className={`ml-1.5 text-xs ${selected ? "text-white/80" : "text-green-700"}`}>Live</span> : <span className={`ml-1.5 text-xs ${selected ? "text-white/80" : "text-muted"}`}>Draft</span>}
                {l.lockedAt ? <span className="ml-1.5 text-xs" title="The room is locked">🔒</span> : null}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          className="btn py-1"
          disabled={pending}
          onClick={() => {
            setName(suggestDraftName(data.layouts.map((l) => l.name)));
            setMode(mode === "try" ? "idle" : "try");
          }}
        >
          + Try a layout
        </button>
        {current && !current.isLive ? (
          <details className="relative">
            <summary className="btn cursor-pointer list-none py-1" aria-label="This draft">
              This draft ⋯
            </summary>
            <ul className="absolute left-0 z-30 mt-1 w-56 rounded border border-line bg-white py-1 text-sm shadow-lg">
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-paper"
                  onClick={() => {
                    setName(current.name);
                    setMode("rename");
                  }}
                >
                  Rename
                </button>
              </li>
              <li>
                <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-paper" onClick={() => setMode("swap")}>
                  Make this the live layout…
                </button>
              </li>
              <li className="border-t border-line">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-paper"
                  onClick={() => {
                    if (!window.confirm(`Delete "${current.name}"? It stays in Recently deleted for 30 days.`)) return;
                    run(
                      () => deleteLayoutDraft(eventId, current.id),
                      () => router.push(`/events/${eventId}/seating`),
                    );
                  }}
                >
                  Delete this draft
                </button>
              </li>
            </ul>
          </details>
        ) : null}
      </div>

      {mode === "try" || mode === "rename" ? (
        <form
          className="card flex flex-wrap items-end gap-2 p-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "try") {
              run(
                async () => {
                  const r = await tryLayout(eventId, data.layoutId, name);
                  if (r.ok) router.push(`/events/${eventId}/seating?layout=${r.data.id}`);
                  return r;
                },
                () => setMode("idle"),
              );
            } else if (current) {
              run(() => renameLayout(eventId, current.id, name), () => setMode("idle"));
            }
          }}
        >
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-xs text-muted">
              {mode === "try" ? `Copy "${current?.name ?? "this layout"}", seating and all, into a draft called` : "Name"}
            </span>
            <input className="field w-full" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={pending || !name.trim()}>
            {mode === "try" ? "Make the draft" : "Save"}
          </button>
          <button type="button" className="btn" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </form>
      ) : null}

      {current && !current.isLive ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          This is a draft. Guests, day links and the venue pack still show{" "}
          <strong>{live?.name ?? "the live layout"}</strong>; seating you change here stays here until you make it the live layout.
        </div>
      ) : null}

      {mode === "swap" && current && !current.isLive && report ? (
        <div className="card space-y-2 p-3 text-sm" role="dialog" aria-label="Make this the live layout">
          <p>
            Make <strong>{current.name}</strong> the live layout? <strong>{live?.name ?? "The current layout"}</strong> becomes a draft
            named “{live ? `${live.name.slice(0, 44)} (before …)` : "before"}”, so you can swap it back.
          </p>
          {report.unseatedComing.length > 0 ? (
            <div>
              <p className="font-medium text-amber-800">
                {pluralise(report.unseatedComing.length, "guest")} coming {report.unseatedComing.length === 1 ? "has" : "have"} no seat in this draft
              </p>
              <p className="text-muted">{report.unseatedComing.slice(0, 12).map((g) => guestName(g)).join(", ")}{report.unseatedComing.length > 12 ? ` and ${report.unseatedComing.length - 12} more` : ""}</p>
            </div>
          ) : null}
          {report.seatedNotComing.length > 0 ? (
            <div>
              <p className="font-medium text-amber-800">
                {pluralise(report.seatedNotComing.length, "guest")} seated in this draft {report.seatedNotComing.length === 1 ? "is" : "are"} no longer coming
              </p>
              <p className="text-muted">{report.seatedNotComing.slice(0, 12).map((g) => guestName(g)).join(", ")}{report.seatedNotComing.length > 12 ? ` and ${report.seatedNotComing.length - 12} more` : ""}</p>
            </div>
          ) : null}
          {report.unseatedComing.length === 0 && report.seatedNotComing.length === 0 ? <p className="text-muted">Everyone coming has a seat in it.</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                run(
                  () => makeLayoutLive(eventId, current.id),
                  () => {
                    setMode("idle");
                    router.push(`/events/${eventId}/seating`);
                  },
                )
              }
            >
              Make it live
            </button>
            <button type="button" className="btn" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {deleted.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Recently deleted ({deleted.length})</summary>
          <ul className="mt-1 divide-y divide-line rounded border border-line">
            {deleted.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-xs text-muted">{pluralise(l.tables, "table")}</span>
                <button type="button" className="btn py-0.5" disabled={pending} onClick={() => run(() => restoreLayoutDraft(eventId, l.id))}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
