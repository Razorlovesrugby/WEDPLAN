import { dayStartMs } from "./my-day";

/**
 * Who is due a reminder right now (spec 54 §6.15). Pure: the every-minute job
 * reads the tasks and what was already sent, and sends what this returns.
 *
 * - **Ten minutes before:** a push for each job that starts in the next ten
 *   minutes and isn't done or handed back.
 */

export type ReminderTask = {
  id: string;
  title: string;
  startsAt: string;
  state: "todo" | "started" | "done" | "handed_back";
};

export const PUSH_LEAD_MINUTES = 10;

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
