"use client";

import { useState, useTransition } from "react";

/**
 * A table cell you can type in.
 *
 * Saves on blur, and only when the value actually changed — tabbing across a
 * row of twelve guests should not fire twelve writes. While saving, the cell
 * keeps the typed value rather than reverting, so a slow network never looks
 * like lost work.
 */
export function InlineText({
  value,
  placeholder,
  ariaLabel,
  onSave,
}: {
  value: string | null;
  placeholder?: string;
  ariaLabel: string;
  onSave: (next: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    const next = draft.trim();
    if (next === (value ?? "")) {
      setError(null);
      return;
    }
    startTransition(async () => {
      const result = await onSave(next);
      setError(result.ok ? null : (result.error ?? "Could not save"));
    });
  }

  return (
    <span className="block">
      <input
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        value={draft}
        placeholder={placeholder}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setError(null);
            e.currentTarget.blur();
          }
        }}
        className={`w-full rounded border bg-transparent px-1.5 py-1 text-sm outline-none
          focus:border-accent focus:bg-white
          ${error ? "border-red-400" : "border-transparent hover:border-line"}
          ${pending ? "opacity-60" : ""}`}
      />
      {error ? <span className="px-1.5 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
