"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPerson, removePerson, renamePerson, restorePerson } from "@/server/actions/people";
import { InlineText } from "@/components/guests/inline-text";
import type { PersonRow } from "@/lib/types/database";

/**
 * People you can hand a task to who aren't one of the two collaborators — the
 * wedding planner, a florist, a parent helping out (spec 39). A name is all
 * they need; they appear in the assign picker after the collaborators. Whether
 * a person can also sign in is the "Access" block beside each name.
 */
export function PeopleEditor({
  people,
  accessSlot,
}: {
  people: PersonRow[];
  /** Part C — renders the sign-in controls for one person. */
  accessSlot?: (person: PersonRow) => React.ReactNode;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = people.filter((p) => !p.deleted_at);
  const removed = people.filter((p) => p.deleted_at);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addPerson(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setError(null);
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <p className="text-sm text-muted">Nobody added yet.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {active.map((p) => (
            <li key={p.id} className="space-y-2 p-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <InlineText
                    value={p.name}
                    ariaLabel="Name"
                    onSave={async (next) => {
                      const result = await renamePerson(p.id, next);
                      if (result.ok) router.refresh();
                      return result;
                    }}
                    className="text-sm"
                  />
                </span>
                {p.access === "none" ? (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-red-700"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove ${p.name}? Their tasks keep their name.`)) run(() => removePerson(p.id));
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {accessSlot ? accessSlot(p) : null}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap gap-2">
        <input
          className="field max-w-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a person, e.g. Pat (planner)"
          aria-label="New person's name"
          maxLength={80}
        />
        <button type="submit" className="btn" disabled={pending || name.trim() === ""}>
          Add
        </button>
      </form>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      {removed.length > 0 ? (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Removed ({removed.length})</summary>
          <ul className="mt-1 space-y-1">
            {removed.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span>{p.name}</span>
                <button type="button" className="underline" disabled={pending} onClick={() => run(() => restorePerson(p.id))}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
