import { utcToZonedInput, zonedInputToUtc } from "@/lib/timezone";
import type { TaskState } from "./state";

/**
 * What "My day" shows (spec 54 §6.2, §6.5): the Now card, what's next, what's
 * done, and when the buttons work. Pure; the page passes the clock in.
 */

export type MyDayTask = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  state: TaskState;
  /** When the couple last changed the task; compared with `seenAt` for the badge. */
  updatedAt: string;
  seenAt: string | null;
  lateMinutes: number | null;
};

const MIN = 60_000;

/** The wedding-timezone calendar date of an instant, "YYYY-MM-DD". */
export function localDate(iso: string, timeZone: string): string {
  return utcToZonedInput(iso, timeZone).slice(0, 10);
}

function addDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return moved.toISOString().slice(0, 10);
}

/** Midnight at the start of the task's own day, in the wedding's timezone. */
export function dayStartMs(iso: string, timeZone: string): number {
  const at = zonedInputToUtc(`${localDate(iso, timeZone)}T00:00`, timeZone);
  return at ? Date.parse(at) : Date.parse(iso);
}

/** Midnight that ends the task's own day. */
export function dayEndMs(iso: string, timeZone: string): number {
  const at = zonedInputToUtc(`${addDay(localDate(iso, timeZone), 1)}T00:00`, timeZone);
  return at ? Date.parse(at) : Date.parse(iso) + 24 * 60 * MIN;
}

/** Buttons work from midnight before the task's own day (§6.5). */
export function buttonsWork(task: Pick<MyDayTask, "startsAt">, now: Date, timeZone: string): boolean {
  return now.getTime() >= dayStartMs(task.startsAt, timeZone);
}

export type DayPhase = "before" | "day" | "after" | "none";

/** Before the first task's day, during the days with tasks, or after the last (§6.5). */
export function dayPhase(tasks: readonly Pick<MyDayTask, "startsAt" | "endsAt">[], now: Date, timeZone: string): DayPhase {
  if (tasks.length === 0) return "none";
  const first = Math.min(...tasks.map((t) => dayStartMs(t.startsAt, timeZone)));
  const last = Math.max(...tasks.map((t) => dayEndMs(t.endsAt, timeZone)));
  const t = now.getTime();
  if (t < first) return "before";
  if (t >= last) return "after";
  return "day";
}

const isOpen = (task: MyDayTask) => task.state === "todo" || task.state === "started";

export type MyDay = {
  /** The current task, or the next one when nothing is current. */
  now: MyDayTask | null;
  next: MyDayTask[];
  earlier: MyDayTask[];
};

/**
 * Now is the one the person started, else one whose window holds the clock,
 * else the next one to begin, else the earliest still open (running late past
 * its end). Done and handed-back tasks are Earlier today; so are open tasks
 * that ended with a later one still ahead.
 */
export function arrangeMyDay(tasks: readonly MyDayTask[], now: Date): MyDay {
  const t = now.getTime();
  const sorted = [...tasks].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || Date.parse(a.endsAt) - Date.parse(b.endsAt),
  );
  const earlier = sorted.filter((task) => !isOpen(task));
  const open = sorted.filter(isOpen);

  const current =
    open.find((task) => task.state === "started") ??
    open.find((task) => Date.parse(task.startsAt) <= t && t < Date.parse(task.endsAt)) ??
    open.find((task) => Date.parse(task.startsAt) > t) ??
    open[0] ??
    null;

  return {
    now: current,
    next: open.filter((task) => task !== current),
    earlier,
  };
}

/** "ends in 12 min", "starts in 25 min", "started 5 min ago", "ended 3 min ago". */
export function timingPhrase(task: Pick<MyDayTask, "startsAt" | "endsAt">, now: Date): string {
  const t = now.getTime();
  const start = Date.parse(task.startsAt);
  const end = Date.parse(task.endsAt);
  const words = (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / MIN));
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };
  if (t < start) return `starts in ${words(start - t)}`;
  if (t < end) return `ends in ${words(end - t)}`;
  return `ended ${words(t - end)} ago`;
}

/** The couple changed this task since the person last opened it (§6.2). Never for a task they haven't seen. */
export function isChanged(task: Pick<MyDayTask, "updatedAt" | "seenAt">): boolean {
  if (!task.seenAt) return false;
  return Date.parse(task.updatedAt) > Date.parse(task.seenAt);
}

/** The seven-day expiry after the last event (§12), or the wedding date, or null. */
export function linkExpiry(lastEventEnd: string | null, weddingDate: string | null, timeZone: string): Date | null {
  const base = lastEventEnd
    ? localDate(lastEventEnd, timeZone)
    : weddingDate
      ? weddingDate
      : null;
  if (!base) return null;
  const at = zonedInputToUtc(`${addDay(base, 8)}T00:00`, timeZone);
  return at ? new Date(at) : null;
}
