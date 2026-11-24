"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import { axisRange, type RunSheetAssignee, type RunSheetItem } from "@/lib/run-sheet";
import { assignToItems } from "@/server/actions/day-planning";
import { makeDayLink } from "@/server/actions/day-links";

const STATE_LABEL = { made: "Link made", opened: "Link opened" } as const;

/**
 * Spec 54 §10.3: one row per person with a task, their tasks along the day,
 * so gaps and clashes show at a glance, with their link state. Unassigned
 * tasks sit at the top while there are any.
 */
export function PeopleView({
  items,
  options,
  linkStates,
  timeZone,
  onOpen,
}: {
  items: RunSheetItem[];
  options: RunSheetAssignee[];
  linkStates: Record<string, "made" | "opened">;
  timeZone: string;
  onOpen: (item: RunSheetItem) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [who, setWho] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const range = axisRange(items.map((i) => ({ id: i.id, startsAt: i.starts_at, endsAt: i.ends_at })));
  const span = range ? range.endMs - range.startMs : 1;
  const place = (item: RunSheetItem) => ({
    left: `${((Date.parse(item.starts_at) - range!.startMs) / span) * 100}%`,
    width: `${Math.max(2, ((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / span) * 100)}%`,
  });

  const unassigned = items.filter((i) => i.assignees.length === 0);
  const people = new Map<string, { who: RunSheetAssignee; tasks: RunSheetItem[] }>();
  for (const item of items) {
    for (const a of item.assignees) {
      const row = people.get(a.key) ?? { who: a, tasks: [] };
      row.tasks.push(item);
      people.set(a.key, row);
    }
  }
  const rows = [...people.values()].sort((a, b) => a.who.label.localeCompare(b.who.label));
  const canLink = (a: RunSheetAssignee) => a.type !== "collaborator";
  const assignable = options.filter(canLink);

  /** Makes their link (only when they have none) and copies it. Copying an existing one is on the Day links screen. */
  function link(a: RunSheetAssignee) {
    if (a.type === "collaborator" || linkStates[a.key]) return;
    setError(null);
    startTransition(async () => {
      const made = await makeDayLink({ type: a.type as "vendor" | "guest" | "person", id: a.id });
      if (!made.ok) return setError(made.error);
      try {
        await navigator.clipboard.writeText(made.data.url);
        setMessage(`Made and copied ${a.label}'s link`);
      } catch {
        window.prompt("Copy this link", made.data.url);
      }
      router.refresh();
    });
  }

  function assignMany() {
    const person = assignable.find((o) => o.key === who);
    if (!person || picked.size === 0) return;
    startTransition(async () => {
      const r = await assignToItems([...picked], { type: person.type as "vendor" | "guest" | "person", id: person.id });
      if (!r.ok) return setError(r.error);
      setMessage(`${person.label} is on ${r.data.added} more ${r.data.added === 1 ? "task" : "tasks"}`);
      setAssigning(false);
      setPicked(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
      <div>
        <button type="button" className="btn" onClick={() => setAssigning((v) => !v)}>
          Assign someone to several tasks…
        </button>
      </div>
      {assigning ? (
        <div className="card space-y-2 p-3 text-sm">
          <select className="field" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who">
            <option value="">Who?</option>
            {assignable.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <div className="max-h-48 overflow-y-auto">
            {items.map((i) => (
              <label key={i.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={picked.has(i.id)}
                  onChange={() => setPicked((was) => { const next = new Set(was); if (!next.delete(i.id)) next.add(i.id); return next; })}
                />
                {formatTime(i.starts_at, timeZone)} {i.title}
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary" disabled={pending || !who || picked.size === 0} onClick={assignMany}>
            Assign
          </button>
        </div>
      ) : null}

      {unassigned.length > 0 ? (
        <div className="card p-3">
          <div className="text-sm font-medium">Unassigned tasks ({unassigned.length})</div>
          <ul className="mt-1 space-y-1 text-sm">
            {unassigned.map((i) => (
              <li key={i.id}>
                <button type="button" className="underline" onClick={() => onOpen(i)}>
                  {formatTime(i.starts_at, timeZone)} {i.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? <p className="card p-6 text-center text-sm text-muted">Nobody is on a task yet.</p> : null}
      {range
        ? rows.map(({ who: person, tasks }) => (
            <div key={person.key} className="card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{person.label}</span>
                <span className="text-xs text-muted">
                  {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                  {canLink(person) ? ` · ${linkStates[person.key] ? STATE_LABEL[linkStates[person.key]!] : "No link"}` : ""}
                  {canLink(person) && !linkStates[person.key] ? (
                    <>
                      {" "}
                      <button type="button" className="underline" disabled={pending} onClick={() => link(person)}>
                        Make their link
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
              <div className="relative mt-2 h-7 rounded bg-black/5" aria-label={`${person.label}'s day`}>
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={`${formatTime(t.starts_at, timeZone)} ${t.title}`}
                    onClick={() => onOpen(t)}
                    style={place(t)}
                    className={`absolute top-0.5 h-6 overflow-hidden rounded px-1 text-left text-[11px] leading-6 text-white ${t.conflict ? "bg-red-700" : "bg-ink"}`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          ))
        : null}
    </div>
  );
}
