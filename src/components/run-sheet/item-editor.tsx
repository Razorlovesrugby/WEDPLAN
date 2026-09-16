"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRunSheetItem,
  deleteRunSheetItem,
  pinRunSheetItem,
  unpinRunSheetItem,
  updateRunSheetItem,
} from "@/server/actions/run-sheet";
import { formatTime } from "@/lib/format";
import { utcToZonedInput } from "@/lib/timezone";
import type { RunSheetItemView, RunSheetTrack } from "@/lib/types/database";

const TRACKS: { value: RunSheetTrack; label: string }[] = [
  { value: "guests", label: "Guests" },
  { value: "couple", label: "Couple" },
  { value: "vendors", label: "Vendors" },
  { value: "other", label: "Other" },
];

/**
 * Title/location/owner/track/duration; a pin toggle switches between a time
 * picker (pinned) and a predecessor + offset picker (unpinned — the
 * predecessor is itself optional, leaving it unset saves the item as "time
 * TBD", spec 5, B6 decision 5). Live-previews the computed start time as
 * the form changes, the same way the platform spec asks V3's timeline
 * editor to.
 *
 * A dialog, not a route (spec 5, B4) — same reasoning as spec 6's
 * BudgetLinksPopup.
 */
export function RunSheetItemEditor({
  open,
  onClose,
  eventId,
  timeZone,
  item,
  allItems,
  defaultTrack,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  timeZone: string;
  /** Null in create mode. */
  item: RunSheetItemView | null;
  /** Every item on this event's run sheet, for the predecessor picker. */
  allItems: RunSheetItemView[];
  defaultTrack?: RunSheetTrack;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [owner, setOwner] = useState("");
  const [track, setTrack] = useState<RunSheetTrack>("other");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [guestVisible, setGuestVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [atInput, setAtInput] = useState("");
  const [predecessorId, setPredecessorId] = useState<string | null>(null);
  const [offsetMinutes, setOffsetMinutes] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setNotes(item?.notes ?? "");
    setLocation(item?.location ?? "");
    setOwner(item?.owner ?? "");
    setTrack(item?.track ?? defaultTrack ?? "other");
    setDurationMinutes(item?.duration_minutes ?? 30);
    setGuestVisible(item?.guest_visible ?? false);
    setPinned(item?.pinned ?? false);
    setAtInput(item?.pinned_at ? utcToZonedInput(item.pinned_at, timeZone) : "");
    setPredecessorId(item?.predecessor_id ?? null);
    setOffsetMinutes(item?.offset_minutes ?? 0);
    setError(null);
  }, [open, item, defaultTrack, timeZone]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const candidatePredecessors = useMemo(
    () => allItems.filter((i) => i.id !== item?.id),
    [allItems, item],
  );

  const preview = useMemo(() => {
    if (pinned) return atInput ? null : "Give it a time";
    if (!predecessorId) return "Time TBD — no predecessor set yet";
    const predecessor = candidatePredecessors.find((i) => i.id === predecessorId);
    if (!predecessor?.ends_at) return "Time TBD — the predecessor has no computed end yet";
    const startsAt = new Date(new Date(predecessor.ends_at).getTime() + offsetMinutes * 60_000);
    return `Starts around ${formatTime(startsAt, timeZone)}`;
  }, [pinned, atInput, predecessorId, offsetMinutes, candidatePredecessors, timeZone]);

  function save() {
    if (!title.trim()) {
      setError("Give the item a title");
      return;
    }
    if (pinned && !atInput) {
      setError("Give the pinned item a time");
      return;
    }

    startTransition(async () => {
      const baseFields = {
        title: title.trim(),
        notes: notes.trim() || undefined,
        location: location.trim() || undefined,
        owner: owner.trim() || undefined,
        track,
        durationMinutes,
        guestVisible,
      };

      if (item) {
        const result = await updateRunSheetItem(item.id, eventId, baseFields);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const pinResult = pinned
          ? await pinRunSheetItem(item.id, eventId, atInput)
          : await unpinRunSheetItem(item.id, eventId, predecessorId, offsetMinutes);
        if (!pinResult.ok) {
          setError(pinResult.error);
          return;
        }
      } else {
        const result = await createRunSheetItem(eventId, {
          ...baseFields,
          pinned,
          at: pinned ? atInput : undefined,
          predecessorId: pinned ? undefined : predecessorId,
          offsetMinutes: pinned ? undefined : offsetMinutes,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onClose();
      router.refresh();
    });
  }

  function onDelete() {
    if (!item) return;
    if (!window.confirm(`Remove "${item.title}"? Anything chained off it re-links to its own predecessor.`)) return;
    startTransition(async () => {
      const result = await deleteRunSheetItem(item.id, eventId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-lg border border-line bg-white p-0 shadow-lg backdrop:bg-black/30"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-serif text-lg">{item ? "Edit item" : "New run sheet item"}</h2>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <label className="block">
          <span className="mb-1 block text-xs text-muted">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field w-full" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs text-muted">Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="field w-full" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Owner (e.g. "DJ", "best man")</span>
            <input value={owner} onChange={(e) => setOwner(e.target.value)} className="field w-full" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Track</span>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as RunSheetTrack)}
              className="field w-full"
            >
              {TRACKS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Duration (minutes)</span>
            <input
              type="number"
              min={0}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="field w-full"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-muted">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field w-full" />
        </label>

        <div className="flex items-center gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Pinned to a fixed time
          </label>
        </div>

        {pinned ? (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Time</span>
            <input
              type="datetime-local"
              value={atInput}
              onChange={(e) => setAtInput(e.target.value)}
              className="field w-full"
            />
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs text-muted">Starts after…</span>
              <select
                value={predecessorId ?? ""}
                onChange={(e) => setPredecessorId(e.target.value || null)}
                className="field w-full"
              >
                <option value="">Nothing yet — time TBD</option>
                {candidatePredecessors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">Gap after it ends (minutes)</span>
              <input
                type="number"
                min={0}
                disabled={!predecessorId}
                value={offsetMinutes}
                onChange={(e) => setOffsetMinutes(Number(e.target.value))}
                className="field w-full"
              />
            </label>
          </div>
        )}

        <p className="text-xs text-muted">{preview}</p>

        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={guestVisible} onChange={(e) => setGuestVisible(e.target.checked)} />
          Guest-visible (not published anywhere yet — schema only)
        </label>

        <div className="flex items-center justify-between border-t border-line pt-3">
          {item ? (
            <button type="button" className="text-sm text-red-700 hover:underline" disabled={pending} onClick={onDelete}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn-primary" disabled={pending} onClick={save}>
            {item ? "Save" : "Add item"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
