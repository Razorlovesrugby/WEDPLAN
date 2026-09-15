"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchHouseholds, type HouseholdOption } from "@/lib/household-search";
import { createHousehold } from "@/server/actions/guests";
import type { ActionResult } from "@/server/actions/result";

/**
 * A type-to-filter combobox for choosing a destination household, with an
 * inline "create new household and move here" escape hatch — so splitting a
 * household (moving one person out to their own record) is one action, not a
 * trip to `/households/new` and back to find them again.
 *
 * `households` is whatever the page already loaded (`listHouseholds`); this
 * filters in memory rather than issuing a query per keystroke, which is fine
 * up to the few hundred households a wedding actually has.
 */
export function HouseholdPicker({
  households,
  excludeIds = [],
  label,
  move,
}: {
  households: HouseholdOption[];
  excludeIds?: string[];
  label: string;
  move: (targetHouseholdId: string) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(
    () => households.filter((h) => !excludeIds.includes(h.id)),
    [households, excludeIds],
  );
  const options = useMemo(() => searchHouseholds(candidates, query).slice(0, 8), [candidates, query]);

  function reset() {
    setOpen(false);
    setQuery("");
    setError(null);
  }

  function commit(targetHouseholdId: string) {
    startTransition(async () => {
      const result = await move(targetHouseholdId);
      if (result.ok) {
        reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function createAndMove() {
    const name = query.trim();
    if (!name) return;
    startTransition(async () => {
      const created = await createHousehold({ display_name: name });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      const result = await move(created.data.id);
      if (result.ok) {
        reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs text-accent hover:underline"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {label}
      </button>
    );
  }

  const trimmed = query.trim();
  const exactMatch = options.some((h) => h.display_name.toLowerCase() === trimmed.toLowerCase());

  return (
    <span className="relative inline-block">
      <input
        ref={inputRef}
        value={query}
        disabled={pending}
        placeholder="Search households…"
        aria-label="Search households"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") reset();
          if (e.key === "Enter" && options[0]) commit(options[0].id);
        }}
        className="field w-56 text-sm"
      />
      <span className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-line bg-white shadow-md">
        <ul className="max-h-56 overflow-y-auto py-1 text-sm">
          {options.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                disabled={pending}
                className="block w-full px-3 py-1.5 text-left hover:bg-paper"
                onClick={() => commit(h.id)}
              >
                {h.display_name}
              </button>
            </li>
          ))}
          {options.length === 0 && !trimmed ? (
            <li className="px-3 py-1.5 text-xs text-muted">No other households yet.</li>
          ) : null}
        </ul>
        {trimmed && !exactMatch ? (
          <button
            type="button"
            disabled={pending}
            className="block w-full border-t border-line px-3 py-1.5 text-left text-sm text-accent hover:bg-paper"
            onClick={createAndMove}
          >
            + Create &ldquo;{trimmed}&rdquo; and move here
          </button>
        ) : null}
        <button
          type="button"
          className="block w-full border-t border-line px-3 py-1.5 text-left text-xs text-muted hover:bg-paper"
          onClick={reset}
        >
          Cancel
        </button>
      </span>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
