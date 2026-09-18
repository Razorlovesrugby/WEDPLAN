"use client";

import { useEffect, useState } from "react";

/**
 * "Hide completed" (spec 15 §6) — a per-list/per-view display preference,
 * not shared data, following spec 1 §5a's precedent for the sort
 * preference: client-only (localStorage), no schema column, no round trip.
 * Falls back to "show everything" wherever storage is unavailable (private
 * browsing, blocked site data) rather than throwing.
 */
export function useHideCompleted(storageKey: string): [boolean, (next: boolean) => void] {
  const key = `wedplan:hideCompleted:${storageKey}`;
  const [hide, setHide] = useState(false);

  useEffect(() => {
    try {
      setHide(localStorage.getItem(key) === "1");
    } catch {
      // Nothing to read — stays "show everything".
    }
  }, [key]);

  function update(next: boolean) {
    setHide(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Nothing to persist to — the toggle still works for this render.
    }
  }

  return [hide, update];
}

export function HideCompletedToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Hide completed
    </label>
  );
}
