import { dayStartMs, localDate } from "./my-day";
import { utcToZonedInput } from "@/lib/timezone";

/**
 * Who is due a reminder right now (spec 54 §6.15). Pure: the every-minute job
 * reads the tasks and what was already sent, and sends what this returns.
 *
 * - **Day before:** one email at 6 pm (wedding time) on the day before a
 *   helper's first job, until that first job's day has started.
 * - **Ten minutes before:** a push for each job that starts in the next ten
 *   minutes and isn't done or handed back.
 */

export type ReminderTask = {
  id: string;
  title: string;
  startsAt: string;
  state: "todo" | "started" | "done" | "handed_back";
};

export type DayBeforeDue = { key: string; tasks: ReminderTask[] };

export const DAY_BEFORE_HOUR = 18;
export const PUSH_LEAD_MINUTES = 10;

function addDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The tasks to list in tomorrow's email, or null when it isn't time. Due from
 * 18:00 local on the day before the first job's date, until that day begins.
 * The key is per date, so each helper gets one per day with jobs.
 */
export function dayBeforeDue(
  tasks: readonly ReminderTask[],
  now: Date,
  timeZone: string,
  alreadySent: ReadonlySet<string>,
): DayBeforeDue | null {
  const open = tasks.filter((t) => t.state !== "handed_back");
  if (open.length === 0) return null;
  const today = localDate(now.toISOString(), timeZone);
  const tomorrow = addDay(today, 1);
  const hour = Number(utcToZonedInput(now.toISOString(), timeZone).slice(11, 13));
  if (hour < DAY_BEFORE_HOUR) return null;
  const tomorrows = open.filter((t) => localDate(t.startsAt, timeZone) === tomorrow);
  if (tomorrows.length === 0) return null;
  const key = `day-before:${tomorrow}`;
  if (alreadySent.has(key)) return null;
  return { key, tasks: tomorrows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) };
}

export type PushDue = { key: string; task: ReminderTask };

/** Jobs starting within the next ten minutes that haven't been reminded and aren't finished. */
export function pushDue(
  tasks: readonly ReminderTask[],
  now: Date,
  alreadySent: ReadonlySet<string>,
): PushDue[] {
  const t = now.getTime();
  return tasks
    .filter((task) => task.state === "todo" || task.state === "started")
    .filter((task) => {
      const start = Date.parse(task.startsAt);
      return start > t && start - t <= PUSH_LEAD_MINUTES * 60_000;
    })
    .map((task) => ({ key: `push:${task.id}:${task.startsAt}`, task }))
    .filter((due) => !alreadySent.has(due.key));
}

/** Whether pushes make sense yet: the buttons (and the day) have begun for that job. */
export function dayHasStarted(task: Pick<ReminderTask, "startsAt">, now: Date, timeZone: string): boolean {
  return now.getTime() >= dayStartMs(task.startsAt, timeZone);
}
