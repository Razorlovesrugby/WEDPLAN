"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addSeatingSpace, deleteSeatingSpace, renameSeatingSpace } from "@/server/actions/seating-spaces";
import { pluralise } from "@/lib/format";
import { isAttending } from "@/lib/seating/tray";
import { useSeating } from "./seating-state";

/**
 * The spaces of the shown layout (spec 57 Part A): the ceremony lawn, the
 * marquee, the terrace. A guest holds one seat per layout across them, so the
 * counts on the right are for the whole event.
 */
export function SpaceTabs({ editable }: { editable: boolean }) {
  const { eventId, layoutId, isDraft, spaceId, data, assignments, setError } = useSeating();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "add" | "rename">("idle");
  const [name, setName] = useState("");

  const current = data.spaces.find((s) => s.id === spaceId) ?? data.spaces[0] ?? null;
  const hrefFor = (id: string) => `/events/${eventId}/seating?${isDraft && layoutId ? `layout=${layoutId}&` : ""}space=${id}`;

  const byGuest = new Map(data.guests.map((g) => [g.id, g]));
  const coming = data.guests.filter((g) => isAttending(g, "yes_pending")).length;
  const declinedInSeat = assignments.filter((a) => {
    const g = byGuest.get(a.guestId);
    return g && !isAttending(g, "yes_pending");
  }).length;

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, then?: () => void) =>
    startTransition(async () => {
      const r = await job();
      if (!r.ok) setError(r.error ?? "That didn't work");
      else then?.();
      router.refresh();
    });

  if (data.spaces.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Spaces" className="flex flex-wrap gap-1">
          {data.spaces.map((s) => {
            const selected = s.id === current?.id;
            return (
              <Link
                key={s.id}
                role="tab"
                aria-selected={selected}
                href={hrefFor(s.id)}
                scroll={false}
                className={`rounded px-3 py-1 text-sm ${selected ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}
              >
                {s.name}
              </Link>
            );
          })}
        </div>
        {editable ? (
          <>
            <button
              type="button"
              className="btn py-1"
              disabled={pending}
              onClick={() => {
                setName("");
                setMode(mode === "add" ? "idle" : "add");
              }}
            >
              + Space
            </button>
            {current ? (
              <details className="relative">
                <summary className="btn cursor-pointer list-none py-1" aria-label={`${current.name} options`}>
                  {current.name} ⋯
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
                  {data.spaces.length > 1 ? (
                    <li className="border-t border-line">
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-paper"
                        onClick={() => {
                          if (!window.confirm(`Delete "${current.name}"? Its tables move to another space, off the floor and still seated. Its furniture and décor are deleted.`)) return;
                          run(
                            () => deleteSeatingSpace(eventId, current.id, layoutId),
                            () => router.push(`/events/${eventId}/seating${isDraft && layoutId ? `?layout=${layoutId}` : ""}`),
                          );
                        }}
                      >
                        Delete this space
                      </button>
                    </li>
                  ) : null}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
        <span className="ml-auto text-xs text-muted" aria-label="Counts for the whole event">
          {pluralise(coming, "guest")} coming · {assignments.length} seated
          {declinedInSeat > 0 ? <span className="text-orange-700"> · {declinedInSeat} declined in a seat</span> : null}
        </span>
      </div>

      {mode === "add" || mode === "rename" ? (
        <form
          className="card flex flex-wrap items-end gap-2 p-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "add") {
              run(
                async () => {
                  const r = await addSeatingSpace(eventId, name, layoutId);
                  if (r.ok) router.push(hrefFor(r.data.id));
                  return r;
                },
                () => setMode("idle"),
              );
            } else if (current) {
              run(() => renameSeatingSpace(eventId, current.id, name), () => setMode("idle"));
            }
          }}
        >
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-xs text-muted">{mode === "add" ? "A new space: the terrace, the marquee, the ceremony lawn" : "Name"}</span>
            <input className="field w-full" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={pending || !name.trim()}>
            {mode === "add" ? "Add the space" : "Save"}
          </button>
          <button type="button" className="btn" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}
