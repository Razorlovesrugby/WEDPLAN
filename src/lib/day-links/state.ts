/**
 * An assignee's part of a task (spec 54 §6.4): four states and the moves
 * between them, plus the rule that keeps a replayed tap from undoing a newer
 * one (§9).
 */

export type TaskState = "todo" | "started" | "done" | "handed_back";

export type TaskAction = "start" | "done" | "undo" | "hand_back";

export type TaskPart = {
  state: TaskState;
  /** When the part first moved to started, kept through done so Undo can go back to it. */
  startedAt: string | null;
};

/**
 * The state a tap moves to, or null when the tap isn't allowed from here.
 *
 * - Start: only from To do.
 * - Done: from To do (the task was quick) or On it.
 * - Undo: Done goes back to On it if it was started, else To do; Handed back
 *   goes back to To do (it undoes the tap, not the decision to be asked).
 * - Hand back: from To do or On it, never once Done.
 */
export function nextState(part: TaskPart, action: TaskAction): TaskState | null {
  switch (action) {
    case "start":
      return part.state === "todo" ? "started" : null;
    case "done":
      return part.state === "todo" || part.state === "started" ? "done" : null;
    case "undo":
      if (part.state === "done") return part.startedAt ? "started" : "todo";
      if (part.state === "handed_back") return "todo";
      return null;
    case "hand_back":
      return part.state === "todo" || part.state === "started" ? "handed_back" : null;
  }
}

/**
 * "A replayed offline tap can never overwrite a newer state": a state change
 * is applied only if its tap is later than the state's own time. A state with
 * no time yet (never changed) takes any tap.
 */
export function tapIsNewer(tappedAt: string, stateAt: string | null): boolean {
  if (!stateAt) return true;
  const tap = Date.parse(tappedAt);
  const current = Date.parse(stateAt);
  if (Number.isNaN(tap)) return false;
  if (Number.isNaN(current)) return true;
  return tap > current;
}

/**
 * The device's clock is the tap's time (it queues offline), but a phone with
 * the wrong date must not win every race or write into the future: a time
 * more than a minute ahead of the server is the server's own.
 */
export function clampTapTime(tappedAt: string | undefined, now: Date = new Date()): string {
  const parsed = tappedAt ? Date.parse(tappedAt) : NaN;
  if (Number.isNaN(parsed)) return now.toISOString();
  return new Date(Math.min(parsed, now.getTime() + 60_000)).toISOString();
}

export const STATE_LABEL: Record<TaskState, string> = {
  todo: "To do",
  started: "On it",
  done: "Done",
  handed_back: "Handed back",
};

/** Running late is a note on the part, not a state: only these amounts are offered. */
export const LATE_CHOICES = [5, 10, 15] as const;

export const HELP_REASONS = [
  "Can't find someone",
  "Something's missing",
  "Running out of time",
  "Something's wrong",
] as const;
