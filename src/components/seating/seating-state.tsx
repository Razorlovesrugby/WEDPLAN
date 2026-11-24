"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { assignGuests } from "@/server/actions/seating";
import { captureSeatingState, restoreSeatingState } from "@/server/actions/seating-workspace";
import { guestName, type BlockedChair } from "@/lib/seating/model";
import { computeFit } from "@/lib/seating/fit";
import { undoRedoFor, isTypingTarget } from "@/lib/shortcuts";
import type { ColourBy, ColourContext } from "@/lib/seating/colour";
import type {
  SeatingAssignment,
  SeatingFixture,
  SeatingGuest,
  SeatingPlan,
  SeatingRule,
  SeatingTable,
} from "@/lib/seating/model";
import { applyMove } from "@/lib/seating/moves";
import { defaultTrayMode, trayHouseholds, type TrayMode } from "@/lib/seating/tray";
import {
  computeWarnings,
  occupancy,
  summarise,
  warningsByTable,
  type SeatingSummary,
  type SeatingWarning,
  type TableOccupancy,
} from "@/lib/seating/warnings";

export type SeatingData = {
  plan: SeatingPlan | null;
  backgroundUrl: string | null;
  tables: SeatingTable[];
  fixtures: SeatingFixture[];
  assignments: SeatingAssignment[];
  rules: SeatingRule[];
  guests: SeatingGuest[];
  blocked: BlockedChair[];
  colour: ColourContext;
};

/** Who's picked up for tap-to-place (§A.3): a guest or a household, until put down. */
export type Held = { guestIds: string[]; label: string } | null;

type SeatingState = {
  eventId: string;
  timeZone: string;
  data: SeatingData;
  /** The optimistic copies: what the screen shows while an action is in flight. */
  assignments: SeatingAssignment[];
  tables: SeatingTable[];
  setTables: (update: (tables: SeatingTable[]) => SeatingTable[]) => void;
  guestById: Map<string, SeatingGuest>;
  tableById: Map<string, SeatingTable>;
  occupancy: Map<string, TableOccupancy>;
  warnings: SeatingWarning[];
  warningsByTable: Map<string, SeatingWarning[]>;
  summary: SeatingSummary;
  trayMode: TrayMode;
  setTrayMode: (m: TrayMode) => void;
  colourBy: ColourBy;
  setColourBy: (c: ColourBy) => void;
  held: Held;
  hold: (h: Held) => void;
  /** Several-at-once (spec 53 Part D): while on, chips toggle a checkbox instead of picking up. */
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  selected: Set<string>;
  /** Toggles one guest; with `range`, selects from the last one toggled to this one, in tray order. */
  toggleSelected: (guestId: string, range?: boolean) => void;
  setSelected: (ids: Set<string>) => void;
  /** Spec 53 Part E: the guest a search just found, ringed on their chair. */
  highlightGuestId: string | null;
  /** Spec 53 Part F: what the chairs show. Remembered per device. */
  show: { names: boolean; numbers: boolean };
  setShow: (s: { names: boolean; numbers: boolean }) => void;
  /** Opens a seated guest's table and rings their chair. */
  focusGuest: (guestId: string) => void;
  /** Seat guests at a table, in a chair, or back in the tray (null). Optimistic. */
  move: (guestIds: string[], tableId: string | null, seatIndex?: number | null) => void;
  openTableId: string | null;
  openTable: (id: string | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  pending: boolean;
  refresh: () => void;
  /**
   * Runs a write as one undoable step (spec 53 Part C): the plan is captured
   * before and after, so the step can be undone through `restoreSeatingState`.
   * Writes run one at a time, in the order they were made.
   */
  track: <T extends { ok: boolean }>(label: string, write: () => Promise<T>) => Promise<T>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The step Undo would undo, and the one Redo would redo, for the toolbar. */
  undoLabel: string | null;
  redoLabel: string | null;
};

type UndoEntry = {
  label: string;
  before: Record<string, unknown>;
  beforeHash: string;
  after: Record<string, unknown>;
  afterHash: string;
};
const UNDO_LIMIT = 100;

const Ctx = createContext<SeatingState | null>(null);

export function useSeating(): SeatingState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSeating outside SeatingProvider");
  return ctx;
}

export function SeatingProvider({
  eventId,
  timeZone,
  data,
  initialColourBy,
  children,
}: {
  eventId: string;
  timeZone: string;
  data: SeatingData;
  initialColourBy: ColourBy;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignments, setAssignments] = useState(data.assignments);
  const [tables, setTablesState] = useState(data.tables);
  const [trayMode, setTrayMode] = useState<TrayMode>(() => defaultTrayMode(data.guests));
  const [colourBy, setColourBy] = useState<ColourBy>(initialColourBy);
  const [held, hold] = useState<Held>(null);
  const [openTableId, openTable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastToggled = useRef<string | null>(null);
  const [highlightGuestId, setHighlightGuestId] = useState<string | null>(null);
  const [show, setShowState] = useState({ names: false, numbers: false });
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("wedplan.seating.show") ?? "null");
      if (saved && typeof saved === "object") setShowState({ names: Boolean(saved.names), numbers: Boolean(saved.numbers) });
    } catch {
      /* storage blocked: the default is fine */
    }
  }, []);
  const setShow = useCallback((next: { names: boolean; numbers: boolean }) => {
    setShowState(next);
    try {
      window.localStorage.setItem("wedplan.seating.show", JSON.stringify(next));
    } catch {
      /* as above */
    }
  }, []);

  // A fresh server render is the truth: take it over the optimistic copy.
  useEffect(() => setAssignments(data.assignments), [data.assignments]);
  useEffect(() => setTablesState(data.tables), [data.tables]);

  const refresh = useCallback(() => router.refresh(), [router]);

  // Live on the day (spec 53 Part I): arrivals and moves from day links show up within 15 seconds.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, 15_000);
    return () => clearInterval(id);
  }, [router]);

  // The undo and redo stacks live in refs (they are not what renders); `bump` re-renders the toolbar.
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [stackVersion, bump] = useState(0);
  const touch = () => bump((n) => n + 1);

  const track = useCallback(
    <T extends { ok: boolean }>(label: string, write: () => Promise<T>): Promise<T> => {
      const job = queue.current.then(async () => {
        const before = await captureSeatingState(eventId, true).catch(() => null);
        const result = await write();
        if (result.ok && before?.ok) {
          const after = await captureSeatingState(eventId, false).catch(() => null);
          if (after?.ok && after.data.hash !== before.data.hash) {
            undoStack.current = [
              ...undoStack.current,
              { label, before: before.data.payload, beforeHash: before.data.hash, after: after.data.payload, afterHash: after.data.hash },
            ].slice(-UNDO_LIMIT);
            redoStack.current = [];
            touch();
          }
        }
        return result;
      });
      queue.current = job.catch(() => undefined);
      return job;
    },
    [eventId],
  );

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const from = direction === "undo" ? undoStack : redoStack;
      const entry = from.current.at(-1);
      if (!entry) return;
      queue.current = queue.current.then(async () => {
        const payload = direction === "undo" ? entry.before : entry.after;
        const expected = direction === "undo" ? entry.afterHash : entry.beforeHash;
        const result = await restoreSeatingState(eventId, payload, expected).catch(() => null);
        from.current = from.current.slice(0, -1);
        if (result?.ok) {
          const next: UndoEntry =
            direction === "undo" ? { ...entry, beforeHash: result.data.hash } : { ...entry, afterHash: result.data.hash };
          if (direction === "undo") redoStack.current = [...redoStack.current, next];
          else undoStack.current = [...undoStack.current, next];
          setError(null);
        } else {
          // Dropped: someone else changed the plan since, or the write failed.
          setError(result && !result.ok ? result.error : "That couldn't be undone.");
        }
        touch();
        router.refresh();
      });
    },
    [eventId, router],
  );
  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  // Cmd+Z / Ctrl+Z, Shift+Cmd+Z / Ctrl+Y (spec 46's key rules; never while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = undoRedoFor(e, isTypingTarget(e.target as HTMLElement | null));
      if (!action) return;
      e.preventDefault();
      if (action === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const move = useCallback(
    (guestIds: string[], tableId: string | null, seatIndex?: number | null) => {
      if (guestIds.length === 0) return;
      setError(null);
      let before: SeatingAssignment[] = [];
      setAssignments((current) => {
        before = current;
        return applyMove(current, guestIds, tableId, seatIndex);
      });
      const names = guestIds
        .map((id) => data.guests.find((g) => g.id === id))
        .filter((g): g is SeatingGuest => Boolean(g))
        .map((g) => guestName(g));
      const who = names.length === 0 ? "guests" : names.length <= 2 ? names.join(" and ") : `${names[0]} and ${names.length - 1} others`;
      const where = tableId ? tables.find((t) => t.id === tableId)?.label : null;
      const label = where ? `Seated ${who} at ${where}` : `Unseated ${who}`;
      startTransition(async () => {
        const result = await track(label, () => assignGuests(eventId, tableId, guestIds, seatIndex ?? null));
        if (!result.ok) {
          setAssignments(before);
          setError(result.error);
        }
        router.refresh();
      });
    },
    [eventId, router, data.guests, tables, track],
  );

  const toggleSelected = useCallback(
    (guestId: string, range = false) => {
      setSelected((current) => {
        const next = new Set(current);
        const order = trayHouseholds(data.guests, assignments, trayMode).flatMap((h) => h.guests.map((g) => g.id));
        const from = lastToggled.current ? order.indexOf(lastToggled.current) : -1;
        const to = order.indexOf(guestId);
        if (range && from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          for (const id of order.slice(a, b + 1)) next.add(id);
        } else if (!next.delete(guestId)) next.add(guestId);
        lastToggled.current = guestId;
        return next;
      });
    },
    [data.guests, assignments, trayMode],
  );

  const focusGuest = useCallback(
    (guestId: string) => {
      const seat = assignments.find((a) => a.guestId === guestId);
      if (!seat) return;
      setHighlightGuestId(guestId);
      openTable(seat.tableId);
      setTimeout(() => setHighlightGuestId((cur) => (cur === guestId ? null : cur)), 6000);
    },
    [assignments],
  );

  const setTables = useCallback((update: (t: SeatingTable[]) => SeatingTable[]) => setTablesState(update), []);

  const value = useMemo<SeatingState>(() => {
    const guestById = new Map(data.guests.map((g) => [g.id, g]));
    const tableById = new Map(tables.map((t) => [t.id, t]));
    const input = {
      tables,
      fixtures: data.fixtures,
      guests: data.guests,
      assignments,
      rules: data.rules,
      trayMode,
    };
    const warnings = computeWarnings(input);
    // Colour by fit (Part G) is computed from the live plan, so it follows every move.
    const fit = computeFit({
      guests: data.guests,
      seats: new Map(assignments.map((a) => [a.guestId, a.tableId])),
      rules: data.rules,
      warned: new Set(warnings.filter((w) => w.severity === "warning").flatMap((w) => w.guestIds)),
    });
    const dataWithFit: SeatingData = { ...data, colour: { ...data.colour, fit: Object.fromEntries(fit) } };
    return {
      eventId,
      timeZone,
      data: dataWithFit,
      assignments,
      tables,
      setTables,
      guestById,
      tableById,
      occupancy: occupancy(tables, data.guests, assignments),
      warnings,
      warningsByTable: warningsByTable(warnings),
      summary: summarise(input, warnings),
      trayMode,
      setTrayMode,
      colourBy,
      setColourBy,
      held,
      hold,
      selectMode,
      setSelectMode,
      selected,
      toggleSelected,
      setSelected,
      highlightGuestId,
      focusGuest,
      show,
      setShow,
      move,
      openTableId,
      openTable,
      error,
      setError,
      pending,
      refresh,
      track,
      undo,
      redo,
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      undoLabel: undoStack.current.at(-1)?.label ?? null,
      redoLabel: redoStack.current.at(-1)?.label ?? null,
    };
  }, [eventId, timeZone, data, assignments, tables, setTables, trayMode, colourBy, held, move, openTableId, error, pending, refresh, track, undo, redo, stackVersion, selectMode, selected, toggleSelected, highlightGuestId, focusGuest, show, setShow]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
