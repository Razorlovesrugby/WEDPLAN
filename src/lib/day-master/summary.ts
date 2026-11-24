/**
 * The after-the-day summary (spec 55 §7): every item with who did it and when,
 * what was handed back or never done, every help request and its answer, every
 * note and photo, every announcement with who saw it, when each cue was really
 * called. Pure, so the page and the CSV agree.
 */

export type SummaryItem = {
  id: string;
  title: string;
  startsAt: string;
  isCue: boolean;
  cueCalledAt: string | null;
  assignees: { name: string; state: "todo" | "started" | "done" | "handed_back"; doneAt: string | null; startedAt: string | null; lateMinutes: number | null; handedBackReason: string | null }[];
};

export type SummaryActivity = {
  id: string;
  kind: string;
  who: string;
  itemTitle: string | null;
  tappedAt: string;
  payload: Record<string, unknown>;
  answer: string | null;
  answeredAt: string | null;
  hasPhoto: boolean;
};

export type SummaryAnnouncement = { text: string; to: string; sentAt: string; important: boolean; seen: number; acknowledged: number; reached: number };

export const SUMMARY_CSV_HEADER = ["Type", "Time", "Item", "Who", "Detail", "Result"] as const;

export type SummaryProblems = {
  neverDone: { item: string; who: string }[];
  handedBack: { item: string; who: string; reason: string | null }[];
};

/** What was handed back, or never done, once the day is over. */
export function summaryProblems(items: readonly SummaryItem[]): SummaryProblems {
  const neverDone: SummaryProblems["neverDone"] = [];
  const handedBack: SummaryProblems["handedBack"] = [];
  for (const item of items) {
    for (const a of item.assignees) {
      if (a.state === "handed_back") handedBack.push({ item: item.title, who: a.name, reason: a.handedBackReason });
      else if (a.state !== "done") neverDone.push({ item: item.title, who: a.name });
    }
  }
  return { neverDone, handedBack };
}

const STATE: Record<string, string> = { todo: "Never started", started: "Started, not finished", done: "Done", handed_back: "Handed back" };

export function summaryCsvRows(
  items: readonly SummaryItem[],
  activity: readonly SummaryActivity[],
  announcements: readonly SummaryAnnouncement[],
  format: (iso: string) => string,
): string[][] {
  const rows: string[][] = [];
  for (const item of items) {
    if (item.assignees.length === 0) rows.push(["Task", format(item.startsAt), item.title, "", "", "Nobody was assigned"]);
    for (const a of item.assignees) {
      const detail = [a.startedAt ? `started ${format(a.startedAt)}` : "", a.lateMinutes ? `late +${a.lateMinutes}` : "", a.handedBackReason ? `handed back: ${a.handedBackReason}` : ""].filter(Boolean).join("; ");
      rows.push(["Task", format(item.startsAt), item.title, a.name, detail, a.state === "done" && a.doneAt ? `Done ${format(a.doneAt)}` : (STATE[a.state] ?? a.state)]);
    }
    if (item.isCue) rows.push(["Cue", format(item.startsAt), item.title, "", "", item.cueCalledAt ? `Called ${format(item.cueCalledAt)}` : "Never called"]);
  }
  for (const a of activity) {
    if (a.kind === "help") rows.push(["Help", format(a.tappedAt), a.itemTitle ?? "", a.who, String((a.payload as { reason?: string }).reason ?? ""), a.answer ? `Answered: ${a.answer}` : "Not answered"]);
    else if (a.kind === "note" || a.kind === "question") rows.push([a.kind === "note" ? "Note" : "Question", format(a.tappedAt), a.itemTitle ?? "", a.who, String((a.payload as { text?: string }).text ?? ""), a.answer ? `Answered: ${a.answer}` : a.hasPhoto ? "With a photo" : ""]);
  }
  for (const n of announcements) rows.push(["Announcement", format(n.sentAt), "", n.to, n.text, `Seen by ${n.seen} of ${n.reached}${n.important ? `; OK from ${n.acknowledged}` : ""}`]);
  return rows;
}
