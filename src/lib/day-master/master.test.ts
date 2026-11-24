import { describe, expect, it } from "vitest";
import { openAlerts, waitingMinutes, type MasterActivity, type MasterAssignee, type MasterItem } from "./alerts";
import { describeShift, previewShift, type ShiftItem } from "./shift";
import { readiness, readinessSummary } from "./readiness";
import { summaryCsvRows, summaryProblems, type SummaryItem } from "./summary";

const at = (hhmm: string) => new Date(`2027-03-06T${hhmm}:00+13:00`);
const iso = (hhmm: string) => at(hhmm).toISOString();

const item = (id: string, from: string, to: string, over: Partial<MasterItem> = {}): MasterItem => ({ id, title: id, startsAt: iso(from), endsAt: iso(to), critical: false, ...over });
const row = (rowId: string, itemId: string, over: Partial<MasterAssignee> = {}): MasterAssignee => ({ rowId, itemId, name: "Sione", state: "todo", lateMinutes: null, handedBackReason: null, ...over });
const none = new Set<string>();
const alertsAt = (now: string, items: MasterItem[], assignees: MasterAssignee[], activity: MasterActivity[] = [], dismissed: Set<string> = none) =>
  openAlerts({ items, assignees, activity, dismissed, now: at(now) });

describe("not started", () => {
  const items = [item("a", "13:45", "14:15")];
  it("is raised 5 minutes after the start when nobody has tapped Start", () => {
    expect(alertsAt("13:49", items, [row("r1", "a")])).toEqual([]);
    const a = alertsAt("13:51", items, [row("r1", "a")]);
    expect(a.map((x) => x.kind)).toEqual(["not_started"]);
    expect(a[0]!.severity).toBe("amber");
  });
  it("is raised at the start, in red, for a critical task", () => {
    const a = alertsAt("13:46", [item("a", "13:45", "14:15", { critical: true })], [row("r1", "a")]);
    expect(a[0]).toMatchObject({ kind: "not_started", severity: "red" });
  });
  it("is not raised once anyone has started, or after the task ends", () => {
    expect(alertsAt("13:55", items, [row("r1", "a", { state: "started" })])).toEqual([]);
    expect(alertsAt("14:20", items, [row("r1", "a")])).toEqual([]);
  });
  it("can be dismissed", () => {
    expect(alertsAt("13:55", items, [row("r1", "a")], [], new Set(["notstarted:a"]))).toEqual([]);
  });
});

describe("help", () => {
  const help = (over: Partial<MasterActivity> = {}): MasterActivity => ({ id: "h1", kind: "help", itemId: "a", who: "Kiri", payload: { reason: "Can't find someone" }, tappedAt: iso("14:00"), answeredAt: null, ...over });
  it("stays open until answered", () => {
    expect(alertsAt("14:01", [item("a", "13:45", "14:15")], [], [help()])[0]).toMatchObject({ kind: "help", severity: "red", escalated: false });
    expect(alertsAt("14:01", [item("a", "13:45", "14:15")], [], [help({ answeredAt: iso("14:01") })])).toEqual([]);
  });
  it("escalates after 3 minutes and moves to the top", () => {
    const items = [item("a", "13:45", "14:15", { critical: true })];
    const a = alertsAt("14:04", items, [row("r1", "a")], [help()]);
    expect(a[0]).toMatchObject({ kind: "help", escalated: true });
    expect(waitingMinutes(a[0]!.since, at("14:04"))).toBe(4);
  });
});

describe("handed back", () => {
  const items = [item("a", "15:00", "15:30")];
  it("is raised when nobody else is on the task, and escalates 15 minutes before the start", () => {
    const rows = [row("r1", "a", { state: "handed_back", handedBackReason: "Sick" })];
    expect(alertsAt("14:00", items, rows)[0]).toMatchObject({ kind: "handed_back", detail: "Sick", escalated: false });
    expect(alertsAt("14:46", items, rows)[0]!.escalated).toBe(true);
  });
  it("is quiet when someone else is still on it", () => {
    const rows = [row("r1", "a", { state: "handed_back" }), row("r2", "a", { name: "Tama" })];
    expect(alertsAt("14:00", items, rows)).toEqual([]);
  });
});

describe("running late", () => {
  it("is raised while the part is to do or on it, keyed by the amount", () => {
    const items = [item("a", "13:45", "14:15")];
    const a = alertsAt("13:50", items, [row("r1", "a", { state: "started", lateMinutes: 10 })]);
    expect(a.find((x) => x.kind === "late")).toMatchObject({ key: "late:r1:10", detail: "+10 min" });
    expect(alertsAt("13:50", items, [row("r1", "a", { state: "done", lateMinutes: 10 })])).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts escalated, then red, then the newest first", () => {
    const items = [item("a", "13:00", "14:00"), item("b", "13:00", "14:00", { critical: true })];
    const rows = [row("r1", "a"), row("r2", "b")];
    const help: MasterActivity = { id: "h", kind: "help", itemId: "a", who: "Kiri", payload: {}, tappedAt: iso("13:30"), answeredAt: null };
    const a = alertsAt("13:36", items, rows, [help]);
    expect(a[0]!.kind).toBe("help");
    expect(a[0]!.escalated).toBe(true);
    expect(a.map((x) => x.severity)).toEqual(["red", "red", "amber"]);
  });
});

describe("previewShift", () => {
  const items: ShiftItem[] = [
    { id: "ceremony", title: "Ceremony", startsAt: iso("14:00"), endsAt: iso("14:30"), predecessorId: null },
    { id: "photos", title: "Photos", startsAt: iso("14:30"), endsAt: iso("15:15"), predecessorId: "ceremony" },
    { id: "drinks", title: "Drinks", startsAt: iso("15:15"), endsAt: iso("16:00"), predecessorId: "photos" },
    { id: "dinner", title: "Dinner", startsAt: iso("18:00"), endsAt: iso("20:00"), predecessorId: null },
  ];
  const sameDay = () => true;
  it("moves the item and what starts after it, leaving fixed times where they are", () => {
    const p = previewShift(items, "photos", 10, "chain", sameDay);
    expect(p.problem).toBeNull();
    expect(p.moves.map((m) => m.id)).toEqual(["photos", "drinks"]);
    expect(p.moves[0]!.to).toBe(iso("14:40"));
    expect(p.fixed.map((f) => f.id)).toEqual(["dinner"]);
  });
  it("describes the move in a line", () => {
    const p = previewShift(items, "photos", 10, "chain", sameDay);
    expect(describeShift(p, (s) => new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit", hour12: false }).format(new Date(s)))).toBe("2 items, 14:30 → 14:40 … 15:15 → 15:25");
  });
  it("moves just one item only when nothing starts after it", () => {
    expect(previewShift(items, "drinks", 5, "only", sameDay).moves.map((m) => m.id)).toEqual(["drinks"]);
    expect(previewShift(items, "photos", 5, "only", sameDay).problem).toMatch(/starts? after this one/);
  });
  it("won't move an item to before its predecessor ends", () => {
    expect(previewShift(items, "photos", -5, "chain", sameDay).problem).toMatch(/can't start before/);
  });
  it("rejects a nonsense amount", () => {
    expect(previewShift(items, "photos", 0, "chain", sameDay).problem).not.toBeNull();
  });
});

describe("readiness", () => {
  const base = {
    items: [
      { id: "a", title: "Programmes", assigneeCount: 1, handedBack: false, openPlaces: 0 },
      { id: "b", title: "Guestbook", assigneeCount: 0, handedBack: false, openPlaces: 2 },
    ],
    helpers: [
      { key: "p1", name: "Sione", hasLink: true, opened: true, phone: "021 555 0101" },
      { key: "p2", name: "Tama", hasLink: true, opened: false, phone: null },
      { key: "p3", name: "Rangi", hasLink: false, opened: false, phone: "021 555 0102" },
    ],
    tasks: { total: 10, confirmed: 8 },
    questions: 1,
    contacts: 0,
    infoSections: 0,
  };
  const lines = readiness(base);
  const by = (k: string) => lines.find((l) => l.key === k)!;
  it("finds each gap", () => {
    expect(by("unassigned").names).toEqual(["Guestbook"]);
    expect(by("no_link").names).toEqual(["Rangi"]);
    expect(by("unopened").names).toEqual(["Tama"]);
    expect(by("no_phone").names).toEqual(["Tama"]);
    expect(by("open_places").names).toEqual(["Guestbook (2)"]);
    expect(by("confirmed").label).toBe("Confirmed 8 of 10");
  });
  it("sends each gap to the run sheet view where it is fixed (spec 56 §6.3)", () => {
    expect(by("unassigned").href).toBe("/run-sheet/people");
    expect(by("open_places").href).toBe("/run-sheet/people");
    for (const key of ["no_link", "unopened", "no_phone", "handed_back", "questions", "confirmed"]) {
      expect(by(key).href, key).toBe("/run-sheet/links");
    }
  });
  it("says whether the day is ready", () => {
    expect(readinessSummary(lines).ready).toBe(false);
    const clean = readiness({ items: [{ id: "a", title: "A", assigneeCount: 1, handedBack: false, openPlaces: 0 }], helpers: [], tasks: { total: 1, confirmed: 1 }, questions: 0, contacts: 1, infoSections: 1 });
    expect(readinessSummary(clean)).toEqual({ ready: true, open: 0 });
  });
});

describe("summary", () => {
  const items: SummaryItem[] = [
    { id: "a", title: "Programmes", startsAt: iso("13:45"), isCue: false, cueCalledAt: null, assignees: [{ name: "Sione", state: "done", doneAt: iso("14:00"), startedAt: iso("13:47"), lateMinutes: null, handedBackReason: null }, { name: "Tama", state: "handed_back", doneAt: null, startedAt: null, lateMinutes: null, handedBackReason: "Sick" }] },
    { id: "b", title: "Walk-in music", startsAt: iso("14:00"), isCue: true, cueCalledAt: iso("14:02"), assignees: [{ name: "Rangi", state: "todo", doneAt: null, startedAt: null, lateMinutes: null, handedBackReason: null }] },
  ];
  const format = (s: string) => s.slice(11, 16);
  it("lists what was handed back or never done", () => {
    expect(summaryProblems(items)).toEqual({ neverDone: [{ item: "Walk-in music", who: "Rangi" }], handedBack: [{ item: "Programmes", who: "Tama", reason: "Sick" }] });
  });
  it("makes one CSV row per assignee, per cue, per help and per announcement", () => {
    const rows = summaryCsvRows(
      items,
      [{ id: "h", kind: "help", who: "Kiri", itemTitle: "Programmes", tappedAt: iso("14:00"), payload: { reason: "Out of tape" }, answer: "On my way", answeredAt: iso("14:01"), hasPhoto: false }],
      [{ text: "Running late", to: "Everyone", sentAt: iso("14:05"), important: true, seen: 7, acknowledged: 5, reached: 10 }],
      format,
    );
    expect(rows.map((r) => r[0])).toEqual(["Task", "Task", "Task", "Cue", "Help", "Announcement"]);
    expect(rows[0]![5]).toMatch(/^Done/);
    expect(rows[3]![5]).toMatch(/^Called/);
    expect(rows[5]![5]).toBe("Seen by 7 of 10; OK from 5");
  });
});
