"use client";

import { useMemo, useState, useTransition } from "react";
import { addSeatingRule, removeSeatingRule } from "@/server/actions/seating";
import { compareBySurname, guestName, type SeatingRule } from "@/lib/seating/model";
import type { SeatingRuleKind } from "@/lib/types/database";
import { useSeating } from "./seating-state";

const KIND_LABEL: Record<SeatingRuleKind, string> = {
  together: "Keep together",
  apart: "Keep apart",
  near: "Seat near each other",
  avoid_table: "Not at this table",
  accessible: "Needs an accessible table",
};

/**
 * The rules (§B.1). Enter each one the moment you learn it; the warnings do
 * the remembering. Pair and accessibility rules hold across every event;
 * "not at this table" belongs to a table and goes with it.
 */
export function RulesPanel() {
  const { eventId, data, guestById, tableById, tables, refresh, setError } = useSeating();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<SeatingRuleKind>("apart");
  const [guestA, setGuestA] = useState("");
  const [guestB, setGuestB] = useState("");
  const [tableId, setTableId] = useState("");

  const invited = useMemo(() => data.guests.filter((g) => g.invited).sort(compareBySurname), [data.guests]);
  // Rules for guests who are on this event's list, or that name this event's tables.
  const rules = data.rules.filter(
    (r) => (r.table_id ? tableById.has(r.table_id) : guestById.get(r.guest_a)?.invited || (r.guest_b && guestById.get(r.guest_b)?.invited)),
  );
  const accessibleRuleFor = new Set(data.rules.filter((r) => r.kind === "accessible").map((r) => r.guest_a));
  const needsALook = invited.filter((g) => g.accessibility && !accessibleRuleFor.has(g.id));

  const describe = (r: SeatingRule) => {
    const a = guestById.get(r.guest_a);
    const b = r.guest_b ? guestById.get(r.guest_b) : undefined;
    const t = r.table_id ? tableById.get(r.table_id) : undefined;
    const an = a ? guestName(a) : "Someone removed";
    if (r.kind === "avoid_table") return `${an} — not at ${t?.label ?? "a table"}`;
    if (r.kind === "accessible") return `${an} needs an accessible table`;
    return `${an} & ${b ? guestName(b) : "someone removed"}`;
  };

  const add = (fields: Record<string, unknown>) =>
    startTransition(async () => {
      const result = await addSeatingRule(eventId, fields);
      if (!result.ok) setError(result.error);
      else {
        setGuestA("");
        setGuestB("");
        setTableId("");
      }
      refresh();
    });

  return (
    <details className="card p-3">
      <summary className="cursor-pointer font-medium">
        Seating rules <span className="text-sm font-normal text-muted">({rules.length})</span>
      </summary>

      {rules.length > 0 ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5">
              <span className="w-40 shrink-0 text-xs text-muted">{KIND_LABEL[r.kind]}</span>
              <span className="flex-1">{describe(r)}</span>
              <button
                type="button"
                className="text-xs text-muted underline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeSeatingRule(r.id, eventId);
                    if (!result.ok) setError(result.error);
                    refresh();
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No rules yet.</p>
      )}

      <form
        className="mt-3 grid gap-2 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!guestA) return;
          if (kind === "avoid_table") add({ kind, guestA, tableId });
          else if (kind === "accessible") add({ kind, guestA });
          else add({ kind, guestA, guestB });
        }}
      >
        <select className="field" aria-label="Rule" value={kind} onChange={(e) => setKind(e.target.value as SeatingRuleKind)}>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <GuestSelect label="Guest" value={guestA} onChange={setGuestA} guests={invited} />
        {kind === "avoid_table" ? (
          <select className="field" aria-label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">Table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : kind === "accessible" ? (
          <span />
        ) : (
          <GuestSelect label="And" value={guestB} onChange={setGuestB} guests={invited.filter((g) => g.id !== guestA)} />
        )}
        <button type="submit" className="btn" disabled={pending || !guestA}>
          Add rule
        </button>
      </form>

      {needsALook.length > 0 ? (
        <div className="mt-3 border-t border-line pt-2 text-sm">
          <p className="mb-1 text-xs text-muted">Has access needs noted — needs an accessible table?</p>
          <ul className="space-y-1">
            {needsALook.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {guestName(g)} <span className="text-muted">— {g.accessibility}</span>
                </span>
                <button type="button" className="text-xs underline" onClick={() => add({ kind: "accessible", guestA: g.id })}>
                  Yes
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}

function GuestSelect({
  label,
  value,
  onChange,
  guests,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  guests: { id: string; firstName: string; lastName: string | null; preferredName: string | null }[];
}) {
  return (
    <select className="field" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}…</option>
      {guests.map((g) => (
        <option key={g.id} value={g.id}>
          {guestName(g)}
        </option>
      ))}
    </select>
  );
}
