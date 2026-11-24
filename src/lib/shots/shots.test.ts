import { describe, expect, it } from "vitest";
import { callBacks, callUp, canGo, suggestOrder, type OrderShot } from "./order";
import { suggestFormals, type FamilySide, type Who } from "./formals";
import { behindSchedule, missedShots, nextShot, slotFit, type ProgressShot } from "./progress";

const shot = (id: string, ...people: string[]): OrderShot => ({ id, people });
const couple = new Set(["c1", "c2"]);

describe("callBacks", () => {
  it("counts someone who steps out and returns", () => {
    expect(callBacks([shot("a", "x"), shot("b", "y"), shot("c", "x")])).toBe(1);
  });
  it("counts nobody when people stay in one run", () => {
    expect(callBacks([shot("a", "x", "y"), shot("b", "x"), shot("c", "z")])).toBe(0);
  });
  it("counts each gap once", () => {
    expect(callBacks([shot("a", "x"), shot("b"), shot("c", "x"), shot("d"), shot("e", "x")])).toBe(2);
  });
  it("ignores the couple", () => {
    expect(callBacks([shot("a", "c1"), shot("b", "y"), shot("c", "c1")], couple)).toBe(0);
  });
});

describe("callUp and canGo", () => {
  const order = [shot("a", "nan", "mum"), shot("b", "mum", "dad"), shot("c", "dad", "kid")];
  it("calls up whoever is new to the shot", () => {
    expect(callUp(order, 0)).toEqual(["nan", "mum"]);
    expect(callUp(order, 1)).toEqual(["dad"]);
  });
  it("lets go whoever was in the last shot and is needed no more", () => {
    expect(canGo(order, 1)).toEqual(["nan"]);
    expect(canGo(order, 2)).toEqual(["mum"]);
  });
  it("does not let go someone needed later", () => {
    expect(canGo([shot("a", "x"), shot("b", "y"), shot("c", "x")], 1)).toEqual([]);
  });
});

describe("suggestOrder", () => {
  it("removes a call-back by moving a shot", () => {
    const shots = [shot("a", "x", "y"), shot("b", "z"), shot("c", "x")];
    const result = suggestOrder(shots);
    expect(result.before).toBe(1);
    expect(result.callBacks).toBe(0);
    expect(result.unchanged).toBe(false);
  });
  it("breaks ties by shooting bigger groups first", () => {
    const shots = [shot("small", "a"), shot("big", "b", "c", "d")];
    expect(suggestOrder(shots).order).toEqual(["big", "small"]);
  });
  it("keeps the couple's order when it is already the best", () => {
    const shots = [shot("a", "x", "y"), shot("b", "y"), shot("c", "z")];
    const result = suggestOrder(shots);
    expect(result.unchanged).toBe(true);
    expect(result.order).toEqual(["a", "b", "c"]);
  });
  it("handles more than eight shots by greedy search and swaps", () => {
    const shots = Array.from({ length: 10 }, (_, i) => shot(`s${i}`, `p${i % 3}`, `q${i % 4}`));
    const result = suggestOrder(shots);
    expect(result.order).toHaveLength(10);
    expect(new Set(result.order).size).toBe(10);
    expect(result.callBacks).toBeLessThanOrEqual(result.before);
  });
  it("ignores the couple when searching", () => {
    const shots = [shot("a", "c1", "x"), shot("b", "c1", "y"), shot("c", "x")];
    expect(suggestOrder(shots, couple).callBacks).toBe(0);
  });
});

describe("suggestFormals", () => {
  const g = (id: string): Who => ({ kind: "guest", id });
  const sides: FamilySide[] = [
    { label: "Aroha's", partner: g("aroha"), parents: [g("mum"), g("dad")], siblings: [g("sis")], grandparents: [g("nan")], stepParents: [g("step")], parentNames: ["Mum", "Dad"], stepParentNames: ["Rob"] },
    { label: "Sam's", partner: g("sam"), parents: [g("smum")], siblings: [], grandparents: [], stepParents: [] },
  ];
  const proposals = suggestFormals(sides, [g("aroha"), g("sam")]);
  const keys = proposals.map((p) => p.key);

  it("proposes the standard formals", () => {
    expect(keys).toContain("everyone");
    expect(keys).toContain("family-0");
    expect(keys).toContain("grandparents");
    expect(keys).toContain("parents-siblings-0");
    expect(keys).toContain("parents-0");
  });
  it("proposes each partner with each parent, and the step-parent on their own", () => {
    expect(keys).toContain("partner-parent-0-0");
    expect(keys).toContain("partner-parent-0-1");
    expect(keys).toContain("partner-step-0-0");
    const step = proposals.find((p) => p.key === "partner-step-0-0")!;
    expect(step.title).toBe("Aroha with Rob");
  });
  it("never merges the step-parent into the parents' groups", () => {
    const parents = proposals.find((p) => p.key === "parents-0")!;
    expect(parents.people).not.toContainEqual(g("step"));
  });
  it("skips groups with nobody in them", () => {
    expect(keys).not.toContain("parents-siblings-1");
    expect(keys).not.toContain("grandparents-1");
  });
  it("lists nobody twice", () => {
    const everyone = proposals.find((p) => p.key === "everyone")!;
    const ids = everyone.people.map((w) => (w.kind === "role" ? w.role : w.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("progress", () => {
  const s = (id: string, status: ProgressShot["status"], minutes = 2, kind = "group"): ProgressShot => ({ id, kind, minutes, status });
  const start = "2027-06-12T15:00:00Z";
  const end = "2027-06-12T15:45:00Z";
  it("fits a slot, counting changeover for groups", () => {
    const fit = slotFit([s("a", "todo"), s("b", "todo"), s("c", "todo", 0, "moment")], start, end)!;
    expect(fit).toEqual({ groups: 2, minutes: 6, slotMinutes: 45, over: false });
  });
  it("is over when the shots don't fit", () => {
    const many = Array.from({ length: 20 }, (_, i) => s(String(i), "todo"));
    expect(slotFit(many, start, end)!.over).toBe(true);
  });
  it("has no fit without a slot", () => {
    expect(slotFit([s("a", "todo")], null, null)).toBeNull();
  });
  it("calls skipped shots missed, and unfinished ones once the section has ended", () => {
    const shots = [s("a", "taken"), s("b", "skipped"), s("c", "todo"), s("d", "later")];
    expect(missedShots(shots, end, new Date("2027-06-12T15:30:00Z")).map((x) => x.id)).toEqual(["b"]);
    expect(missedShots(shots, end, new Date("2027-06-12T16:00:00Z")).map((x) => x.id)).toEqual(["b", "c", "d"]);
  });
  it("is behind when what's left won't fit the time left", () => {
    const shots = [s("a", "taken"), ...Array.from({ length: 10 }, (_, i) => s(`t${i}`, "todo"))];
    expect(behindSchedule(shots, start, end, new Date("2027-06-12T15:30:00Z"))).toBe(true);
    expect(behindSchedule([s("a", "todo")], start, end, new Date("2027-06-12T15:10:00Z"))).toBe(false);
  });
  it("is not behind before the slot or with nothing left", () => {
    expect(behindSchedule([s("a", "todo")], start, end, new Date("2027-06-12T14:00:00Z"))).toBe(false);
    expect(behindSchedule([s("a", "taken")], start, end, new Date("2027-06-12T16:00:00Z"))).toBe(false);
  });
  it("picks the next shot: to do first, then put off", () => {
    expect(nextShot([s("a", "taken"), s("b", "later"), s("c", "todo")])?.id).toBe("c");
    expect(nextShot([s("a", "taken"), s("b", "later")])?.id).toBe("b");
    expect(nextShot([s("a", "taken")])).toBeNull();
  });
});
