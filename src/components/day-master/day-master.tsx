"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  announce,
  answerAlert,
  dismissAlert,
  markStarted,
  reassignTask,
  setDayAlerts,
  setDayLead,
  shiftSchedule,
  takeTask,
} from "@/server/actions/day-master";
import { callCue, resetCue } from "@/server/actions/day-planning";
import { openAlerts, waitingMinutes, type Alert } from "@/lib/day-master/alerts";
import { describeShift, previewShift, type ShiftScope } from "@/lib/day-master/shift";
import { readiness, readinessSummary } from "@/lib/day-master/readiness";
import { SUMMARY_CSV_HEADER, summaryCsvRows, summaryProblems, type SummaryActivity, type SummaryItem } from "@/lib/day-master/summary";
import { dayKeyOf } from "@/lib/run-sheet";
import { cueState, countdown } from "@/lib/day-links/my-day";
import { csvDocument } from "@/lib/csv";
import type { MasterData, MasterFeedRow, MasterItemFull } from "@/server/queries/day-master";

type Mode = "before" | "live" | "after";
const QUICK_ANSWERS = ["On my way", "Sorting it", "Call me"] as const;
const STATE_WORD = { todo: "To do", started: "On it", done: "Done", handed_back: "Handed back" } as const;
const POLL_MS = 10_000;

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* sound is a nicety */
  }
}

export function DayMaster({ data, timeZone, weddingName }: { data: MasterData; timeZone: string; weddingName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(data.mode);
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(true);
  const [shifting, setShifting] = useState<{ item: MasterItemFull; lateMinutes?: number; alertKey?: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [announcing, setAnnouncing] = useState<string | null>(null);

  // Poll every 10 seconds, and on coming back to the tab (§8).
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 5000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, POLL_MS);
    const visible = () => document.visibilityState === "visible" && (setNow(new Date()), navigator.onLine && router.refresh());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [router]);

  const loaded = useMemo(() => new Date(data.loadedAt), [data.loadedAt]);
  const ago = Math.max(0, Math.round((now.getTime() - loaded.getTime()) / 1000));
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

  const alerts = useMemo(
    () => openAlerts({ items: data.items, assignees: data.assignees, activity: data.activity, dismissed: new Set(data.dismissed), now }),
    [data.items, data.assignees, data.activity, data.dismissed, now],
  );

  // A new Help alert vibrates and sounds for those with alerts on; an escalation sounds for everyone (§5.1, §6).
  const known = useRef<Set<string> | null>(null);
  const escalated = useRef(new Set<string>());
  useEffect(() => {
    if (mode !== "live") return;
    if (known.current === null) {
      known.current = new Set(alerts.map((a) => a.key));
      for (const a of alerts) if (a.escalated) escalated.current.add(a.key);
      return;
    }
    const fresh = alerts.filter((a) => a.kind === "help" && !known.current!.has(a.key));
    if (fresh.length > 0 && data.viewer.alertsOn) {
      navigator.vibrate?.([200, 100, 200]);
      beep();
    }
    const newlyEscalated = alerts.filter((a) => a.escalated && !escalated.current.has(a.key));
    if (newlyEscalated.length > 0) {
      navigator.vibrate?.([300, 100, 300, 100, 300]);
      beep();
    }
    for (const a of alerts) {
      known.current.add(a.key);
      if (a.escalated) escalated.current.add(a.key);
    }
  }, [alerts, data.viewer.alertsOn, mode]);

  function run(work: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    startTransition(async () => {
      const r = await work();
      if (!r.ok) return setError(r.error ?? "That didn't go through");
      if (done) setToast({ text: done });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-2xl">On the day</h1>
        <div role="group" aria-label="Show" className="ml-auto inline-flex overflow-hidden rounded-md border border-line text-sm">
          {(["before", "live", "after"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-ink text-white" : "bg-white text-ink"}`}>
              {m === "before" ? "Readiness" : m === "live" ? "Live" : "Summary"}
            </button>
          ))}
        </div>
      </div>

      <p className={`text-xs ${online ? "text-muted" : "rounded bg-amber-100 px-2 py-1 text-amber-900"}`} role="status">
        {online ? `Updated ${ago} s ago` : `Offline — showing ${fmt(data.loadedAt)}`}
      </p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

      {mode === "before" ? <Readiness data={data} /> : null}
      {mode === "live" ? (
        <Live
          data={data}
          alerts={alerts}
          now={now}
          fmt={fmt}
          timeZone={timeZone}
          pending={pending}
          run={run}
          onShift={(item, lateMinutes, alertKey) => setShifting({ item, lateMinutes, alertKey })}
          onAnnounce={() => setAnnouncing("")}
        />
      ) : null}
      {mode === "after" ? <Summary data={data} fmt={fmt} weddingName={weddingName} /> : null}

      {shifting ? (
        <ShiftSheet
          data={data}
          item={shifting.item}
          initialDelta={shifting.lateMinutes}
          timeZone={timeZone}
          fmt={fmt}
          pending={pending}
          onClose={() => setShifting(null)}
          onShift={(delta, scope, summary, announceText) => {
            const target = shifting;
            setShifting(null);
            startTransition(async () => {
              const r = await shiftSchedule(target.item.id, delta, scope, summary);
              if (!r.ok) return setError(r.error);
              if (target.alertKey) await dismissAlert(target.alertKey, target.item.id);
              setToast({
                text: `Shifted · ${summary}`,
                undo: () =>
                  run(() => shiftSchedule(target.item.id, -delta, scope, `Undid: ${summary}`), "Undone"),
              });
              if (announceText) setAnnouncing(announceText);
              router.refresh();
            });
          }}
        />
      ) : null}
      {announcing !== null ? (
        <AnnounceSheet
          data={data}
          initialText={announcing}
          pending={pending}
          onClose={() => setAnnouncing(null)}
          onSend={(input) => {
            setAnnouncing(null);
            run(() => announce(input), "Announced");
          }}
        />
      ) : null}
      {toast ? (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg md:bottom-6" role="status">
          <span>{toast.text}</span>
          <span className="flex gap-3">
            {toast.undo ? <button className="underline" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button> : null}
            <button aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readiness (§7)
// ---------------------------------------------------------------------------
function Readiness({ data }: { data: MasterData }) {
  const lines = readiness(data.readiness);
  const sum = readinessSummary(lines);
  const unanswered = data.questions.filter((q) => !q.answer);
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">{sum.ready ? "Everything is ready." : `${sum.open} ${sum.open === 1 ? "thing needs" : "things need"} a look before the day.`}</p>
      <ul className="card divide-y divide-line text-sm">
        {lines.map((l) => (
          <li key={l.key} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
            <span>
              <span aria-hidden>{l.ok ? "✓ " : "• "}</span>
              {l.label}
              {l.key !== "confirmed" && l.key !== "contacts" && l.key !== "info" && l.count > 0 ? ` (${l.count})` : ""}
              {l.names.length > 0 ? <span className="block pl-4 text-xs text-muted">{l.names.slice(0, 8).join(", ")}{l.names.length > 8 ? ` and ${l.names.length - 8} more` : ""}</span> : null}
            </span>
            {!l.ok ? <Link href={l.href} className="underline">Fix</Link> : null}
          </li>
        ))}
      </ul>
      {unanswered.length > 0 ? (
        <div className="card space-y-2 p-3 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Questions from helpers</h2>
          {unanswered.map((q) => (
            <AnswerRow key={q.id} id={q.id} title={`${q.who}${q.itemTitle ? ` · ${q.itemTitle}` : ""}`} text={q.text} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AnswerRow({ id, title, text }: { id: string; title: string; text: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <div><strong>{title}</strong>: {text}</div>
      <div className="flex gap-2">
        <input className="field flex-1" aria-label="Answer" placeholder="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={500} />
        <button className="btn-primary" disabled={pending || !answer.trim()} onClick={() => startTransition(async () => { const r = await answerAlert(id, answer); if (!r.ok) return setError(r.error); setAnswer(""); router.refresh(); })}>Answer</button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live (§5)
// ---------------------------------------------------------------------------
function Live({
  data,
  alerts,
  now,
  fmt,
  timeZone,
  pending,
  run,
  onShift,
  onAnnounce,
}: {
  data: MasterData;
  alerts: Alert[];
  now: Date;
  fmt: (iso: string) => string;
  timeZone: string;
  pending: boolean;
  run: (work: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;
  onShift: (item: MasterItemFull, lateMinutes?: number, alertKey?: string) => void;
  onAnnounce: () => void;
}) {
  const t = now.getTime();
  const [filter, setFilter] = useState<"all" | "problems" | "notes" | "progress" | "photos" | "shots" | "seating">("all");
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const phoneOf = (name: string | null) => data.assignees.find((a) => a.name === name)?.phone ?? data.people.find((p) => p.name === name)?.phone ?? null;

  // Now: what is on, plus any cue in standby (within five minutes of its start) so Go is at hand.
  const nowItems = data.items.filter(
    (i) =>
      (Date.parse(i.startsAt) <= t && t < Date.parse(i.endsAt)) ||
      cueState({ startsAt: i.startsAt, isCue: i.isCue, cueCalledAt: i.cueCalledAt, state: "todo" }, now).kind !== "none",
  );
  const upNext = data.items.filter((i) => Date.parse(i.startsAt) > t && Date.parse(i.startsAt) <= t + 60 * 60_000 && !nowItems.includes(i));
  const feed = data.activity.filter((a) => (filter === "all" ? true : filter === "photos" ? Boolean(a.photoUrl) : a.group === filter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={onAnnounce}>Announce</button>
        <AlertsSettings data={data} />
      </div>

      {alerts.length === 0 ? <p className="card p-4 text-sm text-muted">Nothing needs anyone. Going to plan.</p> : null}
      {alerts.map((a) => (
        <AlertCard key={a.key} alert={a} data={data} now={now} fmt={fmt} phone={phoneOf(a.who)} pending={pending} run={run} onShift={onShift} itemById={itemById} />
      ))}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Now</h2>
        {nowItems.length === 0 ? <p className="card p-4 text-sm text-muted">Nothing is scheduled right now.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {nowItems.map((item) => (
            <ItemCard key={item.id} item={item} now={now} fmt={fmt} pending={pending} run={run} onShift={onShift} phoneOf={phoneOf} />
          ))}
        </div>
      </section>

      {upNext.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Up next</h2>
          <div className="card divide-y divide-line text-sm">
            {upNext.map((i) => (
              <div key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                <span><strong>{fmt(i.startsAt)}</strong> {i.title}{i.location ? ` · ${i.location}` : ""}</span>
                <span className="text-xs text-muted">{i.assignees.map((a) => a.name).join(", ") || "Nobody"}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.moduleCards.length > 0 ? (
        <section className="space-y-2">
          {data.moduleCards.map((c) => (
            <Link key={c.key} href={c.href} className="card block p-3 text-sm hover:bg-black/5">
              <strong>{c.label}</strong> · {c.summary}
            </Link>
          ))}
        </section>
      ) : null}

      <Timeline data={data} now={now} fmt={fmt} timeZone={timeZone} onShift={onShift} />
      <People data={data} fmt={fmt} now={now} />
      <Announcements data={data} fmt={fmt} />

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Feed</h2>
        <div className="mb-2 flex flex-wrap gap-1.5 text-sm">
          {(["all", "problems", "notes", "progress", "photos", "shots", "seating"] as const).map((f) => (
            <button key={f} className={`rounded-full border px-3 py-1 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-white"}`} onClick={() => setFilter(f)}>
              {f === "all" ? "Everything" : f[0]!.toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {filter === "photos" ? (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {feed.map((a) => a.photoUrl ? (
              <a key={a.id} href={a.photoUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.photoUrl} alt={a.text} className="aspect-square w-full rounded object-cover" />
              </a>
            ) : null)}
          </div>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {feed.slice(0, 60).map((a) => <FeedRow key={a.id} row={a} fmt={fmt} />)}
            {feed.length === 0 ? <li className="p-3 text-muted">Nothing yet.</li> : null}
          </ul>
        )}
      </section>
    </div>
  );
}

function FeedRow({ row, fmt }: { row: MasterFeedRow; fmt: (iso: string) => string }) {
  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <span><span className="text-muted">{fmt(row.tappedAt)}</span> {row.text}{row.answer ? <span className="block pl-10 text-muted">Answered: {row.answer}</span> : null}</span>
      {row.photoUrl ? (
        <a href={row.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.photoUrl} alt="Photo from the helper" className="h-12 w-12 rounded object-cover" />
        </a>
      ) : null}
    </li>
  );
}

function AlertCard({
  alert,
  data,
  now,
  fmt,
  phone,
  pending,
  run,
  onShift,
  itemById,
}: {
  alert: Alert;
  data: MasterData;
  now: Date;
  fmt: (iso: string) => string;
  phone: string | null;
  pending: boolean;
  run: (work: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;
  onShift: (item: MasterItemFull, lateMinutes?: number, alertKey?: string) => void;
  itemById: Map<string, MasterItemFull>;
}) {
  const [text, setText] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const item = alert.itemId ? itemById.get(alert.itemId) : undefined;
  const row = alert.activityId ? data.activity.find((a) => a.id === alert.activityId) : undefined;
  const colour = alert.severity === "red" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50";
  const waiting = waitingMinutes(alert.since, now);
  const lateAssignee = alert.assigneeRowId ? data.assignees.find((a) => a.rowId === alert.assigneeRowId) : undefined;

  return (
    <article className={`space-y-2 rounded-xl border p-3 text-sm ${colour}`} aria-label={alert.title}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <strong>{alert.title}</strong>
          <div>{alert.detail}</div>
          {alert.kind === "help" && data.dayLead ? <div className="text-xs text-muted">{data.dayLead.name} will answer</div> : null}
        </div>
        <div className="text-right text-xs">
          {alert.escalated ? <span className="rounded bg-red-700 px-1.5 py-0.5 text-white">Waiting {waiting} min</span> : <span className="text-muted">{fmt(alert.since)}</span>}
        </div>
      </div>
      {row?.photoUrl ? (
        <a href={row.photoUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.photoUrl} alt="From the helper" className="h-20 rounded object-cover" />
        </a>
      ) : null}

      {alert.kind === "help" && alert.activityId ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ANSWERS.map((q) => (
              <button key={q} className="btn" disabled={pending} onClick={() => run(() => answerAlert(alert.activityId!, q), "Answered")}>{q}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="field flex-1" aria-label="Answer" placeholder="Or type an answer" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            <button className="btn-primary" disabled={pending || !text.trim()} onClick={() => run(() => answerAlert(alert.activityId!, text), "Answered")}>Send</button>
          </div>
        </div>
      ) : null}

      {alert.kind === "handed_back" && item ? (
        <div className="flex flex-wrap gap-2">
          <select className="field w-auto" aria-label="Reassign to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="">Reassign to…</option>
            {data.assigneeOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <button className="btn-primary" disabled={pending || !reassignTo} onClick={() => { const o = data.assigneeOptions.find((x) => x.key === reassignTo)!; run(() => reassignTask(item.id, { type: o.type, id: o.id }), `${o.label} is on it`); }}>Reassign</button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {phone ? <a className="btn" href={`tel:${phone}`}>Call</a> : null}
        {(alert.kind === "help" || alert.kind === "handed_back") && item ? <button className="btn" disabled={pending} onClick={() => run(() => takeTask(item.id), "You're on it")}>I&rsquo;ll take it</button> : null}
        {alert.kind === "not_started" && item ? <button className="btn" disabled={pending} onClick={() => run(() => markStarted(item.id), "Marked started")}>Mark started</button> : null}
        {alert.kind === "late" && item && lateAssignee ? <button className="btn-primary" onClick={() => onShift(item, lateAssignee.lateMinutes ?? 10, alert.key)}>Shift the schedule</button> : null}
        {alert.kind === "help" && alert.activityId ? null : <button className="btn" disabled={pending} onClick={() => run(() => dismissAlert(alert.key, alert.itemId))}>{alert.kind === "late" ? "OK" : "Dismiss"}</button>}
        {alert.kind === "help" && alert.activityId ? <button className="btn" disabled={pending} onClick={() => run(() => dismissAlert(alert.key, alert.itemId))}>Dismiss</button> : null}
      </div>
    </article>
  );
}

function ItemCard({
  item,
  now,
  fmt,
  pending,
  run,
  onShift,
  phoneOf,
}: {
  item: MasterItemFull;
  now: Date;
  fmt: (iso: string) => string;
  pending: boolean;
  run: (work: () => Promise<{ ok: boolean; error?: string }>, done?: string) => void;
  onShift: (item: MasterItemFull) => void;
  phoneOf: (name: string | null) => string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const remaining = Math.max(0, Math.round((Date.parse(item.endsAt) - now.getTime()) / 60_000));
  const ticked = item.assignees.reduce((sum, a) => sum + a.stepsTicked, 0);
  const cue = cueState({ startsAt: item.startsAt, isCue: item.isCue, cueCalledAt: item.cueCalledAt, state: "todo" }, now);
  return (
    <article className="card space-y-2 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-base">{item.title}</strong>
        {item.critical ? <span className="rounded bg-red-100 px-1.5 text-xs text-red-800">Must not slip</span> : null}
      </div>
      <div className="text-muted">{fmt(item.startsAt)}–{fmt(item.endsAt)} · ends in {remaining} min{item.location ? ` · ${item.location}` : ""}</div>
      {item.stepsTotal > 0 && item.assignees.length > 0 ? <div className="text-muted">{Math.round(ticked / item.assignees.length)} of {item.stepsTotal} steps</div> : null}
      <div className="flex flex-wrap gap-1.5">
        {item.assignees.map((a) => (
          <span key={a.rowId} className="relative">
            <button
              className={`rounded-full border px-2.5 py-1 text-xs ${a.state === "done" ? "border-green-300 bg-green-50 text-green-800" : a.state === "handed_back" ? "border-line text-muted line-through" : a.lateMinutes ? "border-amber-300 bg-amber-50 text-amber-900" : a.state === "started" ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
              onClick={() => setOpen(open === a.rowId ? null : a.rowId)}
            >
              {a.isLead ? "★ " : ""}{a.name} · {a.lateMinutes ? `late +${a.lateMinutes}` : STATE_WORD[a.state]}
            </button>
            {open === a.rowId ? (
              <span className="absolute left-0 top-full z-10 mt-1 flex gap-2 rounded border border-line bg-white p-2 shadow">
                {phoneOf(a.name) ? <><a className="underline" href={`tel:${phoneOf(a.name)}`}>Call</a><a className="underline" href={`sms:${phoneOf(a.name)}`}>Text</a></> : <span className="text-xs text-muted">No phone</span>}
              </span>
            ) : null}
          </span>
        ))}
        {item.assignees.length === 0 ? <span className="text-muted">Nobody assigned</span> : null}
      </div>
      {item.isCue ? (
        <div className="flex items-center gap-2">
          {cue.kind === "standby" ? <span className="font-medium text-amber-800">Standby · {countdown(cue.secondsToStart)}</span> : null}
          {item.cueCalledAt ? (
            <>
              <span className="text-muted">Go called at {fmt(item.cueCalledAt)}</span>
              <button className="btn" disabled={pending} onClick={() => run(() => resetCue(item.id))}>Reset</button>
            </>
          ) : (
            <button className="btn-primary px-6 py-3 text-base" disabled={pending} onClick={() => run(() => callCue(item.id), `Go sent for ${item.title}`)}>Go</button>
          )}
        </div>
      ) : null}
      <button className="btn" onClick={() => onShift(item)}>Shift the schedule</button>
    </article>
  );
}

function Timeline({ data, now, fmt, timeZone, onShift }: { data: MasterData; now: Date; fmt: (iso: string) => string; timeZone: string; onShift: (item: MasterItemFull) => void }) {
  void timeZone;
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Timeline</h2>
      <ul className="card divide-y divide-line text-sm">
        {data.items.map((i) => {
          const done = i.assignees.length > 0 && i.assignees.every((a) => a.state === "done" || a.state === "handed_back") && i.assignees.some((a) => a.state === "done");
          return (
            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
              <span className={done ? "text-muted" : undefined}>
                {done ? "✓ " : ""}<strong>{fmt(i.startsAt)}</strong> {i.title}
                {!done ? <span className="block text-xs text-muted">{i.assignees.map((a) => `${a.name} (${a.lateMinutes ? `late +${a.lateMinutes}` : STATE_WORD[a.state]})`).join(", ") || "Nobody assigned"}</span> : null}
              </span>
              {!done && Date.parse(i.endsAt) > now.getTime() ? <button className="btn" onClick={() => onShift(i)}>Shift</button> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function People({ data, fmt, now }: { data: MasterData; fmt: (iso: string) => string; now: Date }) {
  const soon = (name: string) => data.items.some((i) => Date.parse(i.startsAt) > now.getTime() && Date.parse(i.startsAt) <= now.getTime() + 30 * 60_000 && i.assignees.some((a) => a.name === name));
  const rows = [...data.people].sort((a, b) => {
    const wa = soon(a.name) && !a.link?.arrivedAt ? 1 : 0;
    const wb = soon(b.name) && !b.link?.arrivedAt ? 1 : 0;
    return wb - wa || a.name.localeCompare(b.name, "en-GB");
  });
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">People</h2>
      <ul className="card divide-y divide-line text-sm">
        {rows.map((p) => {
          const waiting = soon(p.name) && !p.link?.arrivedAt;
          return (
            <li key={`${p.type}:${p.id}`} className={`flex flex-wrap items-center justify-between gap-2 p-3 ${waiting ? "bg-amber-50" : ""}`}>
              <span>
                <strong>{p.name}</strong>{" "}
                <span className="text-xs text-muted">
                  {!p.link ? "No link" : !p.link.opened ? "Link not opened" : p.link.arrivedAt ? `Here ${fmt(p.link.arrivedAt)}` : waiting ? "Hasn't tapped I'm here" : "Opened"}
                  {p.nowTitle ? ` · ${p.nowTitle} · ${p.stateLabel}` : ""}
                </span>
              </span>
              {p.phone ? <span className="flex gap-2"><a className="underline" href={`tel:${p.phone}`}>Call</a><a className="underline" href={`sms:${p.phone}`}>Text</a></span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Announcements({ data, fmt }: { data: MasterData; fmt: (iso: string) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (data.announcements.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Announcements</h2>
      <ul className="card divide-y divide-line text-sm">
        {data.announcements.map((a) => (
          <li key={a.id} className="space-y-0.5 p-3">
            <div>{a.important ? "❗ " : ""}{a.text}</div>
            <div className="text-xs text-muted">
              To {a.to} · {fmt(a.sentAt)} ·{" "}
              <button className="underline" onClick={() => setOpen(open === `${a.id}:seen` ? null : `${a.id}:seen`)}>Seen by {a.seen} of {a.reached}</button>
              {a.important ? <> · <button className="underline" onClick={() => setOpen(open === `${a.id}:ok` ? null : `${a.id}:ok`)}>OK from {a.acknowledged} of {a.reached}</button></> : null}
            </div>
            {open === `${a.id}:seen` ? <div className="text-xs">{a.seenNames.join(", ") || "Nobody yet"}</div> : null}
            {open === `${a.id}:ok` ? <div className="text-xs">{a.ackNames.join(", ") || "Nobody yet"}</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlertsSettings({ data }: { data: MasterData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lead, setLead] = useState(data.dayLead ? `${data.dayLead.ref.type}:${data.dayLead.ref.id}` : "");
  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none">Alerts and day lead</summary>
      <div className="absolute z-30 mt-1 w-72 space-y-2 rounded border border-line bg-white p-3 text-sm shadow-lg">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={data.viewer.alertsOn} disabled={pending} onChange={(e) => startTransition(async () => { await setDayAlerts(e.target.checked); router.refresh(); })} />
          Alerts on the day (vibrate and sound for me)
        </label>
        <label className="block">Day lead
          <select
            className="field mt-1"
            value={lead}
            disabled={pending}
            onChange={(e) => {
              setLead(e.target.value);
              const [type, id] = e.target.value.split(":");
              startTransition(async () => { await setDayLead(e.target.value ? { type: type as "collaborator" | "person", id: id! } : null); router.refresh(); });
            }}
          >
            <option value="">No one in particular</option>
            {data.assigneeOptions.filter((o) => o.type === "collaborator" || o.type === "person").map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted">Naming a day lead shows their name on every Help alert and turns the couple&rsquo;s own alerts off. Anyone can still answer.</p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Shifting (§5.4)
// ---------------------------------------------------------------------------
function ShiftSheet({
  data,
  item,
  initialDelta,
  timeZone,
  fmt,
  pending,
  onClose,
  onShift,
}: {
  data: MasterData;
  item: MasterItemFull;
  initialDelta?: number;
  timeZone: string;
  fmt: (iso: string) => string;
  pending: boolean;
  onClose: () => void;
  onShift: (delta: number, scope: ShiftScope, summary: string, announceText: string) => void;
}) {
  const [delta, setDelta] = useState(initialDelta && [5, 10, 15].includes(initialDelta) ? initialDelta : initialDelta ?? 10);
  const [other, setOther] = useState(initialDelta && ![5, 10, 15].includes(initialDelta) ? String(initialDelta) : "");
  const [scope, setScope] = useState<ShiftScope>("chain");
  const preview = useMemo(
    () => previewShift(data.items.map((i) => ({ id: i.id, title: i.title, startsAt: i.startsAt, endsAt: i.endsAt, predecessorId: i.predecessorId })), item.id, delta, scope, (a, b) => dayKeyOf(a, timeZone) === dayKeyOf(b, timeZone)),
    [data.items, item.id, delta, scope, timeZone],
  );
  const summary = describeShift(preview, fmt);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-xl bg-white p-5 text-sm sm:rounded-xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg">Shift {item.title}</h2>
        <div className="flex flex-wrap gap-2">
          {[5, 10, 15].map((m) => (
            <button key={m} className={delta === m && !other ? "btn-primary" : "btn"} onClick={() => { setDelta(m); setOther(""); }}>+{m} min</button>
          ))}
          <input className="field w-24" type="number" aria-label="Other minutes" placeholder="Other" value={other} onChange={(e) => { setOther(e.target.value); const n = Number(e.target.value); if (Number.isInteger(n) && n !== 0) setDelta(n); }} />
        </div>
        <fieldset className="space-y-1">
          <legend>What moves</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={scope === "chain"} onChange={() => setScope("chain")} /> This item and everything after it (recommended)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={scope === "only"} onChange={() => setScope("only")} /> Just this item</label>
        </fieldset>
        {preview.problem ? <p className="text-amber-800">{preview.problem}</p> : (
          <div className="space-y-1">
            <p><strong>{summary}</strong></p>
            <ul className="max-h-40 overflow-y-auto text-xs text-muted">
              {preview.moves.map((m) => <li key={m.id}>{m.title}: {fmt(m.from)} → {fmt(m.to)}</li>)}
              {preview.fixed.map((f) => <li key={f.id}>{f.title}: {fmt(f.startsAt)} (fixed)</li>)}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary ml-auto" disabled={pending || Boolean(preview.problem)} onClick={() => onShift(delta, scope, summary, `Shifted ${preview.moves.length} ${preview.moves.length === 1 ? "item" : "items"} by ${delta} minutes`)}>Shift</button>
        </div>
      </div>
    </div>
  );
}

function AnnounceSheet({
  data,
  initialText,
  pending,
  onClose,
  onSend,
}: {
  data: MasterData;
  initialText: string;
  pending: boolean;
  onClose: () => void;
  onSend: (input: { audience: "everyone" | "group" | "link"; groupId?: string; linkId?: string; text: string; important: boolean }) => void;
}) {
  const [to, setTo] = useState("everyone");
  const [text, setText] = useState(initialText);
  const [important, setImportant] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-t-xl bg-white p-5 text-sm sm:rounded-xl" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg">Announce</h2>
        <select className="field" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="everyone">Everyone with a link</option>
          {data.groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
          {data.people.filter((p) => p.link).map((p) => <option key={p.link!.id} value={`link:${p.link!.id}`}>{p.name}</option>)}
        </select>
        <textarea className="field" rows={2} maxLength={500} placeholder="Ceremony running 10 minutes late" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <label className="flex items-center gap-2"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} /> Important: stays pinned until they tap OK</label>
        <div className="flex gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary ml-auto"
            disabled={pending || !text.trim()}
            onClick={() => {
              const [kind, id] = to.split(":");
              onSend({ audience: kind === "group" ? "group" : kind === "link" ? "link" : "everyone", groupId: kind === "group" ? id : undefined, linkId: kind === "link" ? id : undefined, text, important });
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// After the day (§7)
// ---------------------------------------------------------------------------
function Summary({ data, fmt, weddingName }: { data: MasterData; fmt: (iso: string) => string; weddingName: string }) {
  const items: SummaryItem[] = data.items.map((i) => ({
    id: i.id,
    title: i.title,
    startsAt: i.startsAt,
    isCue: i.isCue,
    cueCalledAt: i.cueCalledAt,
    assignees: i.assignees.map((a) => ({ name: a.name, state: a.state, doneAt: a.doneAt, startedAt: a.startedAt, lateMinutes: a.lateMinutes, handedBackReason: a.handedBackReason })),
  }));
  const activity: SummaryActivity[] = data.activity
    .filter((a) => ["help", "note", "question"].includes(a.kind))
    .map((a) => ({ id: a.id, kind: a.kind, who: a.who, itemTitle: a.itemTitle, tappedAt: a.tappedAt, payload: a.payload, answer: a.answer, answeredAt: a.answeredAt, hasPhoto: Boolean(a.photoUrl) }));
  const problems = summaryProblems(items);
  const rows = summaryCsvRows(items, activity, data.announcements.map((a) => ({ text: a.text, to: a.to, sentAt: a.sentAt, important: a.important, seen: a.seen, acknowledged: a.acknowledged, reached: a.reached })), fmt);

  function download() {
    const body = csvDocument([...SUMMARY_CSV_HEADER], rows);
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${weddingName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-day-summary.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{data.items.length} tasks · {data.activity.filter((a) => a.kind === "help").length} help requests · {data.announcements.length} announcements</p>
        <button className="btn" onClick={download}>Download CSV</button>
      </div>
      {problems.handedBack.length + problems.neverDone.length > 0 ? (
        <div className="card space-y-1 p-3 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Handed back or never done</h2>
          {problems.handedBack.map((p, i) => <p key={`h${i}`}><strong>{p.item}</strong> · {p.who} handed it back{p.reason ? `: ${p.reason}` : ""}</p>)}
          {problems.neverDone.map((p, i) => <p key={`n${i}`}><strong>{p.item}</strong> · {p.who} never finished it</p>)}
        </div>
      ) : <p className="card p-3 text-sm text-muted">Everything was done.</p>}
      <ul className="card divide-y divide-line text-sm">
        {items.map((i) => (
          <li key={i.id} className="p-3">
            <strong>{fmt(i.startsAt)}</strong> {i.title}
            {i.isCue ? <span className="text-muted"> · {i.cueCalledAt ? `Go called ${fmt(i.cueCalledAt)}` : "Go never called"}</span> : null}
            <div className="text-xs text-muted">
              {i.assignees.map((a) => `${a.name}: ${a.state === "done" && a.doneAt ? `done ${fmt(a.doneAt)}` : STATE_WORD[a.state].toLowerCase()}${a.lateMinutes ? ` (late +${a.lateMinutes})` : ""}`).join(" · ") || "Nobody assigned"}
            </div>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Help, notes and photos</h2>
        <ul className="card divide-y divide-line text-sm">
          {data.activity.filter((a) => ["help", "note", "question", "help_answered"].includes(a.kind) || a.photoUrl).map((a) => <FeedRow key={a.id} row={a} fmt={fmt} />)}
        </ul>
      </section>
      <Announcements data={data} fmt={fmt} />
      {data.moduleCards.length > 0 ? (
        <ul className="card divide-y divide-line text-sm">
          {data.moduleCards.map((c) => <li key={c.key} className="p-3"><strong>{c.label}</strong> · {c.summary}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
