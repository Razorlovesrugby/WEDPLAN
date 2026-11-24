"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  claimOpenTask,
  markAnnouncementsSeen,
  markTaskSeen,
  recordOpened,
  removePushSubscription,
  savePushSubscription,
} from "@/server/actions/day-link-taps";
import {
  CUE_POLL_MS,
  POLL_MS,
  arrangeMyDay,
  buttonsWork,
  countdown,
  cueState,
  dayPhase,
  isChanged,
  pollInterval,
  timingPhrase,
  type MyDayTask,
} from "@/lib/day-links/my-day";
import { activeModules, tabBar } from "@/lib/day-links/modules";
import {
  afterFlush,
  enqueue,
  flushQueue,
  parseQueue,
  serialiseQueue,
  waitingLabel,
  type QueuedOp,
} from "@/lib/day-links/offline-queue";
import { HELP_REASONS, LATE_CHOICES, nextState } from "@/lib/day-links/state";
import { PHOTO_MAX_BYTES, isPhotoType, shrinkToJpeg } from "@/lib/day-links/photo";
import type { DayTask, MyDayData } from "@/server/day-links/my-day";
import { sendOp } from "./dispatch";
import { MODULE_SCREENS } from "./modules";
import { putPhoto } from "./photo-store";

type Wedding = { name: string; timeZone: string; date: string | null };
type Sheet =
  | { kind: "late"; task: DayTask }
  | { kind: "help"; task: DayTask | null }
  | { kind: "handback"; task: DayTask }
  | { kind: "note"; task: DayTask | null }
  | { kind: "done"; task: DayTask }
  | { kind: "more"; task: DayTask }
  | null;
type Toast = { text: string; undo?: () => void } | null;

function fmtTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
function fmtRange(task: Pick<DayTask, "startsAt" | "endsAt">, timeZone: string) {
  return `${fmtTime(task.startsAt, timeZone)} – ${fmtTime(task.endsAt, timeZone)}`;
}
function fmtDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* haptics are a nicety */
  }
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
  return { id: t.id, title: t.title, startsAt: t.startsAt, endsAt: t.endsAt, state: t.state, updatedAt: t.updatedAt, seenAt: t.seenAt, lateMinutes: t.lateMinutes };
}

/** What the screen shows while taps wait to send: the loaded tasks with the queue replayed over them. */
function withQueued(tasks: DayTask[], queue: readonly QueuedOp[]): DayTask[] {
  const out = tasks.map((t) => ({ ...t, steps: t.steps.map((s) => ({ ...s })) }));
  const byId = new Map(out.map((t) => [t.id, t]));
  for (const op of queue) {
    if (op.name === "setTaskState") {
      const [itemId, action, tappedAt] = op.args as [string, "start" | "done" | "undo", string];
      const task = byId.get(itemId);
      const target = task ? nextState({ state: task.state, startedAt: task.startedAt }, action) : null;
      if (task && target) {
        task.state = target;
        if (action === "start") task.startedAt = tappedAt;
        if (action === "done") task.doneAt = tappedAt;
        if (action === "undo") task.doneAt = null;
      }
    } else if (op.name === "handBack") {
      const task = byId.get(op.args[0] as string);
      if (task) task.state = "handed_back";
    } else if (op.name === "reportLate") {
      const task = byId.get(op.args[0] as string);
      if (task) task.lateMinutes = op.args[1] as number;
    } else if (op.name === "tickStep") {
      const [stepId, ticked] = op.args as [string, boolean];
      for (const task of out) for (const step of task.steps) if (step.id === stepId) step.ticked = ticked;
    } else if (op.name === "confirmTasks") {
      for (const id of op.args[0] as string[]) {
        const task = byId.get(id);
        if (task) task.confirmedAt = op.tappedAt;
      }
    }
  }
  return out;
}

export function MyDayView({
  token,
  helperName,
  wedding,
  initial,
  vapidKey,
  readOnly = false,
}: {
  token: string;
  helperName: string;
  wedding: Wedding;
  initial: MyDayData;
  vapidKey: string | null;
  /** "See what they see": nothing is recorded and no tap is sent. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const queueKey = `dl-queue-${token.slice(0, 12)}`;
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [welcomed, setWelcomed] = useState(true);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [online, setOnline] = useState(true);
  const [allSent, setAllSent] = useState(false);
  const [tab, setTab] = useState("my_day");
  const [viewer, setViewer] = useState<{ files: DayTask["files"]; index: number } | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const flushing = useRef(false);
  const seenAnnouncements = useRef(new Set<string>());
  const data = initial;

  const tasks = useMemo(() => withQueued(data.tasks, queue), [data.tasks, queue]);
  const modules = useMemo(() => activeModules(data.modules), [data.modules]);
  const tabs = useMemo(() => tabBar(modules), [modules]);

  // First open on this device (§6.1), the "opened" row, the saved queue and the service worker.
  useEffect(() => {
    try {
      setWelcomed(localStorage.getItem(`dl-welcomed-${token.slice(0, 12)}`) === "1");
      setQueue(parseQueue(localStorage.getItem(queueKey)));
    } catch {
      setWelcomed(false);
    }
    setOnline(navigator.onLine);
    if (!readOnly) {
      void recordOpened(token, deviceId()).catch(() => undefined);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/day-sw.js", { scope: "/d/" })
          .then((reg) => reg.pushManager?.getSubscription())
          .then((sub) => setPushOn(Boolean(sub)))
          .catch(() => undefined);
      }
    }
  }, [token, queueKey, readOnly]);

  useEffect(() => {
    const reload = () => {
      try {
        setQueue(parseQueue(localStorage.getItem(queueKey)));
      } catch {
        /* nothing to reload */
      }
    };
    window.addEventListener("dl-queue", reload);
    return () => window.removeEventListener("dl-queue", reload);
  }, [queueKey]);

  const saveQueue = useCallback(
    (next: QueuedOp[]) => {
      setQueue(next);
      try {
        localStorage.setItem(queueKey, serialiseQueue(next));
      } catch {
        /* a full or blocked store only loses persistence across a restart */
      }
    },
    [queueKey],
  );

  // Send what is waiting, in order, when the connection returns (§6.8).
  const flush = useCallback(async () => {
    if (flushing.current || readOnly) return;
    let current: QueuedOp[] = [];
    try {
      current = parseQueue(localStorage.getItem(queueKey));
    } catch {
      return;
    }
    if (current.length === 0) return;
    flushing.current = true;
    try {
      const result = await flushQueue(current, (op) => sendOp(token, op));
      let stored: QueuedOp[] = [];
      try {
        stored = parseQueue(localStorage.getItem(queueKey));
      } catch {
        stored = current;
      }
      saveQueue(afterFlush(stored, current, result.remaining));
      if (result.rejected.length > 0) setError(result.rejected[0]!.error);
      if (result.sent > 0 && result.remaining.length === 0) {
        setAllSent(true);
        setTimeout(() => setAllSent(false), 3000);
      }
      if (result.sent > 0 || result.rejected.length > 0) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [queueKey, readOnly, router, saveQueue, token]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const retry = setInterval(() => void flush(), 10_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(retry);
    };
  }, [flush]);

  // The clock and the poll: 15 seconds, or 3 while a cue is live (§6.9, §6.16).
  const interval = pollInterval(
    tasks.map((t) => ({ startsAt: t.startsAt, isCue: t.isCue, cueCalledAt: t.cueCalledAt, state: t.state })),
    now,
  );
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), interval === CUE_POLL_MS ? 1000 : POLL_MS);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    }, interval);
    const visible = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        if (navigator.onLine) router.refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router, interval]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Opening the page marks announcements seen (§6.13).
  useEffect(() => {
    if (readOnly) return;
    const fresh = data.announcements.filter((a) => !seenAnnouncements.current.has(a.id)).map((a) => a.id);
    if (fresh.length === 0) return;
    fresh.forEach((id) => seenAnnouncements.current.add(id));
    void markAnnouncementsSeen(token, fresh).catch(() => undefined);
  }, [data.announcements, readOnly, token]);

  const arranged = useMemo(() => arrangeMyDay(tasks.map(toTask), now), [tasks, now]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const phase = dayPhase(tasks, now, wedding.timeZone);
  const openTask = openId ? (byId.get(openId) ?? null) : null;
  const nowTask = arranged.now ? (byId.get(arranged.now.id) ?? null) : null;
  const openHelp = data.help.find((h) => !h.answeredAt);
  const answeredHelp = data.help.find((h) => h.answeredAt && h.answer);
  const unconfirmed = tasks.filter((t) => !t.confirmedAt && t.state === "todo" && phase !== "after");

  // A cue turning to Go buzzes the phone (§6.16).
  const goIds = tasks.filter((t) => cueState(t, now).kind === "go").map((t) => t.id).join(",");
  const lastGo = useRef("");
  useEffect(() => {
    if (goIds && goIds !== lastGo.current) buzz([300, 100, 300]);
    lastGo.current = goIds;
  }, [goIds]);

  /**
   * One tap: sent at once when there is a signal, kept on the device when
   * there isn't (§6.8). Resolves true when it was sent or kept.
   */
  const tap = useCallback(
    async (name: string, args: unknown[], label: string, done: string, undo?: () => void, haptic?: number | number[]): Promise<boolean> => {
      if (readOnly) {
        setToast({ text: "Preview only. Nothing was sent." });
        return false;
      }
      setError(null);
      if (haptic) buzz(haptic);
      const op: QueuedOp = { id: crypto.randomUUID(), name, args, tappedAt: new Date().toISOString(), label };
      const waiting = parseQueue(localStorage.getItem(queueKey));
      if (waiting.length > 0 || !navigator.onLine) {
        saveQueue(enqueue(waiting, op));
        setToast({ text: `${done} · saved, will send when you're back online`, undo });
        return true;
      }
      setBusy(true);
      try {
        const outcome = await sendOp(token, op);
        if (outcome.kind === "sent") {
          setToast({ text: `${done} · sent to the planner ✓`, undo });
          router.refresh();
          return true;
        }
        if (outcome.kind === "rejected") {
          setError(outcome.error);
          return false;
        }
        // Re-read: a flush may have changed the stored queue while we waited on the network.
        saveQueue(enqueue(parseQueue(localStorage.getItem(queueKey)), op));
        setToast({ text: `${done} · saved, will send when you're back online`, undo });
        return true;
      } finally {
        setBusy(false);
      }
    },
    [queueKey, readOnly, router, saveQueue, token],
  );

  function act(task: DayTask, action: "start" | "done" | "undo", label: string, photoKey: string | null = null) {
    const haptic = action === "start" ? 10 : action === "done" ? [20, 60, 20] : undefined;
    const args: unknown[] = [task.id, action, new Date().toISOString()];
    if (photoKey) args.push(photoKey);
    void tap("setTaskState", args, `${label} ${task.title}`, label, action === "undo" ? undefined : () => act(task, "undo", "Undone"), haptic);
  }

  function open(task: DayTask) {
    setOpenId(task.id);
    if (!readOnly) void markTaskSeen(token, task.id).catch(() => undefined);
  }

  async function claim(taskId: string) {
    if (readOnly) return setToast({ text: "Preview only. Nothing was sent." });
    setBusy(true);
    setError(null);
    try {
      const result = await claimOpenTask(token, taskId, new Date().toISOString());
      if (!result.ok) setError(result.error);
      else {
        setToast({ text: "You're on it · sent to the planner ✓" });
        router.refresh();
      }
    } catch {
      setError("No signal. Try again when you're back online.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePush() {
    if (!vapidKey || readOnly) return;
    try {
      const reg = await navigator.serviceWorker.register("/day-sw.js", { scope: "/d/" });
      const existing = await reg.pushManager.getSubscription();
      if (pushOn && existing) {
        await removePushSubscription(token, existing.endpoint);
        await existing.unsubscribe();
        setPushOn(false);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setError("Notifications are blocked for this page. Allow them in your phone's settings.");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(vapidKey) });
      const json = sub.toJSON();
      const result = await savePushSubscription(token, {
        endpoint: json.endpoint!,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (!result.ok) return setError(result.error);
      setPushOn(true);
    } catch {
      setError("Reminders aren't available on this phone. On an iPhone, add this page to your home screen first.");
    }
  }

  if (!welcomed && !readOnly) {
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
              } catch {
                /* shown again next time */
              }
              setWelcomed(true);
            }}
          >
            See my jobs
          </button>
        </div>
      </div>
    );
  }

  const tickStepOp = (stepId: string, ticked: boolean) =>
    void tap("tickStep", [stepId, ticked, new Date().toISOString()], ticked ? "Step done" : "Step undone", ticked ? "Step done" : "Step undone");

  const strip =
    queue.length > 0 || !online ? (
      <div className="dl-strip" role="status">{queue.length > 0 ? waitingLabel(queue.length) : "Offline"}</div>
    ) : allSent ? (
      <div className="dl-strip ok" role="status">All sent ✓</div>
    ) : null;

  const moduleTab = tab !== "my_day" ? tabs.find((t) => t.key === tab) : null;
  const moduleOf = moduleTab ? modules.find((m) => m.tabs.some((t) => t.key === moduleTab.key)) : null;
  const Screen = moduleOf ? MODULE_SCREENS[moduleOf.key] : undefined;

  const tabBarEl =
    tabs.length > 0 ? (
      <nav className="dl-tabs" aria-label="Sections">
        {tabs.map((t) => (
          <button key={t.key} className={t.key === tab ? "on" : undefined} aria-current={t.key === tab} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
    ) : null;

  if (Screen && moduleTab) {
    return (
      <>
        {strip}
        <div className="dl-wrap">
          <Screen token={token} tab={moduleTab.key} config={{}} />
        </div>
        {tabBarEl}
      </>
    );
  }

  const taskCard = (task: DayTask, heading?: string, full?: boolean) => (
    <TaskCard
      task={task}
      now={now}
      wedding={wedding}
      busy={busy}
      heading={heading}
      full={full}
      modules={modules.map((m) => m.key)}
      onAct={act}
      onSheet={setSheet}
      onOpen={full ? undefined : () => open(task)}
      onTick={tickStepOp}
      onPhoto={(i) => setViewer({ files: task.files, index: i })}
      onOpenModule={(key) => {
        const m = modules.find((x) => x.key === key);
        if (m?.tabs[0]) setTab(m.tabs[0].key);
      }}
    />
  );

  if (openTask) {
    return (
      <>
        {strip}
        <div className="dl-bar">{openTask.title}</div>
        <div className="dl-wrap">
          <button className="dl-link" style={{ minHeight: 44, marginTop: 8 }} onClick={() => setOpenId(null)}>
            ‹ My day
          </button>
          {taskCard(openTask, undefined, true)}
          {error ? <p className="dl-error">{error}</p> : null}
        </div>
        {renderOverlays()}
        {tabBarEl}
      </>
    );
  }

  const pinned = data.announcements.filter((a) => a.important && !a.acknowledged);
  const rest = data.announcements.filter((a) => !(a.important && !a.acknowledged)).slice(0, 3);

  return (
    <>
      {strip}
      <div className="dl-wrap">
        <h1 className="dl-large">My day</h1>
        <p className="dl-sub">
          {wedding.name} · {tasks[0] ? fmtDay(tasks[0].startsAt, wedding.timeZone) : "No jobs yet"} · {fmtTime(now.toISOString(), wedding.timeZone)}
        </p>

        {phase === "before" && tasks[0] ? (
          <p className="dl-card dl-sub">You can start these on the day ({fmtDay(tasks[0].startsAt, wedding.timeZone)}).</p>
        ) : null}
        {phase === "after" ? <p className="dl-card">Thanks for helping. This link stops working a week after the wedding.</p> : null}

        {tasks
          .filter((t) => t.id !== nowTask?.id && cueState(t, now).kind !== "none")
          .map((t) => {
            const cue = cueState(t, now);
            return (
              <button key={t.id} className={`dl-cue ${cue.kind}`} style={{ display: "block", width: "100%", textAlign: "left", border: 0, font: "inherit", marginTop: 16 }} onClick={() => open(t)}>
                {cue.kind === "standby" ? `Standby · ${t.title} · ${countdown(cue.secondsToStart)}` : cue.kind === "go" ? `Go now · ${t.title}` : ""}
              </button>
            );
          })}

        {pinned.map((a) => (
          <div key={a.id} className="dl-banner" style={{ background: "color-mix(in srgb, var(--dl-orange) 16%, var(--dl-card))" }}>
            <strong>{a.text}</strong>
            <div style={{ marginTop: 8 }}>
              <button
                className="dl-btn small grey"
                disabled={busy}
                onClick={() => void tap("acknowledgeAnnouncement", [a.id, new Date().toISOString()], "OK", "Got it")}
              >
                OK, got it
              </button>
            </div>
          </div>
        ))}
        {rest.map((a) => (
          <div key={a.id} className="dl-card" style={{ padding: 14 }}>
            <div>{a.text}</div>
            <div className="dl-meta">{fmtTime(a.sentAt, wedding.timeZone)}</div>
          </div>
        ))}

        {openHelp ? (
          <div className="dl-banner">
            <strong>Help requested</strong> · waiting
            <div className="dl-meta">{openHelp.reason}</div>
          </div>
        ) : answeredHelp ? (
          <div className="dl-banner" style={{ background: "var(--dl-card)" }}>
            <strong>{answeredHelp.answer}</strong>
            <div className="dl-meta">About: {answeredHelp.reason}</div>
          </div>
        ) : null}

        {phase === "day" && !data.arrivedAt ? (
          <div className="dl-card">
            <div className="dl-headline">I&rsquo;m here</div>
            <div className="dl-meta">Tap when you arrive.</div>
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn small" disabled={busy} onClick={() => void tap("markArrived", [new Date().toISOString()], "I'm here", "Arrived")}>
                I&rsquo;m here
              </button>
            </div>
          </div>
        ) : null}

        {unconfirmed.length > 0 ? (
          <div className="dl-card">
            <div className="dl-headline">{unconfirmed.some((t) => t.confirmedAt === null && t.seenAt) ? "Changed or new jobs" : "New jobs"}</div>
            <div className="dl-meta">Let the planner know you&rsquo;ve seen {unconfirmed.length === 1 ? "this one" : "these"}.</div>
            <div style={{ marginTop: 12 }}>
              <button
                className="dl-btn small grey"
                disabled={busy}
                onClick={() => void tap("confirmTasks", [unconfirmed.map((t) => t.id)], "Got it", "Got it")}
              >
                {unconfirmed.length > 1 ? "Got it to all" : "Got it"}
              </button>
            </div>
          </div>
        ) : null}

        {nowTask ? (
          taskCard(
            nowTask,
            nowTask.state === "started" || (Date.parse(nowTask.startsAt) <= now.getTime() && now.getTime() < Date.parse(nowTask.endsAt)) ? "Now" : "Next",
          )
        ) : (
          <p className="dl-card dl-sub">You have no jobs yet. Check back later.</p>
        )}
        {error ? <p className="dl-error">{error}</p> : null}

        {data.openTasks.length > 0 ? (
          <>
            <h2 className="dl-foot">Can you help?</h2>
            <div className="dl-group">
              {data.openTasks.map((t) => (
                <div key={t.id} className="dl-row" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span>
                    <span className="dl-headline">{t.title}</span>
                    <span className="dl-meta" style={{ display: "block" }}>
                      {fmtRange(t, wedding.timeZone)} · {t.places} {t.places === 1 ? "place" : "places"} · {t.groupName}
                    </span>
                  </span>
                  <button className="dl-btn small" style={{ width: "auto" }} disabled={busy} onClick={() => void claim(t.id)}>
                    I&rsquo;ll do it
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

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
                      {task.state === "done" && task.doneAt ? `Done ${fmtTime(task.doneAt, wedding.timeZone)} ✓` : "You handed this back"}
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

        {vapidKey && !readOnly ? (
          <label className="dl-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input type="checkbox" checked={pushOn} onChange={() => void togglePush()} style={{ width: 24, height: 24 }} />
            <span>
              Remind me 10 minutes before each job
              <span className="dl-meta" style={{ display: "block" }}>On an iPhone this works once the page is on your home screen.</span>
            </span>
          </label>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <button className="dl-btn small grey" onClick={() => setSheet({ kind: "help", task: null })}>
            Need help with something else
          </button>
        </div>
      </div>
      {renderOverlays()}
      {tabBarEl}
    </>
  );

  function renderOverlays() {
    return (
      <>
        {sheet ? (
          <SheetView
            sheet={sheet}
            busy={busy}
            groupMates={data.groupMates}
            onClose={() => setSheet(null)}
            onLate={(task, minutes) => void tap("reportLate", [task.id, minutes, new Date().toISOString()], `Running late +${minutes}`, `Running late +${minutes}`).then((ok) => ok && setSheet(null))}
            onHelp={(task, reason, text, photo) =>
              void tap("requestHelp", [task?.id ?? null, reason, text, new Date().toISOString(), photo], "Help", "Help requested", undefined, [30, 60, 30]).then((ok) => ok && setSheet(null))
            }
            onHandBack={(task, reason, suggestion) =>
              void tap("handBack", [task.id, reason, new Date().toISOString(), suggestion || undefined], `Hand back ${task.title}`, "Handed back", () => act(task, "undo", "Undone")).then((ok) => ok && setSheet(null))
            }
            onNote={(task, text, photo) =>
              void tap("addDayNote", [task?.id ?? null, text, new Date().toISOString(), photo], "Note", "Note sent").then((ok) => ok && setSheet(null))
            }
            onDone={(task, photo) => {
              act(task, "done", "Done", photo);
              setSheet(null);
            }}
            onMore={(next) => setSheet(next)}
            error={error}
          />
        ) : null}
        {viewer ? <PhotoViewer files={viewer.files} index={viewer.index} onClose={() => setViewer(null)} /> : null}
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

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function TaskCard({
  task,
  now,
  wedding,
  busy,
  heading,
  full,
  modules,
  onAct,
  onSheet,
  onOpen,
  onTick,
  onPhoto,
  onOpenModule,
}: {
  task: DayTask;
  now: Date;
  wedding: Wedding;
  busy: boolean;
  heading?: string;
  full?: boolean;
  modules: string[];
  onAct: (task: DayTask, action: "start" | "done" | "undo", label: string) => void;
  onSheet: (sheet: Sheet) => void;
  onOpen?: () => void;
  onTick: (stepId: string, ticked: boolean) => void;
  onPhoto: (index: number) => void;
  onOpenModule: (key: string) => void;
}) {
  const works = buttonsWork({ startsAt: task.startsAt }, now, wedding.timeZone);
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(task.address || task.location || "")}`;
  const open = task.state === "todo" || task.state === "started";
  const cue = cueState(task, now);
  const images = task.files.filter((f) => f.mime.startsWith("image/"));

  return (
    <section className="dl-card" aria-label={task.title}>
      {heading ? <div className="dl-meta" style={{ textTransform: "uppercase", fontWeight: 600 }}>{heading}</div> : null}
      {cue.kind === "standby" ? (
        <div className="dl-cue standby">Standby · {countdown(cue.secondsToStart)}</div>
      ) : cue.kind === "go" ? (
        <div className="dl-cue go">Go now · started {countdown(cue.secondsSince)} ago</div>
      ) : null}
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
          <a className="dl-link" href={mapsHref} target="_blank" rel="noreferrer">{task.location}</a>
          {task.address ? <div className="dl-meta">{task.address}</div> : null}
        </div>
      ) : null}
      {task.isLead ? (
        <div className="dl-meta" style={{ marginTop: 8 }}>You&rsquo;re leading this{task.others.length ? `, with ${task.others.join(", ")}` : ""}</div>
      ) : task.others.length > 0 ? (
        <div className="dl-meta" style={{ marginTop: 8 }}>
          {task.leadName ? `${task.leadName} is leading this · ` : ""}With {task.others.join(", ")}
        </div>
      ) : null}
      {task.instructions ? <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{task.instructions}</p> : null}

      {images.length > 0 || task.files.length > images.length ? (
        <div className="dl-thumbs">
          {task.files.map((f, i) =>
            f.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={f.url} alt={f.caption ?? "Reference photo"} onClick={() => onPhoto(i)} />
            ) : (
              <a key={f.id} className="dl-link" href={f.url} target="_blank" rel="noreferrer">{f.caption ?? "Open the file"}</a>
            ),
          )}
        </div>
      ) : null}

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
          Ask {task.contact.label} if anything&rsquo;s wrong · <a className="dl-link" href={`tel:${task.contact.phone}`}>Call</a>
        </div>
      ) : null}
      {task.opensModule && modules.includes(task.opensModule) ? (
        <div style={{ marginTop: 12 }}>
          <button className="dl-btn small grey" onClick={() => onOpenModule(task.opensModule!)}>Open the {task.opensModule.replace(/_/g, " ")}</button>
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
            <button
              className="dl-btn"
              disabled={busy || !works}
              onClick={() => (task.photoOnDone ? onSheet({ kind: "done", task }) : onAct(task, "done", "Done"))}
            >
              {task.photoOnDone ? "Done — add a photo" : "Done"}
            </button>
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

/** A photo from the camera or library, shrunk and kept on the device until sent. */
function PhotoField({ label, onKey }: { label: string; onKey: (key: string | null) => void }) {
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 12 }}>
      <label className="dl-btn small grey" style={{ cursor: "pointer" }}>
        {name ? `Photo added · change` : label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setProblem(null);
            if (!isPhotoType(file.type) && !file.type.startsWith("image/")) return setProblem("That isn't a photo.");
            if (file.size > PHOTO_MAX_BYTES) return setProblem("That photo is too big. Anything under 10 MB is fine.");
            const blob = await shrinkToJpeg(file);
            if (!blob) return setProblem("This phone can't read that photo.");
            try {
              onKey(await putPhoto(blob));
              setName(file.name);
            } catch {
              setProblem("This phone couldn't keep the photo.");
            }
          }}
        />
      </label>
      {problem ? <p className="dl-error">{problem}</p> : null}
    </div>
  );
}

function PhotoViewer({ files, index, onClose }: { files: DayTask["files"]; index: number; onClose: () => void }) {
  const images = files.filter((f) => f.mime.startsWith("image/"));
  const start = Math.max(0, images.findIndex((f) => f.id === files[index]?.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);
  return (
    <div className="dl-viewer" role="dialog" aria-modal="true" aria-label="Photos">
      <button className="dl-viewer-close" onClick={onClose}>Close</button>
      <div className="dl-viewer-strip" ref={ref}>
        {images.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f.id} src={f.url} alt={f.caption ?? "Reference photo"} />
        ))}
      </div>
    </div>
  );
}

function SheetView({
  sheet,
  busy,
  error,
  groupMates,
  onClose,
  onLate,
  onHelp,
  onHandBack,
  onNote,
  onDone,
  onMore,
}: {
  sheet: NonNullable<Sheet>;
  busy: boolean;
  error: string | null;
  groupMates: string[];
  onClose: () => void;
  onLate: (task: DayTask, minutes: number) => void;
  onHelp: (task: DayTask | null, reason: string, text: string, photo: string | null) => void;
  onHandBack: (task: DayTask, reason: string, suggestion: string) => void;
  onNote: (task: DayTask | null, text: string, photo: string | null) => void;
  onDone: (task: DayTask, photo: string | null) => void;
  onMore: (sheet: Sheet) => void;
}) {
  const [text, setText] = useState("");
  const [reason, setReason] = useState<string>(HELP_REASONS[0]);
  const [suggestion, setSuggestion] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

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
        {sheet.kind === "done" ? (
          <>
            <h2>Show it&rsquo;s done</h2>
            <p className="dl-meta">A photo helps the couple see it. It&rsquo;s never required.</p>
            <PhotoField label="Take a photo" onKey={setPhoto} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy} onClick={() => onDone(sheet.task, photo)}>{photo ? "Done" : "Done without a photo"}</button>
            </div>
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
            <PhotoField label="Show what's wrong" onKey={setPhoto} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy} onClick={() => onHelp(sheet.task, reason, text, photo)}>Send</button>
            </div>
          </>
        ) : null}
        {sheet.kind === "handback" ? (
          <>
            <h2>Can&rsquo;t do it</h2>
            <p className="dl-meta">Say why, in a line. The planner will find someone else.</p>
            <input className="dl-field" style={{ marginTop: 8 }} placeholder="Why?" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
            {groupMates.length > 0 ? (
              <select className="dl-field" style={{ marginTop: 8 }} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} aria-label="Who could take it?">
                <option value="">Who could take it? (optional)</option>
                {groupMates.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy || !text.trim()} onClick={() => onHandBack(sheet.task, text, suggestion)}>Hand it back</button>
            </div>
          </>
        ) : null}
        {sheet.kind === "note" ? (
          <>
            <h2>Add a note</h2>
            <input className="dl-field" placeholder="Gate is locked, using the side entrance" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            <PhotoField label="Add a photo" onKey={setPhoto} />
            <div style={{ marginTop: 12 }}>
              <button className="dl-btn" disabled={busy || !text.trim()} onClick={() => onNote(sheet.task, text, photo)}>Send</button>
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
