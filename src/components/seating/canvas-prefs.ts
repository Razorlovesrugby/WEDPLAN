"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LOCKS, parseLocks, parseNavMode, type LayerLocks, type NavMode } from "@/lib/seating/canvas";
import { parseRefs, RECENT_MAX } from "@/lib/seating/stamp";

/**
 * Per-device canvas preferences (spec 59): the navigation mode and the layer
 * locks. They live in this browser only, never in the database, so a person on
 * a trackpad and a person on a mouse can share one plan. Several parts of the
 * screen read the same value, so it is an external store: a change anywhere is
 * seen everywhere at once.
 *
 * Browser storage can be blocked or throw (private windows, blocked site
 * data): every read and write is guarded, and a value that can't be stored
 * still holds for this visit from memory.
 */

const EVENT = "wedplan:seating-pref";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* blocked: fall back to this visit's memory */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* as above */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

/** One stored value, parsed defensively; `parse(null)` is the default. */
export function usePref<T>(key: string, parse: (raw: unknown) => T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => {
    try {
      return parse(raw === null ? null : JSON.parse(raw));
    } catch {
      return parse(null);
    }
  }, [raw, parse]);
  const set = useCallback((next: T) => write(key, JSON.stringify(next)), [key]);
  return [value, set];
}

const parseFlag = (raw: unknown) => raw === true;

/** A remembered yes/no (a tip dismissed, a hint shown), default no. */
export function useFlag(key: string): [boolean, (on: boolean) => void] {
  return usePref<boolean>(key, parseFlag);
}

/** Trackpad (the default) or Mouse: what the wheel does on the plan. */
export function useNavMode(): [NavMode, (m: NavMode) => void] {
  return usePref<NavMode>("wedplan.seating.nav", parseNavMode);
}

/** Which layers are locked: drawn, but never picked or moved. Only the venue is locked at first. */
export function useLayerLocks(): [LayerLocks, (l: LayerLocks) => void] {
  return usePref<LayerLocks>("wedplan.seating.locks", parseLocks);
}

export { DEFAULT_LOCKS };

/** The panels of the left rail in focus mode (spec 59 A.2), in order. */
export const RAIL_PANELS = [
  { id: "guests", label: "Guests" },
  { id: "library", label: "Library" },
  { id: "venue", label: "Venue" },
  { id: "styles", label: "Styles" },
  { id: "food", label: "Food" },
  { id: "rules", label: "Rules" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
] as const;
export type RailPanel = (typeof RAIL_PANELS)[number]["id"];

/** Which panel is open, whether it sits beside the plan (pinned) or over it, and whether the panels are hidden altogether. Per device. */
export type RailPrefs = { panel: RailPanel | null; pinned: boolean; hidden: boolean };
const DEFAULT_RAIL: RailPrefs = { panel: "guests", pinned: true, hidden: false };

export function parseRail(raw: unknown): RailPrefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_RAIL;
  const r = raw as Record<string, unknown>;
  const known = RAIL_PANELS.some((p) => p.id === r.panel);
  return {
    // `null` is a choice (every panel closed); anything unrecognised takes the default.
    panel: r.panel === null ? null : known ? (r.panel as RailPanel) : DEFAULT_RAIL.panel,
    pinned: typeof r.pinned === "boolean" ? r.pinned : DEFAULT_RAIL.pinned,
    hidden: r.hidden === true,
  };
}

export function useRail(): [RailPrefs, (patch: Partial<RailPrefs>) => void] {
  const [rail, setRail] = usePref<RailPrefs>("wedplan.seating.rail", parseRail);
  const set = useCallback((patch: Partial<RailPrefs>) => setRail({ ...rail, ...patch }), [rail, setRail]);
  return [rail, set];
}

/** The last six things stamped, on this device (spec 59 Part C). */
export function useRecentStamps(): [string[], (refs: string[]) => void] {
  return usePref<string[]>("wedplan.seating.recent", (raw) => parseRefs(raw, RECENT_MAX));
}
