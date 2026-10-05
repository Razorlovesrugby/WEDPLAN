"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One rule about saving (spec 24 §6, spec 27 step 0).
 *
 * The draft is not public — that is the entire architecture of spec 23 — so
 * there is nothing a stray keystroke can damage and no reason for a Save
 * button. This writes ~600ms after typing stops, immediately on `flush()` (a
 * field being left), when the tab is hidden, and when the form goes away.
 *
 * **The one thing autosave must never do is lose words silently while looking
 * calm.** So a failed write is reported in place and the typed value stays on
 * screen; the form keeps trying on the next change or the next blur.
 */

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: Date }
  | { state: "error"; message: string };

type SaveResult = { ok: true } | { ok: false; error: string };

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<SaveResult>,
  delay = 600,
): { status: SaveStatus; flush: () => void } {
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });

  // Refs, not state: the timer callbacks and the unmount cleanup must always
  // see the latest value and the latest `save` without being re-created.
  const latest = useRef(value);
  const saveRef = useRef(save);
  const dirty = useRef(false);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = value;
  saveRef.current = save;

  const run = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;

    setStatus({ state: "saving" });
    const result = await saveRef.current(latest.current);
    if (result.ok) {
      // Something typed while the write was in flight has already set `dirty`
      // and scheduled its own write; claiming "saved" over it would be a lie.
      setStatus(dirty.current ? { state: "saving" } : { state: "saved", at: new Date() });
    } else {
      dirty.current = true;
      setStatus({ state: "error", message: result.error });
    }
  }, []);

  useEffect(() => {
    // The first render is the stored value, not an edit.
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
  }, [value, delay, run]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void run();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      // Selecting another block unmounts this form mid-debounce. The edit made
      // half a second ago is not allowed to be the price of that click.
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) void saveRef.current(latest.current);
    };
  }, [run]);

  return { status, flush: () => void run() };
}

/** "Saved · 14:32", "Saving…", or the reason it did not. */
export function saveStatusLabel(status: SaveStatus): string | null {
  switch (status.state) {
    case "idle":
      return null;
    case "saving":
      return "Saving…";
    case "saved":
      return `Saved · ${status.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    case "error":
      return `Not saved — ${status.message}`;
  }
}
