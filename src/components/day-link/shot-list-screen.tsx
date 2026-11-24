"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadShotModule, type ShotModuleData, type ShotModuleSection } from "@/server/actions/shot-module";
import { callUp, canGo, type OrderShot } from "@/lib/shots/order";
import { behindSchedule, counts, missedShots, nextShot } from "@/lib/shots/progress";
import { parseQueue, enqueue, serialiseQueue, type QueuedOp } from "@/lib/day-links/offline-queue";
import type { ShotItem } from "@/lib/shots/model";
import { sendOp } from "./dispatch";
import type { ModuleScreenProps } from "./modules";

type Status = ShotItem["status"];
type Override = { status: Status; at: string };

function fmtTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

/**
 * The Shot list module (spec 52 §5): Now, All shots and Faces. The status a
 * tap sets is sent at once or, with no signal, kept in the same device queue
 * as the rest of the link and sent in order. The latest tap wins on the server.
 */
export function ShotListScreen({ token, tab }: ModuleScreenProps) {
  const queueKey = `dl-queue-${token.slice(0, 12)}`;
  const [data, setData] = useState<ShotModuleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "left" | "must" | "missed">("all");
  const [now, setNow] = useState(() => new Date());
  const lastTap = useRef<{ shotId: string; previous: Status } | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await loadShotModule(token);
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
    } catch {
      /* offline: keep showing what we have */
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 15_000);
    const clock = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  const sections: ShotModuleSection[] = useMemo(
    () =>
      (data?.sections ?? []).map((sec) => ({
        ...sec,
        shots: sec.shots.map((s) => {
          const o = overrides[s.id];
          return o && (!s.statusAt || Date.parse(o.at) > Date.parse(s.statusAt)) ? { ...s, status: o.status, statusAt: o.at } : s;
        }),
      })),
    [data, overrides],
  );

  const current =
    sections.find((s) => s.id === sectionId) ??
    sections.find((s) => s.startsAt && s.endsAt && now >= new Date(s.startsAt) && now < new Date(s.endsAt) && nextShot(s.shots)) ??
    sections.find((s) => nextShot(s.shots)) ??
    sections[0] ??
    null;

  /** Sets a status: sent now, or kept on the phone until the signal returns. */
  const setStatus = useCallback(
    async (shot: ShotItem, status: Status) => {
      const at = new Date().toISOString();
      lastTap.current = { shotId: shot.id, previous: shot.status };
      setCanUndo(status !== "todo");
      setOverrides((o) => ({ ...o, [shot.id]: { status, at } }));
      const op: QueuedOp = { id: crypto.randomUUID(), name: "setShotStatus", args: [shot.id, status, at], tappedAt: at, label: `${shot.title}: ${status}` };
      let waiting: QueuedOp[] = [];
      try {
        waiting = parseQueue(localStorage.getItem(queueKey));
      } catch {
        /* no storage: send directly */
      }
      if (waiting.length === 0 && navigator.onLine) {
        const outcome = await sendOp(token, op);
        if (outcome.kind === "sent") {
          if (status === "taken") navigator.vibrate?.([20, 60, 20]);
          void refresh();
          return;
        }
        if (outcome.kind === "rejected") {
          setError(outcome.error);
          setOverrides((o) => {
            const { [shot.id]: _drop, ...rest } = o;
            return rest;
          });
          return;
        }
      }
      try {
        localStorage.setItem(queueKey, serialiseQueue(enqueue(waiting, op)));
        window.dispatchEvent(new Event("dl-queue"));
      } catch {
        setError("Couldn't keep that tap on this phone. Try again.");
      }
    },
    [queueKey, refresh, token],
  );

  if (!data) return <p className="dl-card dl-sub">{error ?? "Loading the shot list…"}</p>;
  if (sections.length === 0) return <p className="dl-card dl-sub">No shots have been added yet.</p>;

  const couple = new Set(sections.flatMap((s) => s.shots.flatMap((sh) => sh.people.filter((p) => p.kind === "person").map((p) => p.key))));

  if (tab === "shot_faces") {
    return (
      <>
        <h1 className="dl-large">Faces</h1>
        {data.faces.length === 0 ? <p className="dl-card dl-sub">No photos or relationships added yet.</p> : null}
        <div className="dl-group" style={{ marginTop: 12 }}>
          {data.faces.map((f) => (
            <div key={f.id} className="dl-row" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {f.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.photoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", flex: "none" }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--dl-fill)", flex: "none" }} />
              )}
              <div>
                <div className="dl-headline">{f.name}</div>
                {f.relationship ? <div className="dl-meta">{f.relationship}</div> : null}
                {f.vendorNote ? <div style={{ color: "var(--dl-orange)", fontSize: "0.9375rem" }}>{f.vendorNote}</div> : null}
                {f.shots.length ? <div className="dl-meta">In: {f.shots.join(", ")}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const picker =
    sections.length > 1 ? (
      <select className="dl-field" aria-label="Section" value={current?.id ?? ""} onChange={(e) => setSectionId(e.target.value)} style={{ marginTop: 8 }}>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {counts(s.shots).taken} of {s.shots.length}
          </option>
        ))}
      </select>
    ) : null;

  if (tab === "shot_all") {
    return (
      <>
        <h1 className="dl-large">All shots</h1>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {(["all", "left", "must", "missed"] as const).map((f) => (
            <button key={f} className={`dl-btn small ${filter === f ? "" : "grey"}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "left" ? "Left" : f === "must" ? "Must-haves" : "Missed"}
            </button>
          ))}
        </div>
        {error ? <p className="dl-error">{error}</p> : null}
        {sections.map((sec) => {
          const missed = new Set(missedShots(sec.shots, sec.endsAt, now).map((s) => s.id));
          const shown = sec.shots.filter((s) =>
            filter === "left" ? s.status === "todo" || s.status === "later" : filter === "must" ? s.mustHave : filter === "missed" ? missed.has(s.id) : true,
          );
          if (shown.length === 0) return null;
          return (
            <section key={sec.id}>
              <h2 className="dl-foot">{sec.name} · {counts(sec.shots).taken} of {sec.shots.length}</h2>
              <div className="dl-group">
                {shown.map((s) => (
                  <button key={s.id} className="dl-row" onClick={() => void setStatus(s, s.status === "taken" ? "todo" : "taken")}>
                    <div className={s.status === "taken" ? "dl-headline dl-struck" : "dl-headline"}>
                      {s.status === "taken" ? "✓ " : ""}
                      {s.mustHave ? "★ " : ""}
                      {s.title}
                    </div>
                    <div className="dl-meta">
                      {s.people.map((p) => p.name).join(", ") || "Nobody listed"}
                      {s.status === "skipped" ? " · skipped" : s.status === "later" ? " · later" : ""}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </>
    );
  }

  // Now
  if (!current) return null;
  const order: OrderShot[] = current.shots.map((s) => ({ id: s.id, people: s.people.map((p) => p.key) }));
  const next = nextShot(current.shots);
  const index = next ? current.shots.findIndex((s) => s.id === next.id) : -1;
  const lastIndex = index - 1;
  const byKey = new Map(current.shots.flatMap((s) => s.people).map((p) => [p.key, p.name]));
  const names = (keys: string[]) => keys.map((k) => byKey.get(k) ?? k);
  const progress = counts(current.shots);
  const behind = behindSchedule(current.shots, current.startsAt, current.endsAt, now);
  const upcoming = next ? current.shots.filter((s) => s.id !== next.id && (s.status === "todo" || s.status === "later")).slice(0, 3) : [];

  return (
    <>
      <h1 className="dl-large">Now</h1>
      {picker}
      <p className="dl-sub" style={{ marginTop: 8 }}>
        {current.name} · {progress.taken} of {progress.total} taken
        {current.startsAt && current.endsAt ? ` · ${fmtTime(current.startsAt, data.timeZone)}–${fmtTime(current.endsAt, data.timeZone)}` : ""}
        {current.startsAt ? (behind ? " · behind" : " · on time") : ""}
      </p>
      {error ? <p className="dl-error">{error}</p> : null}
      {!next ? (
        <div className="dl-card">
          <div className="dl-title1">All done here</div>
          <div className="dl-meta">{progress.taken} taken{progress.skipped ? ` · ${progress.skipped} skipped` : ""}</div>
        </div>
      ) : (
        <section className="dl-card">
          {next.mustHave ? <span className="dl-capsule">Must-have</span> : null}
          <div className="dl-title1" style={{ marginTop: 4 }}>{next.title}</div>
          <div className="dl-meta">{next.people.map((p) => p.name).join(", ") || "Nobody listed"}</div>
          {next.note ? <p style={{ marginTop: 8, color: "var(--dl-orange)" }}>{next.note}</p> : null}
          {next.referenceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={next.referenceUrl} alt="Reference" style={{ width: "100%", borderRadius: 12, marginTop: 10 }} />
          ) : null}
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {callUp(order, index, couple).length > 0 ? <div><strong>Call up:</strong> {names(callUp(order, index, couple)).join(", ")}</div> : null}
            {lastIndex >= 0 && canGo(order, index, couple).length > 0 ? <div><strong>Can go:</strong> {names(canGo(order, index, couple)).join(", ")}</div> : null}
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="dl-btn" style={{ minHeight: 64, fontSize: "1.25rem" }} onClick={() => void setStatus(next, "taken")}>Taken</button>
          </div>
          <div className="dl-actions">
            <button className="dl-btn small grey" disabled={!canUndo} onClick={() => lastTap.current && void setStatus(current.shots.find((s) => s.id === lastTap.current!.shotId)!, lastTap.current.previous).then(() => setCanUndo(false))}>Undo</button>
            <button className="dl-btn small grey" onClick={() => void setStatus(next, "later")}>Later</button>
            <button className="dl-btn small grey" onClick={() => void setStatus(next, "skipped")}>Skip</button>
          </div>
        </section>
      )}
      {upcoming.length > 0 ? (
        <>
          <h2 className="dl-foot">Up next</h2>
          <div className="dl-group">
            {upcoming.map((s) => (
              <div key={s.id} className="dl-row">
                <div className="dl-headline">{s.title}</div>
                <div className="dl-meta">{s.people.map((p) => p.name).join(", ")}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
