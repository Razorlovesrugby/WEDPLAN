"use client";

import { useState } from "react";
import { personKey, type ShotItem, type ShotPerson } from "@/lib/shots/model";
import { groupPeople, inputKey, mergePeople, toInput, type PersonInput } from "@/lib/shots/people";
import type { ShotListData } from "@/server/queries/shots";

/**
 * "People in it" (spec 52 §4.2), with the quick ways to fill it (spec 58):
 * same as the previous shot, copy from any shot, one-tap picks, a whole
 * household or side, and a guest checklist that stays open. It only edits the
 * list it is given; the caller saves.
 */
export function PeopleChooser({
  data,
  people,
  onChange,
  previous,
  recent,
  copyFrom,
}: {
  data: ShotListData;
  people: PersonInput[];
  onChange: (next: PersonInput[]) => void;
  /** The shot above this one, when there is one with people. */
  previous?: ShotItem | null;
  recent: ShotPerson[];
  /** Every shot a person list can be copied from, current section first. */
  copyFrom: { id: string; label: string; people: ShotPerson[] }[];
}) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const has = (key: string) => people.some((p) => inputKey(p) === key);
  const add = (more: PersonInput[]) => onChange(mergePeople(people, more));

  const labelOf = (p: PersonInput) =>
    p.kind === "role" ? p.role : p.kind === "guest" ? (data.guests.find((g) => g.id === p.id)?.name ?? "Removed") : (data.people.find((x) => x.id === p.id)?.name ?? "Removed");
  const matches = search.trim() ? data.guests.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : [];
  const quick = [
    ...data.people.map((p) => ({ key: personKey("person", p.id), name: p.name, input: { kind: "person", id: p.id } as PersonInput })),
    ...recent.map((p) => ({ key: p.key, name: p.name, input: toInput(p) })),
  ].filter((q, i, all) => all.findIndex((x) => x.key === q.key) === i && !has(q.key));
  const btn = "min-h-11 rounded-full border border-line px-3 py-1 text-xs";

  return (
    <fieldset className="space-y-2">
      <legend>People in it</legend>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <button key={inputKey(p)} type="button" className="rounded-full border border-line px-2 py-0.5 text-xs" onClick={() => onChange(people.filter((x) => inputKey(x) !== inputKey(p)))}>{labelOf(p)} ×</button>
        ))}
        {people.length > 0 ? <button type="button" className="px-2 py-0.5 text-xs underline" onClick={() => onChange([])}>Clear</button> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {previous && people.length === 0 ? (
          <button type="button" className={btn} onClick={() => add(previous.people.map(toInput))}>Same as previous shot</button>
        ) : null}
        {quick.map((q) => (
          <button key={q.key} type="button" className={btn} onClick={() => add([q.input])}>+ {q.name}</button>
        ))}
      </div>

      <select className="field" aria-label="Copy people from another shot" value="" onChange={(e) => { const s = copyFrom.find((c) => c.id === e.target.value); if (s) add(s.people.map(toInput)); }}>
        <option value="">Copy people from…</option>
        {copyFrom.filter((c) => c.people.length > 0).map((c) => <option key={c.id} value={c.id}>{c.label} ({c.people.length})</option>)}
      </select>

      {data.households.length > 0 || data.sides.length > 0 ? (
        <select
          className="field"
          aria-label="Add a whole household or side"
          value=""
          onChange={(e) => {
            const [type, id] = e.target.value.split(":") as ["household" | "side", string];
            if (id) add(groupPeople(data.guests, type === "household" ? { household: id } : { side: id }));
          }}
        >
          <option value="">Add a whole household or side…</option>
          {data.sides.map((s) => <option key={s.side} value={`side:${s.side}`}>{s.label}</option>)}
          {data.households.map((h) => <option key={h.id} value={`household:${h.id}`}>{h.name}</option>)}
        </select>
      ) : null}

      <input
        className="field"
        aria-label="Add guests"
        placeholder="Search guests…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const open = matches.filter((g) => !has(personKey("guest", g.id)));
          if (open.length === 1) { add([{ kind: "guest", id: open[0]!.id }]); setSearch(""); }
        }}
      />
      {matches.length > 0 ? (
        <ul className="max-h-48 overflow-y-auto rounded border border-line">
          {matches.map((g) => {
            const picked = has(personKey("guest", g.id));
            return (
              <li key={g.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2">
                  <input type="checkbox" checked={picked} onChange={() => (picked ? onChange(people.filter((x) => inputKey(x) !== personKey("guest", g.id))) : add([{ kind: "guest", id: g.id }]))} />
                  {g.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : null}
                  <span>{g.name}{g.relationship ? <span className="text-muted"> · {g.relationship}</span> : null}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <input className="field flex-1" aria-label="Add a role" placeholder="Or a role: Best man, All the cousins" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
        <button type="button" className="btn" disabled={!role.trim()} onClick={() => { add([{ kind: "role", role: role.trim() }]); setRole(""); }}>Add</button>
      </div>
    </fieldset>
  );
}
