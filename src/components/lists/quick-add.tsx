"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quickAddItem } from "@/server/actions/lists";

/**
 * "type a title, hit enter, it's in the list" (spec 1, section 6) — no
 * modal, no separate date field. A date typed straight into the title
 * ("tomorrow", "next Friday") is parsed server-side and confirmed back so
 * the field can show what it understood before it disappears.
 */
export function QuickAdd({ listId, sectionId = null }: { listId: string; sectionId?: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const title = value.trim();
    if (!title) return;
    startTransition(async () => {
      const result = await quickAddItem(listId, sectionId, title);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setValue("");
      setConfirmed(result.data.due_date ? `Added, due ${result.data.due_date}` : "Added");
      router.refresh();
      setTimeout(() => setConfirmed(null), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder='Add an item — try "tomorrow" or "next Friday"'
        aria-label="Quick add an item"
        className="field text-sm"
      />
      {confirmed ? <span className="shrink-0 text-xs text-muted">{confirmed}</span> : null}
      {error ? <span className="shrink-0 text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
