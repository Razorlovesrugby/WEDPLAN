"use client";

import { useState } from "react";
import { pluralise } from "@/lib/format";
import { colourLegend, parseColourBy, serialiseColourBy } from "@/lib/seating/colour";
import { declinedSeatedGuestIds } from "@/lib/seating/warnings";
import { useSeating } from "./seating-state";

/**
 * The header (§B.2): the plan's totals, every warning one tap away, the
 * colour-by switch and its key, and the one bulk action — returning everyone
 * who has declined to the tray. Nothing here is ever removed automatically.
 */
export function SummaryBar() {
  const { summary, warnings, colourBy, setColourBy, data, move, openTable } = useSeating();
  const [showWarnings, setShowWarnings] = useState(false);
  const declined = declinedSeatedGuestIds(warnings);
  const legend = colourLegend(colourBy, data.colour);
  const problems = warnings.filter((w) => w.severity === "warning");
  const info = warnings.filter((w) => w.severity === "info");

  return (
    <div className="card space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <strong className="tabular-nums">{summary.seated}</strong> of{" "}
          <span className="tabular-nums">{summary.attending}</span> seated
        </span>
        <span className="text-muted">{pluralise(summary.unseated, "still to seat", "still to seat")}</span>
        <span className="text-muted">{pluralise(summary.emptyChairs, "empty chair")}</span>
        {summary.overCapacityTables > 0 ? (
          <span className="text-red-700">{pluralise(summary.overCapacityTables, "table")} over</span>
        ) : null}
        <button
          type="button"
          className={`ml-auto rounded px-2 py-1 text-sm ${
            problems.length > 0 ? "bg-amber-50 text-amber-900 hover:bg-amber-100" : "text-muted hover:bg-line/40"
          }`}
          aria-expanded={showWarnings}
          onClick={() => setShowWarnings((s) => !s)}
        >
          {problems.length > 0 ? `⚠ ${pluralise(problems.length, "warning")}` : "No warnings"}
          {info.length > 0 ? ` · ${info.length} note${info.length === 1 ? "" : "s"}` : ""}
        </button>
      </div>

      {showWarnings && warnings.length > 0 ? (
        <ul className="max-h-60 space-y-1 overflow-y-auto border-t border-line pt-2 text-sm">
          {[...problems, ...info].map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className={w.severity === "warning" ? "text-amber-700" : "text-muted"}>
                {w.severity === "warning" ? "⚠" : "ℹ"}
              </span>
              <span className="flex-1">{w.message}</span>
              {w.tableIds[0] ? (
                <button type="button" className="text-xs text-muted underline" onClick={() => openTable(w.tableIds[0]!)}>
                  Show
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showWarnings ? (
        <p className="text-xs text-muted">
          Warnings never stop you — some rules you&rsquo;ll break on purpose. They&rsquo;re here so you don&rsquo;t have to
          remember them.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">Colour by</span>
          <select
            className="field w-auto py-1"
            value={serialiseColourBy(colourBy)}
            onChange={(e) => setColourBy(parseColourBy(e.target.value))}
          >
            <option value="">Nothing</option>
            <option value="side">Side</option>
            {data.colour.tags.map((t) => (
              <option key={t.id} value={`tag:${t.id}`}>
                Tag: {t.name}
              </option>
            ))}
            {data.colour.questions.map((q) => (
              <option key={q.id} value={`q:${q.id}`}>
                Answer: {q.label}
              </option>
            ))}
          </select>
        </label>
        {legend.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {legend.map((e) => (
              <li key={e.label} className="flex items-center gap-1">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.colour }} />
                {e.label}
              </li>
            ))}
          </ul>
        ) : data.colour.questions.length === 0 ? (
          <span className="text-xs text-muted">
            Ask a single-choice question on the RSVP (a meal choice, say) to colour by its answers.
          </span>
        ) : null}
        {declined.length > 0 ? (
          <button type="button" className="btn ml-auto py-1" onClick={() => move(declined, null)}>
            Take {pluralise(declined.length, "declined guest")} off their tables
          </button>
        ) : null}
      </div>
    </div>
  );
}
