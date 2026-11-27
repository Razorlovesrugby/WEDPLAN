"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import { setTableItems } from "@/server/actions/seating-items";
import { tableSize } from "@/lib/seating/geometry";
import { parseStyleChanges } from "@/lib/seating/items";
import type { SeatingTable } from "@/lib/seating/model";
import { parseMenu } from "@/lib/seating/service";
import {
  TABLE_ITEM_KINDS,
  TABLE_ITEM_LABEL,
  effectiveRules,
  hasTabletop,
  newItemId,
  nudgeItems,
  parseTableItems,
  pasteItems,
  ruleItems,
  snapOnTable,
  toFractions,
  type ItemRule,
  type Snap,
  type TableItem,
  type TableItemKind,
} from "@/lib/seating/table-items";
import { useSeating } from "./seating-state";
import { ItemRulesEditor, type RuleChoices } from "./item-rules-editor";
import { TableCloseup } from "./table-closeup";
import { TableItemGlyph } from "./table-item-glyph";
import { ZoomPlan } from "./zoom-plan";

/** What is held for Paste table décor: one table's items and rules, relative to its size (spec 59 D.3). Kept for this visit. */
export type HeldDecor = { items: TableItem[]; rules: ItemRule[] | null };
let heldDecor: HeldDecor | null = null;
export const hasHeldDecor = () => heldDecor !== null;
export const getHeldDecor = () => heldDecor;
export const holdDecor = (d: HeldDecor) => {
  heldDecor = d;
};

type Stamp = { kind: TableItemKind; ref?: string; label?: string };

/**
 * The table close-up, where its décor and dishes are placed (spec 59 D.1). Pick something from the palette (it stays in
 * hand, as Stamp does in the room) and click the tabletop to put one down; drag to move, Alt-drag to copy, Delete to remove,
 * arrows to nudge. Positions snap to the table's centre line, its ends and the points opposite each chair; Alt turns the
 * snap off. Items placed by rule are drawn dashed: they follow the table's size and chair count, and Make it by hand turns
 * them into ordinary items to move one by one.
 */
export function TableItemsEditor({ table }: { table: SeatingTable }) {
  const { eventId, layoutId, data, setTables, track, setError, refresh, locked } = useSeating();
  const [, startTransition] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [snapHint, setSnapHint] = useState<Snap | null>(null);
  const [drag, setDrag] = useState<{ ids: Set<string>; start: { x: number; y: number }; copy: boolean; moved: boolean; d: { dx: number; dy: number } } | null>(null);
  const [message, setMessage] = useState("");

  const editable = !locked && hasTabletop(table.shape);
  const style = data.styles.find((s) => s.id === table.style_id) ?? null;
  const own = parseStyleChanges(table.style_changes)?.item_rules ?? null;
  const rules = effectiveRules(style?.item_rules ?? [], own);
  const items = useMemo(() => parseTableItems(table.table_items), [table.table_items]);
  const size = tableSize(table);
  const ruled = useMemo(() => ruleItems(table, rules), [table, rules]);

  const menu = useMemo(() => {
    const m = parseMenu(data.plan?.menu);
    return m.ok ? m.menu : [];
  }, [data.plan?.menu]);
  const choices: RuleChoices = useMemo(
    () => ({ dishes: menu.flatMap((c) => c.dishes.map((d) => ({ id: d.id, name: d.name }))), customItems: data.customItems.map((c) => ({ id: c.id, name: c.name })) }),
    [menu, data.customItems],
  );
  const names = useMemo(() => Object.fromEntries([...choices.dishes, ...choices.customItems].map((x) => [x.id, x.name])), [choices]);

  // ---- saving ------------------------------------------------------------------
  /** One write and one undo step. The screen takes the new items at once. */
  const save = useCallback(
    (next: TableItem[], label: string, nextRules?: ItemRule[] | null) => {
      setTables((ts) =>
        ts.map((t) => {
          if (t.id !== table.id) return t;
          if (nextRules === undefined) return { ...t, table_items: next };
          const { item_rules: _drop, ...rest } = parseStyleChanges(t.style_changes) ?? {};
          void _drop;
          const merged = nextRules === null ? rest : { ...rest, item_rules: nextRules };
          return { ...t, table_items: next, style_changes: Object.keys(merged).length > 0 ? merged : null };
        }),
      );
      startTransition(async () => {
        const r = await track(label, () => setTableItems(eventId, layoutId, [{ tableId: table.id, items: next, ...(nextRules === undefined ? {} : { rules: nextRules }) }]));
        if (!r.ok) setError(r.error);
        refresh();
      });
    },
    [eventId, layoutId, table.id, setTables, track, setError, refresh],
  );

  // Arrow keys repeat quickly: the screen follows each press and one write goes out when they stop.
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(items);
  latest.current = items;
  useEffect(() => () => void (nudgeTimer.current && clearTimeout(nudgeTimer.current)), []);

  // ---- the plan ----------------------------------------------------------------
  /** A pointer position in the table's own frame (cm from its centre). */
  const local = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const onTop = (p: { x: number; y: number }) => Math.abs(p.x) <= size.length / 2 + 6 && Math.abs(p.y) <= size.width / 2 + 6;
  const snapped = (f: { along: number; across: number }, off: boolean) => {
    const s = off ? null : snapOnTable({ ...table, length: size.length, width: size.width }, f);
    setSnapHint(s);
    return s ? { along: s.along, across: s.across } : f;
  };

  const place = (p: { x: number; y: number }, off: boolean) => {
    if (!stamp || !editable || items.length >= 200) return;
    const at = snapped(toFractions(size, p), off);
    const item: TableItem = { id: newItemId(new Set(items.map((i) => i.id))), kind: stamp.kind, along: at.along, across: at.across, rotation: 0 };
    if (stamp.ref) item.ref = stamp.ref;
    if (stamp.label) item.label = stamp.label;
    save([...items, item], `Placed ${TABLE_ITEM_LABEL[stamp.kind].toLowerCase()} on ${table.label}`);
    setMessage(`${TABLE_ITEM_LABEL[stamp.kind]} placed, ${items.length + 1} on ${table.label}`);
  };

  const onBackgroundDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current?.focus({ preventScroll: true });
    if (e.button !== 0) return;
    const p = local(e);
    if (stamp) {
      if (onTop(p)) place(p, e.altKey);
      return;
    }
    if (!e.shiftKey) setSelected(new Set());
  };
  const onItemDown = (e: RPointerEvent, id: string) => {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    svgRef.current?.focus({ preventScroll: true });
    if (stamp) {
      // With something in hand, a click on top of an item still places one.
      const p = local(e);
      if (onTop(p)) place(p, e.altKey);
      return;
    }
    let ids = new Set(selected);
    if (e.shiftKey) {
      if (!ids.delete(id)) ids.add(id);
      setSelected(ids);
      if (!ids.has(id)) return;
    } else if (!ids.has(id)) {
      ids = new Set([id]);
      setSelected(ids);
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ ids, start: local(e), copy: e.altKey, moved: false, d: { dx: 0, dy: 0 } });
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = local(e);
    if (stamp) {
      if (onTop(p)) snapped(toFractions(size, p), e.altKey);
      else setSnapHint(null);
    }
    if (!drag) return;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    setDrag({ ...drag, moved: true, d: { dx, dy } });
    if (drag.ids.size === 1) {
      const only = items.find((i) => drag.ids.has(i.id));
      if (only) snapped({ along: only.along + dx / size.length, across: only.across + dy / size.width }, e.altKey);
    }
  };
  const onUp = () => {
    if (!drag) return;
    setDrag(null);
    setSnapHint(null);
    if (!drag.moved) return;
    const da = drag.d.dx / size.length;
    const dc = drag.d.dy / size.width;
    let next: TableItem[];
    if (drag.ids.size === 1) {
      const only = items.find((i) => drag.ids.has(i.id))!;
      const at = snapped({ along: only.along + da, across: only.across + dc }, false);
      setSnapHint(null);
      const moved = { ...only, along: Math.max(-0.5, Math.min(0.5, at.along)), across: Math.max(-0.5, Math.min(0.5, at.across)) };
      next = drag.copy ? [...items, { ...moved, id: newItemId(new Set(items.map((i) => i.id))) }] : items.map((i) => (i.id === only.id ? moved : i));
    } else if (drag.copy) {
      next = [...items, ...pasteItems(nudgeItems(items.filter((i) => drag.ids.has(i.id)), drag.ids, da, dc), new Set(items.map((i) => i.id)))];
    } else {
      next = nudgeItems(items, drag.ids, da, dc);
    }
    save(next.slice(0, 200), drag.copy ? "Copied items on a table" : "Moved items on a table");
  };

  const remove = () => {
    if (!editable || selected.size === 0) return;
    save(items.filter((i) => !selected.has(i.id)), selected.size === 1 ? "Removed an item from a table" : `Removed ${selected.size} items from a table`);
    setMessage(`Removed ${selected.size} ${selected.size === 1 ? "item" : "items"}`);
    setSelected(new Set());
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (stamp) setStamp(null);
      else setSelected(new Set());
      setSnapHint(null);
      return;
    }
    if (!editable) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
      e.preventDefault();
      return remove();
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const a = arrows[e.key];
    if (a && selected.size > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 0.05 : 0.01;
      const next = nudgeItems(latest.current, selected, a[0] * step, a[1] * step);
      latest.current = next;
      setTables((ts) => ts.map((t) => (t.id === table.id ? { ...t, table_items: next } : t)));
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      nudgeTimer.current = setTimeout(() => save(latest.current, "Nudged items on a table"), 400);
    }
  };

  /** Make it by hand: the rule's items become ordinary items, and this table stops following its rules. */
  const byHand = () => {
    if (!editable || ruled.length === 0) return;
    const taken = new Set(items.map((i) => i.id));
    const made = ruled.map(({ id: _id, fromRule: _from, serves: _serves, ...rest }) => {
      void _id;
      void _from;
      void _serves;
      const id = newItemId(taken);
      taken.add(id);
      return { ...rest, id } as TableItem;
    });
    save([...items, ...made].slice(0, 200), `Made ${made.length} items on ${table.label} by hand`, []);
    setMessage(`${made.length} items are now yours to move`);
  };

  const copyDecor = () => {
    heldDecor = { items, rules: own };
    setMessage(`Copied ${items.length} items from ${table.label}`);
  };
  const pasteDecor = () => {
    if (!heldDecor || !editable) return;
    save([...items, ...pasteItems(heldDecor.items, new Set(items.map((i) => i.id)))].slice(0, 200), "Pasted table décor", heldDecor.rules ?? undefined);
    setMessage(`Pasted ${heldDecor.items.length} items on ${table.label}`);
  };

  if (!hasTabletop(table.shape)) return <p className="text-sm text-muted">Ceremony rows are chairs only: there is no tabletop to set.</p>;

  const dragDx = drag?.moved && !drag.copy ? drag.d.dx : 0;
  const dragDy = drag?.moved && !drag.copy ? drag.d.dy : 0;
  const all = [...items, ...ruled];
  const hint = !editable
    ? locked
      ? "The room is locked: décor on tables is held still. Unlock the room to change it."
      : ""
    : stamp
      ? `${TABLE_ITEM_LABEL[stamp.kind]}${stamp.ref ? `: ${names[stamp.ref] ?? ""}` : ""} · click the table to place · Alt turns snapping off · Esc to stop`
      : selected.size > 0
        ? `${selected.size} selected · drag to move · Alt+drag copies · arrows nudge · Delete removes`
        : "Pick something below, then click the table. Drag to move.";

  return (
    <div className="space-y-2 text-sm">
      {editable ? (
        <div role="toolbar" aria-label="What to place" className="flex flex-wrap gap-1">
          {TABLE_ITEM_KINDS.filter((k) => k !== "dish" && k !== "custom").map((k) => (
            <button key={k} type="button" className={`btn py-1 ${stamp?.kind === k && !stamp.ref ? "bg-ink text-white" : ""}`} aria-pressed={stamp?.kind === k && !stamp.ref} onClick={() => setStamp(stamp?.kind === k && !stamp.ref ? null : { kind: k })}>
              {TABLE_ITEM_LABEL[k]}
            </button>
          ))}
          {choices.dishes.map((d) => (
            <button key={d.id} type="button" className={`btn py-1 ${stamp?.ref === d.id ? "bg-ink text-white" : ""}`} aria-pressed={stamp?.ref === d.id} onClick={() => setStamp(stamp?.ref === d.id ? null : { kind: "dish", ref: d.id })}>
              {d.name || "Dish"}
            </button>
          ))}
          {data.customItems.map((c) => (
            <button key={c.id} type="button" className={`btn py-1 ${stamp?.ref === c.id ? "bg-ink text-white" : ""}`} aria-pressed={stamp?.ref === c.id} onClick={() => setStamp(stamp?.ref === c.id ? null : { kind: "custom", ref: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      <ZoomPlan label={`${table.label} tabletop`} roomNav>
        <TableCloseup
          table={table}
          style={style}
          items={[]}
          svgRef={svgRef}
          svgProps={{
            tabIndex: 0,
            onPointerDown: onBackgroundDown,
            onPointerMove: onMove,
            onPointerUp: onUp,
            onPointerCancel: onUp,
            onKeyDown,
            style: { touchAction: "none", cursor: stamp ? "crosshair" : "default", outline: "none" },
            role: "application",
            "aria-label": `${table.label} tabletop. ${hint}`,
          }}
          overlay={
            <g>
              {all.map((it) => {
                const ghost = "fromRule" in it;
                const picked = selected.has(it.id);
                return (
                  <g key={it.id} transform={picked ? `translate(${dragDx} ${dragDy})` : undefined} onPointerDown={ghost ? undefined : (e) => onItemDown(e, it.id)} style={{ cursor: ghost ? "default" : stamp ? "crosshair" : "move" }}>
                    <TableItemGlyph item={it} length={size.length} width={size.width} ghost={ghost} selected={picked} name={it.ref ? names[it.ref] : undefined} />
                  </g>
                );
              })}
              {drag?.moved && drag.copy
                ? items
                    .filter((i) => drag.ids.has(i.id))
                    .map((i) => <TableItemGlyph key={`c${i.id}`} item={{ ...i, id: `c${i.id}` }} length={size.length} width={size.width} ghost dx={drag.d.dx} dy={drag.d.dy} />)
                : null}
              {snapHint ? <circle data-snap={snapHint.kind} cx={snapHint.along * size.length} cy={snapHint.across * size.width} r={5} fill="none" stroke="#d6336c" strokeWidth={1.5} style={{ pointerEvents: "none" }} /> : null}
            </g>
          }
        />
      </ZoomPlan>

      <p className="text-xs text-muted" role="status" aria-live="polite">
        {hint}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span>
          {items.length} placed{ruled.length > 0 ? ` · ${ruled.length} by rule` : ""}
        </span>
        {editable ? (
          <>
            <button type="button" className="btn py-1" disabled={selected.size === 0} onClick={remove}>
              Remove selected
            </button>
            <button type="button" className="btn py-1" disabled={ruled.length === 0} onClick={byHand} title="Turn the items placed by rule into ordinary items you can move one by one">
              Make it by hand
            </button>
            <button type="button" className="btn py-1" disabled={items.length === 0 && !own} onClick={copyDecor}>
              Copy décor
            </button>
            <button type="button" className="btn py-1" disabled={!hasHeldDecor()} onClick={pasteDecor}>
              Paste décor
            </button>
          </>
        ) : null}
      </div>

      <details className="rounded border border-line" open={own !== null}>
        <summary className="cursor-pointer px-2 py-1 text-sm font-medium">Rules for this table</summary>
        <div className="space-y-2 p-2">
          {own === null ? (
            <p className="text-xs text-muted">{style ? `From the style “${style.name}”. Changing them here changes only this table.` : "This table has no style, so no rules."}</p>
          ) : (
            <p className="text-xs text-muted">This table has its own rules, in place of its style&apos;s.</p>
          )}
          <ItemRulesEditor
            rules={[...rules]}
            readOnly={!editable || own === null}
            choices={choices}
            table={table}
            onChange={(next) => save(items, "Changed a table's rules", next)}
          />
          {editable && own === null && rules.length > 0 ? (
            <button type="button" className="btn py-1" onClick={() => save(items, "Gave a table its own rules", [...rules])}>
              Change on this table
            </button>
          ) : null}
          {editable && own === null && rules.length === 0 ? (
            <button type="button" className="btn py-1" onClick={() => save(items, "Gave a table its own rules", [])}>
              Give this table its own rules
            </button>
          ) : null}
          {editable && own !== null ? (
            <button type="button" className="btn py-1" onClick={() => save(items, "Back to the style's rules", null)}>
              Use the style&apos;s rules
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
