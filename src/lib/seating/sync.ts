/**
 * When the Room view may take the server's copy of the plan over its own (spec 60 E.1).
 *
 * The screen re-reads the plan every 15 seconds and after each write. Taken at the wrong
 * moment, the server's copy moves an item back (a write has not landed yet) or throws away
 * part of a run of arrow presses that is waiting to be saved. So while anything of the
 * person's own is pending, the screen keeps its copy and takes the server's once nothing is.
 */

/** What is pending on this screen. */
export type SyncHolds = {
  /** Tracked writes in flight or queued (including undo and redo). */
  writes: number;
  /** A run of arrow presses or turns is waiting to be saved. */
  nudges: boolean;
  /** A drag, a selection box or a stamp line is in progress. */
  gesture: boolean;
};

/** The longest a server copy is held back before it is taken anyway. */
export const HOLD_MAX_MS = 10_000;

export const NO_HOLDS: SyncHolds = { writes: 0, nudges: false, gesture: false };

export const isHeld = (h: SyncHolds): boolean => h.writes > 0 || h.nudges || h.gesture;

/** The 15-second refresh skips a tick while anything is pending, rather than queueing one. */
export const skipPoll = (h: SyncHolds): boolean => isHeld(h);

export type SyncDecision =
  /** Nothing pending: take the server's copy. */
  | "take"
  /** Something is pending: keep the screen's copy for now. */
  | "hold"
  /** Held too long: take it anyway. */
  | "give-up";

/**
 * What to do with a server copy that has arrived. `heldForMs` is how long the screen has
 * been holding a copy back (0 for the first one).
 */
export function syncDecision(h: SyncHolds, heldForMs: number): SyncDecision {
  if (!isHeld(h)) return "take";
  return heldForMs >= HOLD_MAX_MS ? "give-up" : "hold";
}

/** What to tell the person when a copy is taken after the cap while a write has not come back; null when nothing is unsaved. */
export function giveUpMessage(h: SyncHolds): string | null {
  return h.writes > 0 ? "A change hasn't finished saving. The plan now shows what is saved; check that your last edit is there." : null;
}
