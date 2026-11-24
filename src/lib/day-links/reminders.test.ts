import { describe, expect, it } from "vitest";
import { dayBeforeDue, pushDue, type ReminderTask } from "./reminders";

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

describe("dayBeforeDue", () => {
  const tasks = [task("b", "14:00"), task("a", "13:45")];
  it("is not due before 6 pm the day before", () => {
    expect(dayBeforeDue(tasks, new Date(at("17:59", "2027-03-05")), TZ, none)).toBeNull();
  });
  it("is due from 6 pm the day before, with the day's jobs in time order", () => {
    const due = dayBeforeDue(tasks, new Date(at("18:00", "2027-03-05")), TZ, none);
    expect(due?.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(due?.key).toBe("day-before:2027-03-06");
  });
  it("is sent once", () => {
    expect(dayBeforeDue(tasks, new Date(at("19:00", "2027-03-05")), TZ, new Set(["day-before:2027-03-06"]))).toBeNull();
  });
  it("is not due two days before, or on the day", () => {
    expect(dayBeforeDue(tasks, new Date(at("20:00", "2027-03-04")), TZ, none)).toBeNull();
    expect(dayBeforeDue(tasks, new Date(at("20:00", "2027-03-06")), TZ, none)).toBeNull();
  });
  it("leaves out handed-back jobs, and says nothing if none remain", () => {
    const handed = [task("a", "13:45", { state: "handed_back" })];
    expect(dayBeforeDue(handed, new Date(at("18:30", "2027-03-05")), TZ, none)).toBeNull();
  });
});

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
