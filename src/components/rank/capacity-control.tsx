"use client";

import { useState, useTransition } from "react";
import { rebalanceRanks, setCapacity } from "@/server/actions/rank";

export function CapacityControl({
  capacity,
  aboveCutSeats,
  rebalanceOffered,
}: {
  capacity: number | null;
  aboveCutSeats: number;
  rebalanceOffered: boolean;
}) {
  const [value, setValue] = useState(capacity === null ? "" : String(capacity));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = value.trim() === "" ? null : Number(value);
  const over = parsed !== null && aboveCutSeats > parsed;

  function save() {
    startTransition(async () => {
      const result = await setCapacity(parsed);
      setMessage(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label>
        <span className="mb-1 block text-xs text-muted">Venue capacity (seats)</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          className="field w-36"
        />
      </label>

      <p className={`pb-2 text-sm ${over ? "text-red-700" : "text-muted"}`}>
        {parsed === null
          ? "No capacity set — the dashed line needs one."
          : over
            ? `${aboveCutSeats - parsed} seats over. Move the cut line up, or the venue.`
            : `${parsed - aboveCutSeats} seats spare above the cut.`}
      </p>

      {rebalanceOffered ? (
        <button
          type="button"
          className="btn ml-auto"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await rebalanceRanks();
              setMessage(
                result.ok ? `Rewrote ${result.data.rewritten} ranks` : result.error,
              );
            })
          }
          title="Rank keys have grown long from repeated reordering. This rewrites them evenly."
        >
          Tidy ranking keys
        </button>
      ) : null}

      {message ? <p className="pb-2 text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
