"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  addDayNote,
  confirmTasks,
  handBack,
  markArrived,
  markTaskSeen,
  recordOpened,
  reportLate,
  requestHelp,
  setTaskState,
  tickStep,
} from "@/server/actions/day-link-taps";
import { arrangeMyDay, buttonsWork, dayPhase, isChanged, timingPhrase, type MyDayTask } from "@/lib/day-links/my-day";
import { HELP_REASONS, LATE_CHOICES } from "@/lib/day-links/state";
import type { DayTask, MyDayData } from "@/server/day-links/my-day";

type Wedding = { name: string; timeZone: string; date: string | null };
type Sheet =
  | { kind: "late"; task: DayTask }
  | { kind: "help"; task: DayTask | null }
  | { kind: "handback"; task: DayTask }
  | { kind: "note"; task: DayTask | null }
  | { kind: "more"; task: DayTask }
  | null;
type Toast = { text: string; undo?: () => void } | null;

const POLL_MS = 15_000;

function fmtTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(" am", " am")
    .replace(/\s/g, " ");
}
function fmtRange(task: DayTask, timeZone: string) {
  return `${fmtTime(task.startsAt, timeZone)} – ${fmtTime(task.endsAt, timeZone)}`;
}
function fmtDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function deviceId(): string {
  try {
    const key = "dl-device";
    let id = localStorage.getItem(key);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}

function toTask(t: DayTask): MyDayTask {
  return {
    id: t.id,
    title: t.title,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    state: t.state,
    updatedAt: t.updatedAt,
    seenAt: t.seenAt,
    lateMinutes: t.lateMinutes,
  };
}

export function MyDayView({
  token,
  helperName,
  wedding,
  initial,
}: {
  token: string;
  helperName: string;
  wedding: Wedding;
  initial: MyDayData;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [welcomed, setWelcomed] = useState(true);
  const data = initial;

  // First open on this device (§6.1) and the "opened" activity row.
  useEffect(() => {
    try {
      setWelcomed(localStorage.getItem(`dl-welcomed-${token.slice(0, 12)}`) === "1");
    } catch {
      setWelcomed(false);
    }
    void recordOpened(token, deviceId());
  }, [token]);

  // The clock, and the 15-second poll plus a refresh on coming back (§6.9).
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    const poll = setInterval(() => router.refresh(), POLL_MS);
    const visible = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const tasks = data.tasks;
  const arranged = useMemo(() => arrangeMyDay(tasks.map(toTask), now), [tasks, now]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const phase = dayPhase(tasks, now, wedding.timeZone);
  const openTask = openId ? byId.get(openId) ?? null : null;
  const nowTask = arranged.now ? byId.get(arranged.now.id) ?? null : null;
  const openHelp = data.help.find((h) => !h.answeredAt);
  const answeredHelp = data.help.find((h) => h.answeredAt && h.answer);
  const unconfirmed = tasks.filter((t) => !t.confirmedAt && t.state === "todo" && phase !== "after");

  const run = useCallback(
    async (work: () => Promise<{ ok: boolean; error?: string }>, done: string, undo?: () => void) => {
      setBusy(true);
      setError(null);
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.error ?? "That didn't go through.");
          return false;
        }
        setToast({ text: `${done} · sent to the planner ✓`, undo });
        startTransition(() => router.refresh());
        return true;
      } catch {
        setError("No signal. Your tap wasn't sent. Try again when you're back online.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  function act(task: DayTask, action: "start" | "done" | "undo", label: string) {
    const tappedAt = new Date().toISOString();
    void run(
      () => setTaskState(token, task.id, action, tappedAt),
      label,
      action === "undo" ? undefined : () => void act(task, "undo", "Undone"),
    );
  }

  function open(task: DayTask) {
    setOpenId(task.id);
    void markTaskSeen(token, task.id);
  }

  if (!welcomed) {
    return (
      <div className="dl-wrap" style={{ paddingTop: 64 }}>
        <h1 className="dl-large">Hi {helperName}.</h1>
        <p style={{ marginTop: 12 }}>
          You&rsquo;re helping at {wedding.name}
          {wedding.date ? ` on ${fmtDay(`${wedding.date}T12:00:00Z`, "UTC")}` : ""}. You have{" "}
          {tasks.length === 1 ? "1 job" : `${tasks.length} jobs`}.
        </p>
        <p className="dl-sub" style={{ marginTop: 12 }}>
          Tip: add this page to your home screen so it opens like an app. On an iPhone, tap Share, then Add to Home
          Screen.
        </p>
        <div style={{ marginTop: 32 }}>
          <button
            className="dl-btn"
            onClick={() => {
              try {
                localStorage.setItem(`dl-welcomed-${token.slice(0, 12)}`, "1");
              } catch {}
              setWelcomed(true);
            }}
          >
            See my jobs
          </button>
        </div>
      </div>
    );
  }

  if (openTask) {
    return (
      <>
        <div className="dl-bar">{openTask.title}</div>
        <div className="dl-wrap">
          <button className="dl-link" style={{ minHeight: 44, marginTop: 8 }} onClick={() => setOpenId(null)}>
            ‹ My day
          </button>
          <TaskCard
            task={openTask}
            now={now}
            wedding={wedding}
            busy={busy}
            full
            onAct={act}
            onSheet={setSheet}
            onTick={(stepId, ticked) => void run(() => tickStep(token, stepId, ticked, new Date().toISOString()), ticked ? "Step done" : "Step undone")}
          />
          {error ? <p className="dl-error">{error}</p> : null}
        </div>
        {renderSheetAndToast()}
      </>
    );
  }

  return (
    <>
      <div className="dl-wrap">
        <h1 className="dl-large">My day</h1>
        <p className="dl-sub">
          {wedding.name} · {tasks[0] ? fmtDay(tasks[0].startsAt, wedding.timeZone) : "No jobs yet"} ·{" "}
          {fmtTime(now.toISOString(), wedding.timeZone)}
        </p>

        {phase === "before" && tasks[0] ? (
          <p className="dl-card dl-sub">You can start these on the day ({fmtDay(tasks[0].startsAt, wedding.timeZone)}).</p>
        ) : null}
        {phase === "after" ? (
          <p className="dl-card">Thanks for helping. This link stops working a week after the wedding.</p>
        ) : null}

        {openHelp ? (
          <div className="dl-banner">
            <strong>Help requested</strong> · waiting
            <div className="dl-meta">{openHelp.reason}</div>
          </div>
        ) : answeredHelp ? (
          <div className="dl-banner" style={{ background: "var(--dl-card)" }}>
            <strong>{answeredHelp.answer}</strong>
            <div className="dl-meta">Your help request: {answeredHelp.reason}</div>
          </div>
        ) : null}

        {phase === "day" && !data.arrivedAt ? (
          <div className="dl-card">
            <div className="dl-headline">I&rsquo;m here</div>
            <div className="dl-meta">Tap when you arrive.</div>
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn small" disabled={busy} onClick={() => void run(() => markArrived(token, new Date().toISOString()), "Arrived")}>
                I&rsquo;m here
              </button>
            </div>
          </div>
        ) : null}

        {unconfirmed.length > 0 ? (
          <div className="dl-card">
            <div className="dl-headline">New jobs</div>
            <div className="dl-meta">Let the planner know you&rsquo;ve seen {unconfirmed.length === 1 ? "this one" : "these"}.</div>
            <div style={{ marginTop: 12 }}>
              <button
                className="dl-btn small grey"
                disabled={busy}
                onClick={() => void run(() => confirmTasks(token, unconfirmed.map((t) => t.id)), "Got it")}
              >
                {unconfirmed.length > 1 ? "Got it to all" : "Got it"}
              </button>
            </div>
          </div>
        ) : null}

        {nowTask ? (
          <TaskCard
            task={nowTask}
            now={now}
            wedding={wedding}
            busy={busy}
            heading={nowTask.state === "started" || (Date.parse(nowTask.startsAt) <= now.getTime() && now.getTime() < Date.parse(nowTask.endsAt)) ? "Now" : "Next"}
            onAct={act}
            onSheet={setSheet}
            onOpen={() => open(nowTask)}
            onTick={(stepId, ticked) => void run(() => tickStep(token, stepId, ticked, new Date().toISOString()), ticked ? "Step done" : "Step undone")}
          />
        ) : (
          <p className="dl-card dl-sub">You have no jobs yet. Check back later.</p>
        )}
        {error ? <p className="dl-error">{error}</p> : null}

        {arranged.next.length > 0 ? (
          <>
            <h2 className="dl-foot">Next up</h2>
            <div className="dl-group">
              {arranged.next.map((t) => {
                const task = byId.get(t.id)!;
                return (
                  <button key={t.id} className="dl-row" onClick={() => open(task)}>
                    <div className="dl-headline">
                      {task.title} {isChanged(toTask(task)) ? <span className="dl-capsule changed">Changed</span> : null}
                    </div>
                    <div className="dl-meta">
                      {fmtRange(task, wedding.timeZone)}
                      {task.location ? ` · ${task.location}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {arranged.earlier.length > 0 ? (
          <details style={{ marginTop: 8 }}>
            <summary className="dl-foot" style={{ cursor: "pointer" }}>Earlier today</summary>
            <div className="dl-group">
              {arranged.earlier.map((t) => {
                const task = byId.get(t.id)!;
                return (
                  <button key={t.id} className="dl-row" onClick={() => open(task)}>
                    <div className={task.state === "handed_back" ? "dl-headline dl-struck" : "dl-headline"}>{task.title}</div>
                    <div className="dl-meta">
                      {task.state === "done" && task.doneAt
                        ? `Done ${fmtTime(task.doneAt, wedding.timeZone)} ✓`
                        : "You handed this back"}
                    </div>
                  </button>
                );
              })}
            </div>
          </details>
        ) : null}

        {data.contacts.length > 0 ? (
          <>
            <h2 className="dl-foot">Contacts</h2>
            <div className="dl-group">
              {data.contacts.map((c) => (
                <div key={c.id} className="dl-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>{c.label}</span>
                  <span style={{ display: "flex", gap: 16 }}>
                    <a className="dl-link" href={`tel:${c.phone}`}>Call</a>
                    <a className="dl-link" href={`sms:${c.phone}`}>Text</a>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {data.info.some((s) => s.body.trim()) ? (
          <>
            <h2 className="dl-foot">Good to know</h2>
            <div className="dl-group">
              {data.info
                .filter((s) => s.body.trim())
                .map((s) => (
                  <div key={s.id} className="dl-row">
                    <div className="dl-headline">{s.heading}</div>
                    <div className="dl-meta" style={{ whiteSpace: "pre-wrap" }}>{s.body}</div>
                  </div>
                ))}
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <button className="dl-btn small grey" onClick={() => setSheet({ kind: "help", task: null })}>
            Need help with something else
          </button>
        </div>
      </div>
      {renderSheetAndToast()}
    </>
  );

  function renderSheetAndToast() {
    return (
      <>
        {sheet ? (
          <SheetView
            sheet={sheet}
            busy={busy}
            onClose={() => setSheet(null)}
            onLate={(task, minutes) =>
              void run(() => reportLate(token, task.id, minutes, new Date().toISOString()), `Running late +${minutes}`).then((ok) => ok && setSheet(null))
            }
            onHelp={(task, reason, text) =>
              void run(() => requestHelp(token, task?.id ?? null, reason, text, new Date().toISOString()), "Help requested").then((ok) => ok && setSheet(null))
            }
            onHandBack={(task, reason) =>
              void run(() => handBack(token, task.id, reason, new Date().toISOString()), "Handed back", () => act(task, "undo", "Undone")).then((ok) => ok && setSheet(null))
            }
            onNote={(task, text) =>
              void run(() => addDayNote(token, task?.id ?? null, text, new Date().toISOString()), "Note sent").then((ok) => ok && setSheet(null))
            }
            onMore={(next) => setSheet(next)}
            error={error}
          />
        ) : null}
        {toast ? (
          <div className="dl-toast" role="status">
            <span>{toast.text}</span>
            {toast.undo ? (
              <button className="dl-link" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }
}

function TaskCard({
  task,
  now,
  wedding,
  busy,
  heading,
  full,
  onAct,
  onSheet,
  onOpen,
  onTick,
}: {
  task: DayTask;
  now: Date;
  wedding: Wedding;
  busy: boolean;
  heading?: string;
  full?: boolean;
  onAct: (task: DayTask, action: "start" | "done" | "undo", label: string) => void;
  onSheet: (sheet: Sheet) => void;
  onOpen?: () => void;
  onTick: (stepId: string, ticked: boolean) => void;
}) {
  const works = buttonsWork({ startsAt: task.startsAt }, now, wedding.timeZone);
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(task.address || task.location || "")}`;
  const open = task.state === "todo" || task.state === "started";

  return (
    <section className="dl-card" aria-label={task.title}>
      {heading ? <div className="dl-meta" style={{ textTransform: "uppercase", fontWeight: 600 }}>{heading}</div> : null}
      <div className="dl-title1" onClick={onOpen} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined}>
        {task.title}
      </div>
      <div className="dl-meta" style={{ marginTop: 4 }}>
        {fmtRange(task, wedding.timeZone)} · {timingPhrase(task, now)}
      </div>
      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {isChanged(toTask(task)) ? <span className="dl-capsule changed">Changed</span> : null}
        {task.critical ? <span className="dl-capsule">Must not slip</span> : null}
        {task.lateMinutes ? <span className="dl-capsule late">Running late +{task.lateMinutes}</span> : null}
        {task.state === "done" ? <span className="dl-capsule done">Done ✓</span> : null}
      </div>
      {task.location ? (
        <div style={{ marginTop: 10 }}>
          <a className="dl-link" href={mapsHref} target="_blank" rel="noreferrer">
            {task.location}
          </a>
          {task.address ? <div className="dl-meta">{task.address}</div> : null}
        </div>
      ) : null}
      {task.others.length > 0 ? <div className="dl-meta" style={{ marginTop: 8 }}>With {task.others.join(", ")}</div> : null}
      {task.instructions ? <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{task.instructions}</p> : null}

      {(full || task.state === "started") && task.steps.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div className="dl-meta" style={{ fontWeight: 600 }}>
            Steps · {task.steps.filter((s) => s.ticked).length} of {task.steps.length}
          </div>
          {task.steps.map((s) => (
            <label key={s.id} className="dl-step">
              <input type="checkbox" checked={s.ticked} disabled={busy || !works} onChange={(e) => onTick(s.id, e.target.checked)} />
              <span className={s.ticked ? "dl-struck" : undefined}>{s.text}</span>
            </label>
          ))}
        </div>
      ) : null}
      {task.bring.length > 0 && (full || task.state !== "done") ? (
        <div style={{ marginTop: 12 }}>
          <div className="dl-meta" style={{ fontWeight: 600 }}>What to bring</div>
          <ul className="dl-ul">{task.bring.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ) : null}
      {task.contact ? (
        <div className="dl-meta" style={{ marginTop: 12 }}>
          Ask {task.contact.label} if anything&rsquo;s wrong ·{" "}
          <a className="dl-link" href={`tel:${task.contact.phone}`}>Call</a>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {task.state === "todo" ? (
          <button className="dl-btn outline" disabled={busy || !works} onClick={() => onAct(task, "start", "Started")}>
            {works ? "Start" : "You can start on the day"}
          </button>
        ) : null}
        {task.state === "started" ? (
          <>
            <button className="dl-btn" disabled={busy || !works} onClick={() => onAct(task, "done", "Done")}>Done</button>
            {task.startedAt ? <div className="dl-meta" style={{ textAlign: "center", marginTop: 6 }}>Started {fmtTime(task.startedAt, wedding.timeZone)}</div> : null}
          </>
        ) : null}
        {task.state === "done" ? (
          <>
            <button className="dl-btn green" disabled>Done {task.doneAt ? fmtTime(task.doneAt, wedding.timeZone) : ""} ✓</button>
            <div style={{ textAlign: "center", marginTop: 6 }}>
              <button className="dl-link" style={{ minHeight: 44 }} disabled={busy} onClick={() => onAct(task, "undo", "Undone")}>Undo</button>
            </div>
          </>
        ) : null}
        {task.state === "handed_back" ? (
          <>
            <p className="dl-meta dl-struck" style={{ textAlign: "center" }}>You handed this back</p>
            <div style={{ textAlign: "center" }}>
              <button className="dl-link" style={{ minHeight: 44 }} disabled={busy} onClick={() => onAct(task, "undo", "Undone")}>Undo</button>
            </div>
          </>
        ) : null}
      </div>

      {open ? (
        <div className="dl-actions">
          <button className="dl-btn small grey" disabled={busy || !works} onClick={() => onSheet({ kind: "late", task })}>Running late</button>
          <button className="dl-btn small grey" disabled={busy} onClick={() => onSheet({ kind: "help", task })}>Need help</button>
          <button className="dl-btn small grey" disabled={busy} onClick={() => onSheet({ kind: "more", task })}>More</button>
        </div>
      ) : null}
    </section>
  );
}

function SheetView({
  sheet,
  busy,
  error,
  onClose,
  onLate,
  onHelp,
  onHandBack,
  onNote,
  onMore,
}: {
  sheet: NonNullable<Sheet>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onLate: (task: DayTask, minutes: number) => void;
  onHelp: (task: DayTask | null, reason: string, text: string) => void;
  onHandBack: (task: DayTask, reason: string) => void;
  onNote: (task: DayTask | null, text: string) => void;
  onMore: (sheet: Sheet) => void;
}) {
  const [text, setText] = useState("");
  const [reason, setReason] = useState<string>(HELP_REASONS[0]);

  return (
    <div className="dl-sheet-backdrop" onClick={onClose}>
      <div className="dl-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dl-grabber" />
        {sheet.kind === "late" ? (
          <>
            <h2>How late?</h2>
            <div className="dl-actions">
              {LATE_CHOICES.map((m) => (
                <button key={m} className="dl-btn small grey" disabled={busy} onClick={() => onLate(sheet.task, m)}>+{m} min</button>
              ))}
            </div>
            <p className="dl-meta" style={{ marginTop: 8 }}>This tells the planner. It doesn&rsquo;t move the schedule.</p>
          </>
        ) : null}
        {sheet.kind === "help" ? (
          <>
            <h2>Need help</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {HELP_REASONS.map((r) => (
                <button key={r} className={`dl-btn small ${reason === r ? "" : "grey"}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <textarea className="dl-field" style={{ marginTop: 12 }} rows={2} placeholder="Anything to add? (optional)" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy} onClick={() => onHelp(sheet.task, reason, text)}>Send</button>
            </div>
          </>
        ) : null}
        {sheet.kind === "handback" ? (
          <>
            <h2>Can&rsquo;t do it</h2>
            <p className="dl-meta">Say why, in a line. The planner will find someone else.</p>
            <input className="dl-field" style={{ marginTop: 8 }} placeholder="Why?" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy || !text.trim()} onClick={() => onHandBack(sheet.task, text)}>Hand it back</button>
            </div>
          </>
        ) : null}
        {sheet.kind === "note" ? (
          <>
            <h2>Add a note</h2>
            <input className="dl-field" placeholder="Gate is locked, using the side entrance" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy || !text.trim()} onClick={() => onNote(sheet.task, text)}>Send</button>
            </div>
          </>
        ) : null}
        {sheet.kind === "more" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <button className="dl-btn small grey" onClick={() => onMore({ kind: "handback", task: sheet.task })}>Can&rsquo;t do it</button>
            <button className="dl-btn small grey" onClick={() => onMore({ kind: "note", task: sheet.task })}>Add a note</button>
          </div>
        ) : null}
        {error ? <p className="dl-error">{error}</p> : null}
        <div style={{ marginTop: 12 }}>
          <button className="dl-link" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
