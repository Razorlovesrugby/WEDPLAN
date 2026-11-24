import { describe, expect, it } from "vitest";
import { MAX_QUEUE, afterFlush, enqueue, flushQueue, parseQueue, serialiseQueue, waitingLabel, type QueuedOp } from "./offline-queue";

const op = (id: string): QueuedOp => ({ id, name: "setTaskState", args: ["item", "done"], tappedAt: "2027-03-06T01:00:00Z", label: id });

describe("queue storage", () => {
  it("round-trips", () => {
    const q = [op("a"), op("b")];
    expect(parseQueue(serialiseQueue(q))).toEqual(q);
  });
  it("survives junk", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("{not json")).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue(JSON.stringify([op("a"), { id: 1 }, null]))).toEqual([op("a")]);
  });
  it("keeps the newest past the cap", () => {
    let q: QueuedOp[] = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) q = enqueue(q, op(String(i)));
    expect(q).toHaveLength(MAX_QUEUE);
    expect(q.at(-1)!.id).toBe(String(MAX_QUEUE + 4));
    expect(q[0]!.id).toBe("5");
  });
});

describe("flushQueue", () => {
  it("sends in order and empties the queue", async () => {
    const seen: string[] = [];
    const result = await flushQueue([op("a"), op("b"), op("c")], async (o) => {
      seen.push(o.id);
      return { kind: "sent" };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ sent: 3, rejected: [], remaining: [] });
  });
  it("stops at the first offline result and keeps it and what follows", async () => {
    const result = await flushQueue([op("a"), op("b"), op("c")], async (o) => (o.id === "b" ? { kind: "offline" } : { kind: "sent" }));
    expect(result.sent).toBe(1);
    expect(result.remaining.map((o) => o.id)).toEqual(["b", "c"]);
  });
  it("drops a rejected tap, reports it, and carries on", async () => {
    const result = await flushQueue([op("a"), op("b")], async (o) => (o.id === "a" ? { kind: "rejected", error: "No" } : { kind: "sent" }));
    expect(result.sent).toBe(1);
    expect(result.rejected).toEqual([{ op: op("a"), error: "No" }]);
    expect(result.remaining).toEqual([]);
  });
});

describe("waitingLabel", () => {
  it("pluralises", () => {
    expect(waitingLabel(1)).toBe("Offline · 1 change waiting to send");
    expect(waitingLabel(3)).toBe("Offline · 3 changes waiting to send");
  });
});

describe("afterFlush", () => {
  it("keeps a tap made while the flush was running", () => {
    const attempted = [op("a")];
    const stored = [op("a"), op("b")];
    expect(afterFlush(stored, attempted, []).map((o) => o.id)).toEqual(["b"]);
  });
  it("keeps what the flush left behind", () => {
    const attempted = [op("a"), op("b")];
    expect(afterFlush([op("a"), op("b"), op("c")], attempted, [op("b")]).map((o) => o.id)).toEqual(["b", "c"]);
  });
});
