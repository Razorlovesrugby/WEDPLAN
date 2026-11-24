/**
 * The device queue for taps made without a signal (spec 54 §6.8).
 *
 * Writes are kept in order, with the time of the tap, and sent when the
 * connection returns. Pure: storage and sending are passed in, so the rules
 * (order, what is retried, what is dropped) are tested without a browser.
 */

export type QueuedOp = {
  /** Unique per tap, so a replay is recognisable. */
  id: string;
  /** The name of the day-link action to call. */
  name: string;
  /** Its arguments after the token, JSON-serialisable. */
  args: unknown[];
  /** When the person tapped, on their own clock. */
  tappedAt: string;
  /** What to call it in "3 changes waiting to send". */
  label: string;
};

export const MAX_QUEUE = 200;

export function parseQueue(raw: string | null): QueuedOp[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (op): op is QueuedOp =>
        typeof op === "object" &&
        op !== null &&
        typeof (op as QueuedOp).id === "string" &&
        typeof (op as QueuedOp).name === "string" &&
        Array.isArray((op as QueuedOp).args) &&
        typeof (op as QueuedOp).tappedAt === "string" &&
        typeof (op as QueuedOp).label === "string",
    );
  } catch {
    return [];
  }
}

export function serialiseQueue(queue: readonly QueuedOp[]): string {
  return JSON.stringify(queue);
}

/** Appends a tap. The oldest are dropped past the cap rather than refusing the newest. */
export function enqueue(queue: readonly QueuedOp[], op: QueuedOp): QueuedOp[] {
  return [...queue, op].slice(-MAX_QUEUE);
}

export type SendOutcome =
  | { kind: "sent" }
  /** The server answered "no" (a rule, not a network problem): retrying won't help. */
  | { kind: "rejected"; error: string }
  /** No connection or a server error: keep it and try again later. */
  | { kind: "offline" };

export type FlushResult = {
  sent: number;
  rejected: { op: QueuedOp; error: string }[];
  remaining: QueuedOp[];
};

/**
 * Sends the queue in order. Stops at the first offline result, so order is
 * never broken, and keeps that tap and everything after it. A rejected tap is
 * reported and dropped, and the queue carries on.
 */
export async function flushQueue(
  queue: readonly QueuedOp[],
  send: (op: QueuedOp) => Promise<SendOutcome>,
): Promise<FlushResult> {
  const rejected: FlushResult["rejected"] = [];
  let sent = 0;
  for (const [index, op] of queue.entries()) {
    const outcome = await send(op);
    if (outcome.kind === "offline") return { sent, rejected, remaining: queue.slice(index) };
    if (outcome.kind === "rejected") rejected.push({ op, error: outcome.error });
    else sent += 1;
  }
  return { sent, rejected, remaining: [] };
}

/**
 * The queue after a flush, merged with whatever was added while it ran: only
 * the taps the flush finished with (sent or rejected) are removed from the
 * stored queue, so a tap made mid-flush is never lost.
 */
export function afterFlush(stored: readonly QueuedOp[], attempted: readonly QueuedOp[], remaining: readonly QueuedOp[]): QueuedOp[] {
  const keep = new Set(remaining.map((op) => op.id));
  const finished = new Set(attempted.filter((op) => !keep.has(op.id)).map((op) => op.id));
  return stored.filter((op) => !finished.has(op.id));
}

export function waitingLabel(count: number): string {
  return count === 1 ? "Offline · 1 change waiting to send" : `Offline · ${count} changes waiting to send`;
}
