"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCutLine, removeCutLine, renameCutLine, reorderCutLine, setCutLine } from "@/server/actions/rank";
import { tierTextClass } from "@/lib/tier-colors";
import type { CutLineRow, HouseholdView } from "@/lib/types/database";

/**
 * The numeric/typed alternative to dragging on /guests/rank — spec 03
 * section 7, decision 3, generalised past two fixed lines to however many
 * the planner wants (spec 5, part A). One row per configured `cut_lines`
 * row: a household picker (which household falls to it — the household's
 * own rank is read server-side, never sent from here), a label, reorder
 * controls, and a remove control on every row except when it is the only
 * one left.
 *
 * The last row by position is always the trailing catch-all — its boundary
 * is enforced null at the action layer, so it has no household picker at
 * all, only "everyone else."
 */
export function CutLinePicker({
  households,
  cutLines,
}: {
  households: HouseholdView[];
  cutLines: CutLineRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  const ordered = [...cutLines].sort((a, b) => a.position - b.position);
  const lastPosition = ordered[ordered.length - 1]?.position;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(result.error ?? "Something went wrong");
      }
    });
  }

  function onAdd() {
    if (!newLabel.trim()) return;
    run(async () => {
      const result = await addCutLine(newLabel.trim());
      if (result.ok) setNewLabel("");
      return result;
    });
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-2">
        {ordered.map((line, index) => {
          const isLast = line.position === lastPosition;
          const currentHouseholdId = isLast
            ? ""
            : (households.find((h) => h.rank === line.boundary_rank)?.id ?? "");

          return (
            <li key={line.id} className="flex flex-wrap items-center gap-2 rounded border border-line p-2">
              <span className={`w-4 shrink-0 text-center text-xs font-medium ${tierTextClass(index)}`}>
                {index + 1}
              </span>

              <input
                defaultValue={line.label}
                disabled={pending}
                aria-label={`Line ${index + 1} name`}
                className="field w-32 shrink-0 text-sm"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== line.label) run(() => renameCutLine(line.id, next));
                }}
              />

              {isLast ? (
                <span className="flex-1 text-sm text-muted">Everyone else</span>
              ) : (
                <select
                  className="field flex-1 text-sm"
                  disabled={pending}
                  value={currentHouseholdId}
                  onChange={(e) => run(() => setCutLine(line.id, e.target.value || null))}
                >
                  <option value="">No boundary set — tier sits empty</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      Last in this tier: {h.display_name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  aria-label={`Move line ${index + 1} up`}
                  disabled={pending || index === 0}
                  onClick={() => run(() => reorderCutLine(line.id, "up"))}
                  className="rounded px-1 text-xs text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move line ${index + 1} down`}
                  disabled={pending || index === ordered.length - 1}
                  onClick={() => run(() => reorderCutLine(line.id, "down"))}
                  className="rounded px-1 text-xs text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
                >
                  ↓
                </button>
              </div>

              {ordered.length > 1 ? (
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 text-xs text-red-700 hover:underline"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove "${line.label}"? Its households merge into the tier below — nothing about any household changes.`,
                      )
                    ) {
                      run(() => removeCutLine(line.id));
                    }
                  }}
                >
                  Remove
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {ordered.length < 8 ? (
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New line name"
            disabled={pending}
            className="field w-40 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
          />
          <button type="button" className="btn" disabled={pending || !newLabel.trim()} onClick={onAdd}>
            Add another line
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">Eight lines is the most a wedding can have.</p>
      )}

      <p className="text-xs text-muted">
        Same as dragging on{" "}
        <a href="/guests/rank" className="underline">
          the ranking screen
        </a>{" "}
        — this just sets each line directly instead of dragging to it.
      </p>
    </div>
  );
}
