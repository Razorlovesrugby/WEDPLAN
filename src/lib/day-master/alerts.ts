import type { TaskState } from "@/lib/day-links/state";

/**
 * Which alerts are open on the master (spec 55 §5.1), from the tasks, each
 * assignee's state and the activity rows. Pure and tested. An alert stays until
 * it is dealt with: answered, reassigned, started, or dismissed (an
 * `alert_dismissed` activity row, whose `key` is the alert's key).
 */

export type MasterItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  critical: boolean;
};

export type MasterAssignee = {
  rowId: string;
  itemId: string;
  name: string;
  state: TaskState;
  lateMinutes: number | null;
  handedBackReason: string | null;
};

export type MasterActivity = {
  id: string;
  kind: string;
  itemId: string | null;
  who: string;
  payload: Record<string, unknown>;
  tappedAt: string;
  answeredAt: string | null;
};

export type AlertKind = "help" | "handed_back" | "not_started" | "late";

export type Alert = {
  key: string;
  kind: AlertKind;
  /** Red for help and a critical task not started; amber for the rest. */
  severity: "red" | "amber";
  itemId: string | null;
  title: string;
  detail: string;
  who: string | null;
  since: string;
  /** Waiting too long: help unanswered 3 minutes, or a hand-back nobody has taken 15 minutes before the start. */
  escalated: boolean;
  activityId: string | null;
  assigneeRowId: string | null;
};

export const NOT_STARTED_GRACE_MINUTES = 5;
export const HELP_ESCALATE_MINUTES = 3;
export const HANDBACK_ESCALATE_BEFORE_MINUTES = 15;
const MIN = 60_000;

export function openAlerts(input: {
  items: readonly MasterItem[];
  assignees: readonly MasterAssignee[];
  activity: readonly MasterActivity[];
  dismissed: ReadonlySet<string>;
  now: Date;
}): Alert[] {
  const { items, assignees, activity, dismissed, now } = input;
  const t = now.getTime();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const out: Alert[] = [];

  // Help: unanswered, not dismissed.
  for (const a of activity) {
    if (a.kind !== "help" || a.answeredAt) continue;
    const key = `help:${a.id}`;
    if (dismissed.has(key)) continue;
    const item = a.itemId ? itemById.get(a.itemId) : undefined;
    const reason = String((a.payload as { reason?: string }).reason ?? "Help");
    const text = String((a.payload as { text?: string }).text ?? "");
    out.push({
      key,
      kind: "help",
      severity: "red",
      itemId: a.itemId,
      title: item ? `${a.who} needs help: ${item.title}` : `${a.who} needs help`,
      detail: text ? `${reason} · ${text}` : reason,
      who: a.who,
      since: a.tappedAt,
      escalated: t - Date.parse(a.tappedAt) >= HELP_ESCALATE_MINUTES * MIN,
      activityId: a.id,
      assigneeRowId: null,
    });
  }

  const byItem = new Map<string, MasterAssignee[]>();
  for (const a of assignees) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);

  for (const [itemId, rows] of byItem) {
    const item = itemById.get(itemId);
    if (!item) continue;
    const start = Date.parse(item.startsAt);
    const end = Date.parse(item.endsAt);

    // Handed back: nobody else is on it.
    for (const row of rows.filter((r) => r.state === "handed_back")) {
      const key = `handback:${itemId}:${row.rowId}`;
      if (dismissed.has(key)) continue;
      const covered = rows.some((r) => r.rowId !== row.rowId && r.state !== "handed_back");
      if (covered) continue;
      out.push({
        key,
        kind: "handed_back",
        severity: "amber",
        itemId,
        title: `${row.name} handed back: ${item.title}`,
        detail: row.handedBackReason ?? "No reason given",
        who: row.name,
        since: item.startsAt,
        escalated: t >= start - HANDBACK_ESCALATE_BEFORE_MINUTES * MIN,
        activityId: null,
        assigneeRowId: row.rowId,
      });
    }

    // Not started: 5 minutes past the start (at the start for a critical task), nobody has tapped Start.
    const active = rows.filter((r) => r.state !== "handed_back");
    const key = `notstarted:${itemId}`;
    const due = start + (item.critical ? 0 : NOT_STARTED_GRACE_MINUTES * MIN);
    if (
      !dismissed.has(key) &&
      active.length > 0 &&
      t >= due &&
      t < end &&
      !active.some((r) => r.state === "started" || r.state === "done")
    ) {
      out.push({
        key,
        kind: "not_started",
        severity: item.critical ? "red" : "amber",
        itemId,
        title: `Not started: ${item.title}`,
        detail: `${active.map((r) => r.name).join(", ")} ${active.length === 1 ? "hasn't" : "haven't"} started`,
        who: null,
        since: new Date(due).toISOString(),
        escalated: false,
        activityId: null,
        assigneeRowId: null,
      });
    }

    // Running late: reported, and still to do or on it.
    for (const row of rows) {
      if (row.lateMinutes === null || (row.state !== "todo" && row.state !== "started")) continue;
      const lateKey = `late:${row.rowId}:${row.lateMinutes}`;
      if (dismissed.has(lateKey)) continue;
      const reported = activity.filter((a) => a.kind === "late" && a.itemId === itemId && a.who === row.name).map((a) => a.tappedAt).sort().at(-1);
      out.push({
        key: lateKey,
        kind: "late",
        severity: "amber",
        itemId,
        title: `${row.name} running late: ${item.title}`,
        detail: `+${row.lateMinutes} min`,
        who: row.name,
        since: reported ?? item.startsAt,
        escalated: false,
        activityId: null,
        assigneeRowId: row.rowId,
      });
    }
  }

  // Escalated first, then red before amber, then the newest.
  return out.sort(
    (a, b) =>
      Number(b.escalated) - Number(a.escalated) ||
      (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1) ||
      Date.parse(b.since) - Date.parse(a.since),
  );
}

/** Minutes an alert has been waiting, for "Waiting 3 min". */
export function waitingMinutes(since: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / MIN));
}
