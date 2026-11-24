import { describe, expect, it } from "vitest";
import { pushDue, type ReminderTask } from "./reminders";

const TZ = "Pacific/Auckland";
const at = (hhmm: string, day = "2027-03-06") => new Date(`${day}T${hhmm}:00+13:00`).toISOString();
const task = (id: string, from: string, over: Partial<ReminderTask> = {}, day = "2027-03-06"): ReminderTask => ({
  id,
  title: id,
  startsAt: at(from, day),
  state: "todo",
  ...over,
});
const none = new Set<string>();

describe("pushDue", () => {
  const tasks = [task("a", "13:45"), task("b", "15:00")];
  it("is due for a job starting within ten minutes", () => {
    const due = pushDue(tasks, new Date(at("13:36")), none);
    expect(due.map((d) => d.task.id)).toEqual(["a"]);
  });
  it("is not due earlier, or once started time has passed", () => {
    expect(pushDue(tasks, new Date(at("13:30")), none)).toEqual([]);
    expect(pushDue(tasks, new Date(at("13:46")), none)).toEqual([]);
  });
  it("skips finished jobs and ones already reminded", () => {
    expect(pushDue([task("a", "13:45", { state: "done" })], new Date(at("13:40")), none)).toEqual([]);
    const key = pushDue(tasks, new Date(at("13:40")), none)[0]!.key;
    expect(pushDue(tasks, new Date(at("13:41")), new Set([key]))).toEqual([]);
  });
});
