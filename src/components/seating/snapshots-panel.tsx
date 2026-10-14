"use client";

import { useState, useTransition } from "react";
import {
  deleteSeatingSnapshot,
  renameSeatingSnapshot,
  restoreSeatingSnapshot,
  saveSeatingSnapshot,
  setSeatingReveal,
} from "@/server/actions/seating";
import { pluralise } from "@/lib/format";
import { utcToZonedInput } from "@/lib/timezone";
import type { SeatingSnapshotSummary } from "@/server/queries/seating";
import { useSeating } from "./seating-state";

/**
 * Saved copies (Part E): try a layout, put the old one back. Restoring saves
 * the layout it replaces first, so a restore is itself undoable.
 */
export function SnapshotsPanel({
  snapshots,
  collaborators,
}: {
  snapshots: SeatingSnapshotSummary[];
  collaborators: { user_id: string; display_name: string | null; role: string }[];
}) {
  const { eventId, timeZone, refresh, setError } = useSeating();
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const who = (id: string | null) => {
    const c = collaborators.find((x) => x.user_id === id);
    return c ? c.display_name || (c.role === "owner" ? "Partner A" : "Partner B") : null;
  };
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));

  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Saved copies <span className="font-normal text-muted">({snapshots.length})</span>
      </summary>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await saveSeatingSnapshot(eventId, name || `Copy of ${when(new Date().toISOString())}`);
            if (!r.ok) setError(r.error);
            else {
              setName("");
              setNotice("Saved.");
            }
            refresh();
          });
        }}
      >
        <input
          className="field flex-1"
          placeholder="Name this layout — “Draft A”, “Families together”…"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          Save a copy
        </button>
      </form>
      {notice ? <p className="mt-2 text-muted">{notice}</p> : null}

      {snapshots.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {snapshots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {s.name}
                  {s.automatic ? <span className="ml-1 text-xs text-muted">(automatic)</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {when(s.createdAt)}
                  {who(s.createdBy) ? ` · ${who(s.createdBy)}` : ""} · {pluralise(s.tables, "table")},{" "}
                  {s.seated} seated
                </p>
              </div>
              <button
                type="button"
                className="btn py-1"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Put "${s.name}" back? The layout you have now is saved first, so you can undo this.`)) return;
                  startTransition(async () => {
                    const r = await restoreSeatingSnapshot(s.id, eventId);
                    if (!r.ok) setError(r.error);
                    else
                      setNotice(
                        `Restored ${pluralise(r.data.tables, "table")} and ${r.data.seated} seated.` +
                          (r.data.skipped > 0
                            ? ` ${pluralise(r.data.skipped, "guest")} ${r.data.skipped === 1 ? "has" : "have"} been removed from the list since, and ${r.data.skipped === 1 ? "was" : "were"} left out.`
                            : ""),
                      );
                    refresh();
                  });
                }}
              >
                Restore
              </button>
              <button
                type="button"
                className="text-xs text-muted underline"
                onClick={() => {
                  const next = window.prompt("Rename this copy", s.name);
                  if (!next?.trim()) return;
                  startTransition(async () => {
                    const r = await renameSeatingSnapshot(s.id, eventId, next);
                    if (!r.ok) setError(r.error);
                    refresh();
                  });
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => {
                  if (!window.confirm(`Delete "${s.name}"?`)) return;
                  startTransition(async () => {
                    const r = await deleteSeatingSnapshot(s.id, eventId);
                    if (!r.ok) setError(r.error);
                    refresh();
                  });
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

/** Part F: from when each household's page shows them their table. */
export function RevealPanel() {
  const { eventId, timeZone, data, refresh, setError } = useSeating();
  const current = data.plan?.reveal_at ? utcToZonedInput(data.plan.reveal_at, timeZone) : "";
  const [at, setAt] = useState(current);
  const [pending, startTransition] = useTransition();
  const revealed = data.plan?.reveal_at ? new Date(data.plan.reveal_at) <= new Date() : false;

  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Showing guests their table{" "}
        <span className="font-normal text-muted">
          ({data.plan?.reveal_at ? (revealed ? "showing now" : `from ${current.replace("T", " ")}`) : "not shown"})
        </span>
      </summary>
      <p className="mt-2 text-muted">
        Add a &ldquo;Your table&rdquo; section to your site, and from this date each household&rsquo;s own page shows
        where they&rsquo;re sitting. Nobody can look anyone else up. Changes after this date show straight away.
      </p>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await setSeatingReveal(eventId, at);
            if (!r.ok) setError(r.error);
            refresh();
          });
        }}
      >
        <label>
          <span className="mb-1 block text-xs text-muted">Show from ({timeZone})</span>
          <input className="field" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={pending}>
          Save
        </button>
        {data.plan?.reveal_at ? (
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              setAt("");
              startTransition(async () => {
                const r = await setSeatingReveal(eventId, "");
                if (!r.ok) setError(r.error);
                refresh();
              });
            }}
          >
            Stop showing
          </button>
        ) : null}
      </form>
    </details>
  );
}
