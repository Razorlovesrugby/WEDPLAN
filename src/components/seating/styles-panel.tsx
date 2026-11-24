"use client";

import { useMemo, useState, useTransition } from "react";
import { applyTableStyle, deleteTableStyle, saveTableStyle, setItemFinalCount } from "@/server/actions/seating-styles";
import {
  CENTRE_ITEMS,
  CENTRE_LABEL,
  computeItems,
  itemsCsv,
  mergeFinal,
  PLACE_ITEMS,
  PLACE_LABEL,
  STYLE_LIMITS,
  type CentreExtra,
  type CentreKey,
  type CentreSetting,
  type PlaceKey,
  type PlaceSetting,
  type StyleCentre,
  type StylePlace,
  type TableStyle,
} from "@/lib/seating/items";
import type { SeatingTable } from "@/lib/seating/model";
import { useSeating } from "./seating-state";
import { TableCloseup } from "./table-closeup";

type Draft = { id?: string; name: string; place: StylePlace; centre: StyleCentre };

const NEW_STYLE: Draft = {
  name: "",
  place: { dinner_plate: { on: true }, cutlery: { on: true, count: 4 }, glasses: { on: true, count: 2 }, napkin: { on: true } },
  centre: { arrangement: { on: true } },
};

/** Items whose count is "how many per place" rather than a yes or no. */
const PER_PLACE_COUNT: Partial<Record<PlaceKey, string>> = { cutlery: "pieces", glasses: "glasses" };

/**
 * Table styles (spec 57 Part C): what is on each place and in the middle of a
 * table, which tables have which style, and what it adds up to. The numbers
 * are suggestions; the couple types the final one.
 */
export function StylesPanel() {
  const { eventId, data, tables, assignments, track, setError, refresh } = useSeating();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

  const styleById = useMemo(() => new Map(data.styles.map((s) => [s.id, s])), [data.styles]);
  const usedBy = (styleId: string) => tables.filter((t) => t.style_id === styleId).length;

  const lines = useMemo(() => {
    const seatedAt = new Map<string, number>();
    for (const a of assignments) seatedAt.set(a.tableId, (seatedAt.get(a.tableId) ?? 0) + 1);
    const blockedAt = new Map<string, number>();
    for (const b of data.blocked) blockedAt.set(b.tableId, (blockedAt.get(b.tableId) ?? 0) + 1);
    const rows = computeItems({
      tables: tables.map((t) => ({
        id: t.id,
        shape: t.shape,
        capacity: t.capacity,
        reserved_seats: t.reserved_seats,
        style_id: t.style_id,
        style_changes: t.style_changes,
        seated: seatedAt.get(t.id) ?? 0,
        blocked: blockedAt.get(t.id) ?? 0,
      })),
      styles: data.styles,
      fixtures: data.fixtures,
      customNames: {},
      utensils: 0,
    });
    return mergeFinal(rows, data.counts);
  }, [tables, assignments, data.blocked, data.styles, data.fixtures, data.counts]);

  const run = (label: string | null, write: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = label ? await track(label, write) : await write();
      if (!result.ok) setError(result.error ?? "That didn't save");
      else after?.();
      refresh();
    });

  const save = () => {
    if (!draft) return;
    run(null, () => saveTableStyle(eventId, draft), () => setDraft(null));
  };

  const download = () => {
    const blob = new Blob([itemsCsv(lines)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "table-items.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card space-y-4 p-4" aria-labelledby="styles-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="styles-heading" className="font-serif text-lg">
          Table styles
        </h2>
        <button type="button" className="btn py-1" onClick={() => setDraft({ ...NEW_STYLE })} disabled={draft !== null}>
          + New style
        </button>
      </div>
      <p className="text-sm text-muted">
        What is on each place and in the middle of a table. Tables share a style; change it once and every table using it follows. Open a table to see it drawn.
      </p>

      {data.styles.length === 0 && !draft ? <p className="text-sm text-muted">No styles yet.</p> : null}
      <ul className="space-y-1.5">
        {data.styles.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-3 py-1.5 text-sm">
            <strong>{s.name}</strong>
            <span className="text-xs text-muted">{usedBy(s.id) === 0 ? "not used" : `${usedBy(s.id)} ${usedBy(s.id) === 1 ? "table" : "tables"}`}</span>
            <button type="button" className="ml-auto text-xs underline" onClick={() => setDraft({ id: s.id, name: s.name, place: s.place, centre: s.centre })}>
              Edit
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <StyleEditor
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={
            draft.id
              ? () => {
                  if (!window.confirm(`Delete "${draft.name}"? Tables using it go back to having no style.`)) return;
                  run("Deleted a table style", () => deleteTableStyle(eventId, draft.id!), () => setDraft(null));
                }
              : undefined
          }
        />
      ) : null}

      {data.styles.length > 0 && tables.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Which table has which style</h3>
            <label className="flex items-center gap-2 text-xs text-muted">
              All tables
              <select
                className="field w-auto py-1"
                value=""
                disabled={pending}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") return;
                  run("Set every table's style", () => applyTableStyle(eventId, v === "none" ? null : v, tables.map((t) => t.id)));
                }}
              >
                <option value="">Set all to…</option>
                <option value="none">No style</option>
                {data.styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {tables.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {t.label}
                  {t.style_changes ? <span className="ml-1 text-xs text-muted">(changed)</span> : null}
                </span>
                <select
                  className="field w-40 py-1"
                  aria-label={`Style for ${t.label}`}
                  value={t.style_id && styleById.has(t.style_id) ? t.style_id : ""}
                  disabled={pending}
                  onChange={(e) => run(`Set ${t.label}'s style`, () => applyTableStyle(eventId, e.target.value || null, [t.id]))}
                >
                  <option value="">No style</option>
                  {data.styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">What it adds up to</h3>
          {lines.length > 0 ? (
            <button type="button" className="text-xs underline" onClick={download}>
              Download CSV
            </button>
          ) : null}
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Give a table a style, or place some décor in the room, and the counts appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-2 font-normal">Item</th>
                  <th className="px-2 text-right font-normal" title="Every chair gets one">By chairs</th>
                  <th className="px-2 text-right font-normal" title="Seated guests, plus reserved seats">By guests</th>
                  <th className="pl-2 text-right font-normal">Final</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      {l.label}
                      {l.notes.length > 0 ? <span className="block text-xs text-muted">{l.notes.join(" · ")}</span> : null}
                      {l.status === "changed" ? <span className="block text-xs text-amber-800">Seating changed since you set this</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.suggestedChairs}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.suggestedGuests}</td>
                    <td className="py-1 pl-2 text-right">
                      <input
                        key={`${l.key}:${l.final ?? ""}`}
                        type="number"
                        min={0}
                        max={100000}
                        className="field w-20 py-0.5 text-right"
                        aria-label={`Final number of ${l.label}`}
                        placeholder="Not set"
                        defaultValue={l.final ?? ""}
                        disabled={pending}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          if (next !== null && (!Number.isInteger(next) || next < 0)) {
                            setError("Use a whole number, or leave it empty");
                            return;
                          }
                          if (next === l.final) return;
                          run(null, () => setItemFinalCount(eventId, l.key, next, { chairs: l.suggestedChairs, guests: l.suggestedGuests }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function StyleEditor({
  draft,
  setDraft,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const setPlace = (k: PlaceKey, v: PlaceSetting | null) => {
    const place = { ...draft.place };
    if (v) place[k] = v;
    else delete place[k];
    setDraft({ ...draft, place });
  };
  const setCentre = (k: CentreKey, v: CentreSetting | null) => {
    const centre = { ...draft.centre };
    if (v) centre[k] = v;
    else delete centre[k];
    setDraft({ ...draft, centre });
  };
  const extras = draft.centre.extras ?? [];
  const setExtras = (next: CentreExtra[]) => setDraft({ ...draft, centre: { ...draft.centre, extras: next } });

  return (
    <form
      className="space-y-4 rounded border border-line bg-paper/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Name</span>
        <input className="field" required maxLength={STYLE_LIMITS.name} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Garden round" autoFocus />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Each place</legend>
        {PLACE_ITEMS.map((k) => {
          const s = draft.place[k];
          return (
            <div key={k} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-40 items-center gap-2">
                <input type="checkbox" checked={s?.on === true} onChange={(e) => setPlace(k, e.target.checked ? { ...(s ?? {}), on: true } : { ...(s ?? {}), on: false })} />
                {PLACE_LABEL[k]}
              </label>
              {s?.on && PER_PLACE_COUNT[k] ? (
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="number" min={0} max={STYLE_LIMITS.count} className="field w-16 py-0.5" value={s.count ?? ""} onChange={(e) => setPlace(k, { ...s, count: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  {PER_PLACE_COUNT[k]}
                </label>
              ) : null}
              {s?.on ? (
                <input className="field min-w-0 flex-1 py-0.5 text-xs" maxLength={STYLE_LIMITS.note} placeholder="Note (e.g. gold rim)" aria-label={`Note for ${PLACE_LABEL[k]}`} value={s.note ?? ""} onChange={(e) => setPlace(k, { ...s, note: e.target.value || undefined })} />
              ) : null}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Centre of the table</legend>
        {CENTRE_ITEMS.map((k) => {
          const s = draft.centre[k];
          return (
            <div key={k} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-40 items-center gap-2">
                <input type="checkbox" checked={s?.on === true} onChange={(e) => setCentre(k, { ...(s ?? {}), on: e.target.checked })} />
                {CENTRE_LABEL[k]}
              </label>
              {s?.on && k === "candles" ? (
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="number" min={0} max={STYLE_LIMITS.count} className="field w-16 py-0.5" value={s.count ?? ""} onChange={(e) => setCentre(k, { ...s, count: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  per table
                </label>
              ) : null}
              {s?.on && k === "arrangement" ? (
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={s.tall === true} onChange={(e) => setCentre(k, { ...s, tall: e.target.checked })} />
                  tall
                </label>
              ) : null}
              {s?.on ? (
                <input className="field min-w-0 flex-1 py-0.5 text-xs" maxLength={STYLE_LIMITS.note} placeholder="Note (e.g. low garden)" aria-label={`Note for ${CENTRE_LABEL[k]}`} value={s.note ?? ""} onChange={(e) => setCentre(k, { ...s, note: e.target.value || undefined })} />
              ) : null}
            </div>
          );
        })}
        <div className="space-y-1.5 pt-1">
          {extras.map((x, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <input className="field min-w-0 flex-1 py-0.5" maxLength={STYLE_LIMITS.name} placeholder="Item (e.g. bud vases)" aria-label="Item name" value={x.name} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <input type="number" min={0} max={STYLE_LIMITS.count} className="field w-16 py-0.5" aria-label="How many per table" value={x.count} onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, count: Number(e.target.value) || 0 } : y)))} />
              <button type="button" className="text-xs underline" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          {extras.length < STYLE_LIMITS.extras ? (
            <button type="button" className="text-xs underline" onClick={() => setExtras([...extras, { name: "", count: 1 }])}>
              + Add an item
            </button>
          ) : null}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || draft.name.trim() === ""}>
          {draft.id ? "Save style" : "Add style"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {onDelete ? (
          <button type="button" className="ml-auto text-sm text-red-700 underline" onClick={onDelete}>
            Delete this style
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** In a table's drawer: pick its style and see it set, top down. */
export function TableStyleSection({ table }: { table: SeatingTable }) {
  const { eventId, data, track, setError, refresh } = useSeating();
  const [pending, startTransition] = useTransition();
  const style = table.style_id ? data.styles.find((s) => s.id === table.style_id) ?? null : null;
  if (table.shape === "rows") return null;
  return (
    <details className="mt-4 rounded border border-line p-3" open={style !== null}>
      <summary className="cursor-pointer text-sm font-semibold">Table style{style ? `: ${style.name}` : ""}</summary>
      <div className="mt-3 space-y-3">
        {data.styles.length === 0 ? (
          <p className="text-sm text-muted">Make a style first, under Table styles on the seating page.</p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs text-muted">Style</span>
            <select
              className="field w-auto py-1"
              value={style?.id ?? ""}
              disabled={pending}
              onChange={(e) =>
                startTransition(async () => {
                  const result = await track(`Set ${table.label}'s style`, () => applyTableStyle(eventId, e.target.value || null, [table.id]));
                  if (!result.ok) setError(result.error);
                  refresh();
                })
              }
            >
              <option value="">No style</option>
              {data.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <TableCloseup table={table} style={style} />
      </div>
    </details>
  );
}
