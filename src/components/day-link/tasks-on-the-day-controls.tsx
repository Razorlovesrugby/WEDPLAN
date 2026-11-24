"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignToItems, removeAssignee } from "@/server/actions/day-planning";
import { makeDayLink } from "@/server/actions/day-links";

type Assignee = { type: "vendor" | "guest" | "person"; id: string };

export function TasksOnTheDayControls(
  props:
    | { mode: "remove"; itemId: string; assignee: Assignee }
    | { mode: "assign"; assignee: Assignee; options: { id: string; label: string }[]; hasLink: boolean },
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");

  if (props.mode === "remove") {
    return (
      <button
        className="btn text-red-700"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await removeAssignee(props.itemId, props.assignee);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
      >
        Remove
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" aria-label="Assign a job" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">+ Assign a job…</option>
          {props.options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button
          className="btn"
          disabled={pending || !chosen}
          onClick={() =>
            startTransition(async () => {
              const r = await assignToItems([chosen], props.assignee);
              if (!r.ok) return setError(r.error);
              setChosen("");
              router.refresh();
            })
          }
        >
          Assign
        </button>
        {!props.hasLink ? (
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await makeDayLink(props.assignee);
                if (!r.ok) return setError(r.error);
                router.refresh();
              })
            }
          >
            Make their link
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
