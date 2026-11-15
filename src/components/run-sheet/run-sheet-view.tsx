"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RowMenu } from "@/components/ui/row-menu";
import { formatTime, pluralise } from "@/lib/format";
import { utcToZonedInput } from "@/lib/timezone";
import {
  axisRange,
  dayKeyOf,
  dayWindow,
  daysWithItems,
  defaultDay,
  packLanes,
  type RunSheetAssignee,
  type RunSheetItem,
} from "@/lib/run-sheet";
import { deleteRunSheetItem, duplicateRunSheetItem, moveRunSheetItem } from "@/server/actions/run-sheet";
import { RunSheetItemEditor } from "./item-editor";

const PX_PER_MINUTE = 1.2;
const STORAGE_KEY = "wedplan.run-sheet.view";
const UNASSIGNED = "unassigned";

type EventOption = { id: string; name: string };

export function RunSheetView({
  items,
  options,
  events,
  timeZone,
  weddingDate,
  canAddPeople,
}: {
  items: RunSheetItem[];
  options: RunSheetAssignee[];
  events: EventOption[];
  timeZone: string;
  weddingDate: string | null;
  canAddPeople: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [filter, setFilter] = useState<string>("");
  const [editor, setEditor] = useState<{ item: RunSheetItem | null; startsAt?: string } | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "list") setView("list");
    } catch {
      /* storage can be unavailable; the default is fine */
    }
  }, []);
  function chooseView(next: "timeline" | "list") {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const days = useMemo(() => daysWithItems(items.map((i) => ({ id: i.id, startsAt: i.starts_at, endsAt: i.ends_at })), timeZone), [items, timeZone]);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : defaultDay(days, weddingDate);
  const dayItems = useMemo(
    () => (day ? items.filter((i) => dayKeyOf(i.starts_at, timeZone) === day) : []),
    [items, day, timeZone],
  );

  const matches = (item: RunSheetItem) =>
    !filter
      ? true
      : filter === UNASSIGNED
        ? item.assignees.length === 0
        : item.assignees.some((a) => a.key === filter);

  const usedPeople = useMemo(() => {
    const seen = new Map<string, RunSheetAssignee>();
    for (const item of items) for (const a of item.assignees) seen.set(a.key, a);
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      else router.refresh();
    });
  }

  function menuFor(item: RunSheetItem) {
    return [
      { label: "Edit", onSelect: () => setEditor({ item }) },
      { label: "Earlier by 15 minutes", onSelect: () => run(() => moveRunSheetItem(item.id, -15)) },
      { label: "Later by 15 minutes", onSelect: () => run(() => moveRunSheetItem(item.id, 15)) },
      { label: "Duplicate", onSelect: () => run(() => duplicateRunSheetItem(item.id)) },
      {
        label: "Delete",
        onSelect: () => {
          if (window.confirm(`Delete "${item.title}"?`)) run(() => deleteRunSheetItem(item.id));
        },
      },
    ];
  }

  const conflicts = items.filter((i) => i.conflict).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-md border border-line text-sm">
          {(["timeline", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => chooseView(v)}
              className={`px-3 py-1.5 ${view === v ? "bg-ink text-white" : "bg-white text-ink"}`}
            >
              {v === "timeline" ? "Timeline" : "List"}
            </button>
          ))}
        </div>

        {days.length > 1 && view === "timeline" ? (
          <select
            aria-label="Day"
            className="field w-auto"
            value={day ?? ""}
            onChange={(e) => setChosenDay(e.target.value)}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </option>
            ))}
          </select>
        ) : null}

        <select aria-label="Show" className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Everyone</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {usedPeople.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        <button type="button" className="btn-primary ml-auto" onClick={() => setEditor({ item: null })}>
          Add item
        </button>
      </div>

      {conflicts > 0 ? (
        <p className="text-sm text-muted">
          {pluralise(conflicts, "item")} overlap with something else the same person is doing. Both are kept.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {pending ? <p className="text-xs text-muted">Saving…</p> : null}

      {items.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          Nothing on the run sheet yet. Add the first item and give it a start and an end.
        </p>
      ) : view === "list" ? (
        <ListView items={items} timeZone={timeZone} matches={matches} menuFor={menuFor} onOpen={(item) => setEditor({ item })} />
      ) : day ? (
        <Timeline
          day={day}
          items={dayItems}
          timeZone={timeZone}
          matches={matches}
          menuFor={menuFor}
          onOpen={(item) => setEditor({ item })}
          onCreate={(startsAt) => setEditor({ item: null, startsAt })}
        />
      ) : null}

      <RunSheetItemEditor
        open={editor !== null}
        onClose={() => setEditor(null)}
        item={editor?.item ?? null}
        initialStartsAt={editor?.startsAt}
        allItems={items}
        options={options}
        events={events}
        timeZone={timeZone}
        canAddPeople={canAddPeople}
      />
    </div>
  );
}

function Who({ item }: { item: RunSheetItem }) {
  return item.assignees.length ? <>{item.assignees.map((a) => a.label).join(", ")}</> : <>Unassigned</>;
}

function ListView({
  items,
  timeZone,
  matches,
  menuFor,
  onOpen,
}: {
  items: RunSheetItem[];
  timeZone: string;
  matches: (i: RunSheetItem) => boolean;
  menuFor: (i: RunSheetItem) => { label: string; onSelect: () => void }[];
  onOpen: (i: RunSheetItem) => void;
}) {
  const shown = items.filter(matches);
  if (shown.length === 0) return <p className="text-sm text-muted">Nothing matches that filter.</p>;
  let lastDay = "";
  return (
    <ul className="card divide-y divide-line">
      {shown.map((item) => {
        const d = dayKeyOf(item.starts_at, timeZone);
        const heading = d !== lastDay;
        lastDay = d;
        return (
          <li key={item.id}>
            {heading ? (
              <div className="bg-paper px-4 py-1 text-xs text-muted">
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-NZ", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                })}
              </div>
            ) : null}
            <div className="flex items-center gap-2 px-4 py-2">
              <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
                <span className="text-sm tabular-nums text-muted">
                  {formatTime(item.starts_at, timeZone)} to {formatTime(item.ends_at, timeZone)}
                  {item.time_estimated ? " (estimated)" : ""}
                </span>
                <span className="block truncate">
                  {item.title}
                  {item.conflict ? <span className="ml-2 text-xs text-amber-700">Overlaps</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  <Who item={item} />
                </span>
              </button>
              <RowMenu label={`Actions for ${item.title}`} items={menuFor(item)} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Timeline({
  day,
  items,
  timeZone,
  matches,
  menuFor,
  onOpen,
  onCreate,
}: {
  day: string;
  items: RunSheetItem[];
  timeZone: string;
  matches: (i: RunSheetItem) => boolean;
  menuFor: (i: RunSheetItem) => { label: string; onSelect: () => void }[];
  onOpen: (i: RunSheetItem) => void;
  onCreate: (startsAtLocal: string) => void;
}) {
  const range = useMemo(() => {
    const fromItems = axisRange(items.map((i) => ({ id: i.id, startsAt: i.starts_at, endsAt: i.ends_at })));
    if (fromItems) return fromItems;
    const w = dayWindow(day, timeZone);
    return { startMs: w.startMs, endMs: w.startMs + 12 * 3_600_000 };
  }, [items, day, timeZone]);

  const lanes = useMemo(
    () => packLanes(items.map((i) => ({ id: i.id, startsAt: i.starts_at, endsAt: i.ends_at }))),
    [items],
  );

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const height = ((range.endMs - range.startMs) / 60_000) * PX_PER_MINUTE;
  const hours: number[] = [];
  for (let t = range.startMs; t < range.endMs; t += 3_600_000) hours.push(t);
  const y = (ms: number) => ((ms - range.startMs) / 60_000) * PX_PER_MINUTE;

  function tapEmpty(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = Math.round((event.clientY - rect.top) / PX_PER_MINUTE / 15) * 15;
    const ms = range.startMs + minutes * 60_000;
    onCreate(utcToZonedInput(new Date(ms).toISOString(), timeZone));
  }

  return (
    <div className="card overflow-x-auto p-2">
      <div className="relative ml-14 min-w-[320px]" style={{ height }} onClick={tapEmpty}>
        {hours.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute left-0 right-0 border-t border-line"
            style={{ top: y(t) }}
          >
            <span className="absolute -left-14 -top-2 w-12 text-right text-xs tabular-nums text-muted">
              {formatTime(new Date(t), timeZone)}
            </span>
          </div>
        ))}

        {now !== null && now >= range.startMs && now <= range.endMs ? (
          <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500" style={{ top: y(now) }} />
        ) : null}

        {items.map((item) => {
          const place = lanes.get(item.id) ?? { lane: 0, lanes: 1, span: 1 };
          const top = y(Date.parse(item.starts_at));
          const h = Math.max(((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / 60_000) * PX_PER_MINUTE, 28);
          const dim = !matches(item);
          return (
            <div
              key={item.id}
              className={`absolute overflow-hidden rounded border bg-white px-2 py-1 text-xs shadow-sm ${
                item.conflict ? "border-amber-500" : "border-line"
              } ${dim ? "opacity-30" : ""}`}
              style={{
                top,
                height: h,
                left: `${(place.lane / place.lanes) * 100}%`,
                width: `calc(${(place.span / place.lanes) * 100}% - 4px)`,
              }}
            >
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate tabular-nums text-muted">
                    {formatTime(item.starts_at, timeZone)} to {formatTime(item.ends_at, timeZone)}
                    {item.time_estimated ? " est." : ""}
                  </span>
                  {h > 60 ? (
                    <span className="block truncate text-muted">
                      <Who item={item} />
                    </span>
                  ) : null}
                </button>
                <RowMenu label={`Actions for ${item.title}`} items={menuFor(item)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
