"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import type { Repeat } from "@/lib/site/editor-fields";
import { moveWithin } from "@/lib/reorder";
import { repeatHeading } from "@/lib/site/style-labels";
import { FieldInput } from "./field";

/**
 * The list of rows inside a block — questions, people, suggestions, moments
 * (spec 28 §7.1). One implementation for all four.
 *
 * **Each row has a key of its own.** The rows used to be keyed by their
 * position, so removing row 2 of 5 left row 3's half-typed text sitting in row
 * 2's inputs (React reuses a position's DOM), and reordering would have made
 * that every move. The keys live here, beside the rows, and are never stored:
 * the payload stays exactly the shape the renderer reads, and a page saved
 * before this existed needs no migration.
 *
 * Reorder by drag (the handle), or by ↑ / ↓ for keyboard and touch. Rows fold
 * down to their first line when they are not the one being edited, so twenty
 * questions fit on a screen and dragging one is practical.
 */

type Row = Record<string, unknown>;

let keyCounter = 0;
const newKey = () => `row-${(keyCounter += 1)}`;

/** How long "Undo" stays offered after a move or a removal. */
const UNDO_MS = 8000;

/** One line standing for a row while it is folded: its first words, or a prompt. */
function summary(repeat: Repeat, row: Row): string {
  const names = repeat.summary ?? [repeat.fields.find((f) => f.kind === "text" || f.kind === "textarea")?.name];
  const parts = names
    .map((name) => (name && typeof row[name] === "string" ? (row[name] as string).trim() : ""))
    .filter((part) => part !== "");
  return parts.join(" · ");
}

export function RepeatRows({
  repeat,
  rows,
  onChange,
  idPrefix,
  note,
  actions,
}: {
  repeat: Repeat;
  rows: Row[];
  /** Called with the whole new list on every edit, add, remove and move. */
  onChange: (rows: Row[]) => void;
  idPrefix: string;
  /** A soft word of advice under the list. Never blocks anything. */
  note?: string | null;
  /** Extra buttons beside "Add a …". */
  actions?: React.ReactNode;
}) {
  const [keys, setKeys] = useState<string[]>(() => rows.map(newKey));
  const [open, setOpen] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; rows: Row[]; keys: string[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // The rows can change under us (the starter questions are added on the
  // server). Keep the keys the same length rather than letting a row go
  // without one: new ones are appended, spare ones dropped.
  const live =
    keys.length === rows.length
      ? keys
      : rows.map((_, index) => keys[index] ?? newKey());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Every change goes through here, so rows and keys can never part company. */
  function commit(nextRows: Row[], nextKeys: string[], undoLabel?: string) {
    if (undoLabel) {
      setUndo({ label: undoLabel, rows, keys: live });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    }
    setKeys(nextKeys);
    onChange(nextRows);
  }

  function move(from: number, to: number) {
    if (from === to) return;
    const label = summary(repeat, rows[from] ?? {}) || `That ${repeat.noun}`;
    commit(moveWithin(rows, from, to), moveWithin(live, from, to), `Moved “${label}”`);
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const from = live.indexOf(String(event.active.id));
    const to = live.indexOf(String(event.over.id));
    if (from !== -1 && to !== -1) move(from, to);
  }

  function remove(index: number) {
    const label = summary(repeat, rows[index] ?? {}) || `That ${repeat.noun}`;
    commit(
      rows.filter((_, position) => position !== index),
      live.filter((_, position) => position !== index),
      `Removed “${label}”`,
    );
  }

  function add() {
    const key = newKey();
    setOpen(key);
    commit([...rows, {}], [...live, key]);
  }

  function restore() {
    if (!undo) return;
    setKeys(undo.keys);
    onChange(undo.rows);
    setUndo(null);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-muted">{repeatHeading(repeat.noun)}</h3>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={live} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {rows.map((row, index) => (
              <SortableRow
                key={live[index]}
                id={live[index]!}
                noun={repeat.noun}
                text={summary(repeat, row)}
                expanded={open === live[index]}
                canMoveUp={index > 0}
                canMoveDown={index < rows.length - 1}
                onToggle={() => setOpen(open === live[index] ? null : live[index]!)}
                onMove={(delta) => move(index, index + delta)}
              >
                <div className="space-y-2">
                  {repeat.fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      field={field}
                      value={row[field.name]}
                      idPrefix={`${idPrefix}-${live[index]}`}
                      onChange={(value) => {
                        const next = [...rows];
                        next[index] = { ...row, [field.name]: value };
                        // An edit changes no row's identity, so the keys stay.
                        onChange(next);
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:underline"
                    onClick={() => remove(index)}
                  >
                    Remove this {repeat.noun}
                  </button>
                </div>
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {undo ? (
        <p role="status" className="flex items-center justify-between gap-3 rounded bg-[#2b2724] px-3 py-2 text-xs text-white">
          <span className="truncate">{undo.label}</span>
          <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={restore}>
            Undo
          </button>
        </p>
      ) : null}

      {note ? <p className="text-xs text-muted">{note}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={add}>
          Add a {repeat.noun}
        </button>
        {actions}
      </div>
    </div>
  );
}

function SortableRow({
  id,
  noun,
  text,
  expanded,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  children,
}: {
  id: string;
  noun: string;
  text: string;
  expanded: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const label = text || `New ${noun}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded border border-line bg-white ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          className="cursor-grab px-1 text-[#a9a298] touch-none"
          aria-label={`Drag ${label} to reorder`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className={`min-w-0 flex-1 truncate py-1 text-left text-sm ${text ? "" : "italic text-muted"}`}
        >
          {label}
        </button>
        {/* Hover or focus on a pointer device; always there where there is no
            hover to wait for — a phone has no other way to move a row. */}
        <span className="flex shrink-0 gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            className="px-1.5 text-xs text-muted hover:text-ink disabled:opacity-25"
            disabled={!canMoveUp}
            aria-label={`Move ${label} up`}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="px-1.5 text-xs text-muted hover:text-ink disabled:opacity-25"
            disabled={!canMoveDown}
            aria-label={`Move ${label} down`}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </span>
      </div>
      {expanded ? <div className="border-t border-line p-3">{children}</div> : null}
    </li>
  );
}
