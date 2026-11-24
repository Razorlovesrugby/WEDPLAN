"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadSeatingModule, type SeatingModuleData, type SeatingModuleGuest } from "@/server/actions/seating-module";
import { enqueue, parseQueue, serialiseQueue, type QueuedOp } from "@/lib/day-links/offline-queue";
import { sendOp } from "./dispatch";
import type { ModuleScreenProps } from "./modules";

/**
 * The Seating module (spec 53 Part I): find a seat in two letters, tick a guest
 * as arrived, move a guest to a spare chair, seat a walk-in as a reserved seat.
 * Taps go through the link's offline queue like every other write.
 */
export function SeatingModuleScreen({ token }: ModuleScreenProps) {
  const queueKey = `dl-queue-${token.slice(0, 12)}`;
  const [data, setData] = useState<SeatingModuleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [arrivedOverride, setArrivedOverride] = useState<Record<string, boolean>>({});
  const [moving, setMoving] = useState<SeatingModuleGuest | null>(null);
  const [walkIn, setWalkIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await loadSeatingModule(token);
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
    } catch {
      /* offline: keep what we have */
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 15_000);
    return () => clearInterval(poll);
  }, [refresh]);

  /** Sent now, or kept on the phone until there is a signal. */
  const send = useCallback(
    async (name: string, args: unknown[], label: string): Promise<boolean> => {
      const at = new Date().toISOString();
      const op: QueuedOp = { id: crypto.randomUUID(), name, args: [...args, at], tappedAt: at, label };
      let waiting: QueuedOp[] = [];
      try {
        waiting = parseQueue(localStorage.getItem(queueKey));
      } catch {
        /* no storage */
      }
      if (waiting.length === 0 && navigator.onLine) {
        const outcome = await sendOp(token, op);
        if (outcome.kind === "sent") {
          void refresh();
          return true;
        }
        if (outcome.kind === "rejected") {
          setError(outcome.error);
          return false;
        }
      }
      try {
        localStorage.setItem(queueKey, serialiseQueue(enqueue(parseQueue(localStorage.getItem(queueKey)), op)));
        window.dispatchEvent(new Event("dl-queue"));
        setMessage("Saved, will send when you're back online");
        return true;
      } catch {
        setError("Couldn't keep that on this phone. Try again.");
        return false;
      }
    },
    [queueKey, refresh, token],
  );

  const guests = useMemo(
    () => (data?.guests ?? []).map((g) => ({ ...g, arrived: arrivedOverride[g.id] ?? g.arrived })),
    [data, arrivedOverride],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return guests.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 12);
  }, [guests, query]);
  const arrived = guests.filter((g) => g.arrived).length;

  if (!data) return <p className="dl-card dl-sub">{error ?? "Loading the seating plan…"}</p>;

  const toggleArrived = async (g: SeatingModuleGuest & { arrived: boolean }) => {
    const next = !g.arrived;
    setArrivedOverride((o) => ({ ...o, [g.id]: next }));
    if (next) navigator.vibrate?.(15);
    const ok = await send(next ? "seatMarkArrived" : "seatUnmarkArrived", [g.id], `${g.name}: ${next ? "arrived" : "not arrived"}`);
    if (!ok) setArrivedOverride((o) => ({ ...o, [g.id]: !next }));
  };

  return (
    <>
      <h1 className="dl-large">Seating</h1>
      <p className="dl-sub">{arrived} of {data.expected} here</p>
      <input
        className="dl-field"
        style={{ marginTop: 12 }}
        type="search"
        inputMode="search"
        placeholder="Find a seat (two letters)"
        aria-label="Find a guest"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error ? <p className="dl-error">{error}</p> : null}
      {message ? <p className="dl-meta" role="status">{message}</p> : null}

      {query.trim().length >= 2 && results.length === 0 ? <p className="dl-card dl-sub">Nobody matches. A walk-in? Use Walk-in below.</p> : null}
      <div className="dl-group" style={{ marginTop: 12 }}>
        {results.map((g) => (
          <div key={g.id} className="dl-row">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div className="dl-headline">{g.name}</div>
                <div className="dl-meta">{g.tableLabel}{g.seat !== null ? ` · chair ${g.seat + 1}` : ""}</div>
              </div>
              <button className={`dl-btn small ${g.arrived ? "green" : ""}`} style={{ width: "auto", padding: "0 14px" }} onClick={() => void toggleArrived(g)}>
                {g.arrived ? "Here ✓" : "Arrived"}
              </button>
            </div>
            {g.vendorNote ? <div style={{ color: "var(--dl-orange)", marginTop: 4 }}>{g.vendorNote}</div> : null}
            {g.mates.length ? <div className="dl-meta" style={{ marginTop: 4 }}>With {g.mates.join(", ")}</div> : null}
            <div style={{ marginTop: 6 }}>
              <button className="dl-link" style={{ minHeight: 44 }} onClick={() => setMoving(g)}>Move to another chair</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <button className="dl-btn small grey" onClick={() => setWalkIn(true)}>Walk-in</button>
      </div>

      <h2 className="dl-foot">Spare chairs</h2>
      <div className="dl-group">
        {data.tables.filter((t) => t.free > 0).map((t) => (
          <div key={t.id} className="dl-row" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{t.label}</span>
            <span className="dl-meta">{t.free} spare{t.spare.length ? ` · chairs ${t.spare.slice(0, 6).map((n) => n + 1).join(", ")}` : ""}</span>
          </div>
        ))}
        {data.tables.every((t) => t.free === 0) ? <div className="dl-row dl-meta">No spare chairs.</div> : null}
      </div>

      {moving ? (
        <MoveSheet
          guest={moving}
          tables={data.tables}
          onClose={() => setMoving(null)}
          onMove={async (tableId, seat) => {
            const ok = await send("moveGuestOnTheDay", [moving.id, tableId, seat], `Move ${moving.name}`);
            if (ok) setMoving(null);
          }}
        />
      ) : null}
      {walkIn ? (
        <WalkInSheet
          tables={data.tables}
          onClose={() => setWalkIn(false)}
          onSeat={async (tableId, note) => {
            const ok = await send("seatWalkIn", [tableId, note], `Walk-in: ${note}`);
            if (ok) setWalkIn(false);
          }}
        />
      ) : null}
    </>
  );
}

function MoveSheet({ guest, tables, onClose, onMove }: { guest: SeatingModuleGuest; tables: SeatingModuleData["tables"]; onClose: () => void; onMove: (tableId: string, seat: number | null) => void }) {
  const [tableId, setTableId] = useState("");
  const table = tables.find((t) => t.id === tableId);
  return (
    <div className="dl-sheet-backdrop" onClick={onClose}>
      <div className="dl-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dl-grabber" />
        <h2>Move {guest.name}</h2>
        <select className="dl-field" value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="Table">
          <option value="">Which table?</option>
          {tables.filter((t) => t.free > 0 || t.id === guest.tableId).map((t) => (
            <option key={t.id} value={t.id}>{t.label} ({t.free} spare)</option>
          ))}
        </select>
        {table ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {table.spare.map((n) => (
              <button key={n} className="dl-btn small grey" style={{ width: "auto", padding: "0 16px" }} onClick={() => onMove(table.id, n)}>Chair {n + 1}</button>
            ))}
            {table.free > 0 && table.id !== guest.tableId ? (
              <button className="dl-btn small grey" style={{ width: "auto", padding: "0 16px" }} onClick={() => onMove(table.id, null)}>Any chair</button>
            ) : null}
          </div>
        ) : null}
        <div style={{ marginTop: 12 }}><button className="dl-link" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function WalkInSheet({ tables, onClose, onSeat }: { tables: SeatingModuleData["tables"]; onClose: () => void; onSeat: (tableId: string, note: string) => void }) {
  const [tableId, setTableId] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="dl-sheet-backdrop" onClick={onClose}>
      <div className="dl-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dl-grabber" />
        <h2>Walk-in</h2>
        <p className="dl-meta">Takes a spare chair as a reserved seat with a note. No guest is added to the list.</p>
        <select className="dl-field" style={{ marginTop: 8 }} value={tableId} onChange={(e) => setTableId(e.target.value)} aria-label="Table">
          <option value="">Which table?</option>
          {tables.filter((t) => t.free > 0).map((t) => (
            <option key={t.id} value={t.id}>{t.label} ({t.free} spare)</option>
          ))}
        </select>
        <input className="dl-field" style={{ marginTop: 8 }} placeholder="+1 for Tom Ruru" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <button className="dl-btn" disabled={!tableId || !note.trim()} onClick={() => onSeat(tableId, note)}>Seat them</button>
        </div>
        <div style={{ marginTop: 12 }}><button className="dl-link" style={{ minHeight: 44 }} onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}
