import { describe, expect, it } from "vitest";
import {
  arrangeMyDay,
  buttonsWork,
  dayPhase,
  isChanged,
  linkExpiry,
  timingPhrase,
  type MyDayTask,
} from "./my-day";

const TZ = "Pacific/Auckland";
// Saturday 6 March 2027, NZDT (UTC+13).
const at = (hhmm: string, day = "2027-03-06") => new Date(`${day}T${hhmm}:00+13:00`).toISOString();

function task(id: string, from: string, to: string, over: Partial<MyDayTask> = {}): MyDayTask {
  return {
    id,
    title: id,
    startsAt: at(from),
    endsAt: at(to),
    state: "todo",
    updatedAt: at("08:00", "2027-03-01"),
    seenAt: null,
    lateMinutes: null,
    ...over,
  };
}

describe("arrangeMyDay", () => {
  const tasks = [task("a", "10:00", "10:30"), task("b", "13:45", "14:00"), task("c", "15:00", "15:30")];

  it("is the next task when nothing has started", () => {
    const day = arrangeMyDay(tasks, new Date(at("12:00")));
    expect(day.now?.id).toBe("b");
    expect(day.next.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("is the task whose window holds the clock", () => {
    expect(arrangeMyDay(tasks, new Date(at("13:50"))).now?.id).toBe("b");
  });

  it("is the one they started, even if another is due", () => {
    const started = [task("a", "10:00", "10:30", { state: "started" }), task("b", "10:10", "10:40")];
    expect(arrangeMyDay(started, new Date(at("10:15"))).now?.id).toBe("a");
  });

  it("puts done and handed-back tasks in Earlier today", () => {
    const mixed = [
      task("a", "10:00", "10:30", { state: "done" }),
      task("b", "11:00", "11:30", { state: "handed_back" }),
      task("c", "12:00", "12:30"),
    ];
    const day = arrangeMyDay(mixed, new Date(at("11:45")));
    expect(day.earlier.map((t) => t.id)).toEqual(["a", "b"]);
    expect(day.now?.id).toBe("c");
  });

  it("keeps an overrunning open task as Now rather than losing it", () => {
    const day = arrangeMyDay([task("a", "10:00", "10:30")], new Date(at("11:00")));
    expect(day.now?.id).toBe("a");
  });

  it("has no Now when there are no tasks", () => {
    expect(arrangeMyDay([], new Date()).now).toBeNull();
  });
});

describe("the day's phases and when buttons work", () => {
  const tasks = [task("a", "13:45", "14:00")];
  it("is before the day until midnight before the first task", () => {
    expect(dayPhase(tasks, new Date(at("23:00", "2027-03-05")), TZ)).toBe("before");
    expect(dayPhase(tasks, new Date(at("00:01")), TZ)).toBe("day");
  });
  it("is after once the last task's day is over", () => {
    expect(dayPhase(tasks, new Date(at("23:59")), TZ)).toBe("day");
    expect(dayPhase(tasks, new Date(at("00:00", "2027-03-07")), TZ)).toBe("after");
  });
  it("has no phase with no tasks", () => {
    expect(dayPhase([], new Date(), TZ)).toBe("none");
  });
  it("unlocks each task from midnight before its own day", () => {
    const friday = { startsAt: at("18:00", "2027-03-05") };
    const saturday = { startsAt: at("13:45") };
    const now = new Date(at("09:00", "2027-03-05"));
    expect(buttonsWork(friday, now, TZ)).toBe(true);
    expect(buttonsWork(saturday, now, TZ)).toBe(false);
  });
});

describe("timingPhrase", () => {
  const t = task("a", "13:45", "14:00");
  it("counts down to the start and the end", () => {
    expect(timingPhrase(t, new Date(at("13:20")))).toBe("starts in 25 min");
    expect(timingPhrase(t, new Date(at("13:48")))).toBe("ends in 12 min");
    expect(timingPhrase(t, new Date(at("14:03")))).toBe("ended 3 min ago");
  });
  it("speaks in hours past 60 minutes", () => {
    expect(timingPhrase(t, new Date(at("12:15")))).toBe("starts in 1 h 30 min");
  });
});

describe("isChanged", () => {
  it("is never set for a task the person hasn't seen", () => {
    expect(isChanged({ updatedAt: at("09:00"), seenAt: null })).toBe(false);
  });
  it("is set when the couple edited after the person looked", () => {
    expect(isChanged({ updatedAt: at("10:00"), seenAt: at("09:00") })).toBe(true);
    expect(isChanged({ updatedAt: at("09:00"), seenAt: at("10:00") })).toBe(false);
  });
});

describe("linkExpiry", () => {
  it("is seven days after the last event, at the end of that day", () => {
    const expiry = linkExpiry(at("22:00"), "2027-03-06", TZ);
    // 6 March + 7 days = 13 March ends at midnight into the 14th.
    expect(expiry?.toISOString()).toBe(new Date("2027-03-14T00:00:00+13:00").toISOString());
  });
  it("falls back to the wedding date", () => {
    expect(linkExpiry(null, "2027-03-06", TZ)).not.toBeNull();
    expect(linkExpiry(null, null, TZ)).toBeNull();
  });
});

import { CUE_POLL_MS, POLL_MS, countdown, cueState, pollInterval } from "./my-day";

describe("cues", () => {
  const cue = (over: Partial<{ isCue: boolean; cueCalledAt: string | null; state: "todo" | "started" | "done" | "handed_back" }> = {}) => ({
    startsAt: at("14:00"),
    isCue: true,
    cueCalledAt: null,
    state: "todo" as const,
    ...over,
  });
  it("is quiet until five minutes before", () => {
    expect(cueState(cue(), new Date(at("13:50"))).kind).toBe("none");
    expect(cueState(cue(), new Date(at("13:55")))).toEqual({ kind: "standby", secondsToStart: 300 });
  });
  it("stays on standby past the start until the master says go", () => {
    expect(cueState(cue(), new Date(at("14:01")))).toEqual({ kind: "standby", secondsToStart: -60 });
  });
  it("turns to Go on the master's word and counts since", () => {
    const state = cueState(cue({ cueCalledAt: at("14:00") }), new Date(`2027-03-06T14:00:04+13:00`));
    expect(state).toEqual({ kind: "go", secondsSince: 4 });
  });
  it("lets Go lapse after two minutes", () => {
    expect(cueState(cue({ cueCalledAt: at("14:00") }), new Date(at("14:05"))).kind).toBe("none");
  });
  it("ignores plain tasks and finished cues", () => {
    expect(cueState(cue({ isCue: false }), new Date(at("13:58"))).kind).toBe("none");
    expect(cueState(cue({ state: "done" }), new Date(at("13:58"))).kind).toBe("none");
  });
  it("polls every 3 seconds only while a cue is live", () => {
    expect(pollInterval([cue()], new Date(at("13:30")))).toBe(POLL_MS);
    expect(pollInterval([cue()], new Date(at("13:57")))).toBe(CUE_POLL_MS);
  });
  it("formats the countdown", () => {
    expect(countdown(272)).toBe("4:32");
    expect(countdown(-5)).toBe("0:00");
  });
});
