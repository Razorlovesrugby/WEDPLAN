"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { assignGuests } from "@/server/actions/seating";
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
import { defaultTrayMode, type TrayMode } from "@/lib/seating/tray";
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
  /** Seat guests at a table, in a chair, or back in the tray (null). Optimistic. */
  move: (guestIds: string[], tableId: string | null, seatIndex?: number | null) => void;
  openTableId: string | null;
  openTable: (id: string | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  pending: boolean;
  refresh: () => void;
};

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

  // A fresh server render is the truth: take it over the optimistic copy.
  useEffect(() => setAssignments(data.assignments), [data.assignments]);
  useEffect(() => setTablesState(data.tables), [data.tables]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const move = useCallback(
    (guestIds: string[], tableId: string | null, seatIndex?: number | null) => {
      if (guestIds.length === 0) return;
      setError(null);
      let before: SeatingAssignment[] = [];
      setAssignments((current) => {
        before = current;
        return applyMove(current, guestIds, tableId, seatIndex);
      });
      startTransition(async () => {
        const result = await assignGuests(eventId, tableId, guestIds, seatIndex ?? null);
        if (!result.ok) {
          setAssignments(before);
          setError(result.error);
        }
        router.refresh();
      });
    },
    [eventId, router],
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
    return {
      eventId,
      timeZone,
      data,
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
      move,
      openTableId,
      openTable,
      error,
      setError,
      pending,
      refresh,
    };
  }, [eventId, timeZone, data, assignments, tables, setTables, trayMode, colourBy, held, move, openTableId, error, pending, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
