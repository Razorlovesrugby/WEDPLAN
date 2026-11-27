"use client";

import { useState, useTransition } from "react";
import { DietaryNeedsEditor } from "@/components/dietary-needs-editor";
import { parseDietaryNeeds, type DietaryNeed } from "@/lib/dietary";
import { saveGuestDietaryNeeds } from "@/server/actions/dietary";

/**
 * The editor with its own Save, for a guest on a planner screen. Saves the
 * whole set through `saveGuestDietaryNeeds` and says so.
 */
export function GuestDietaryNeeds({
  guestId,
  initial,
  onSaved,
  label,
}: {
  guestId: string;
  initial: DietaryNeed[];
  onSaved?: (needs: DietaryNeed[]) => void;
  label?: string;
}) {
  const [needs, setNeeds] = useState<DietaryNeed[]>(initial);
  const [saved, setSaved] = useState<DietaryNeed[]>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const clean = parseDietaryNeeds(needs);
  const dirty = JSON.stringify(clean) !== JSON.stringify(parseDietaryNeeds(saved));

  return (
    <div className="space-y-2">
      <DietaryNeedsEditor value={needs} onChange={(next) => { setNeeds(next); setMessage(null); }} disabled={pending} label={label} />
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className="btn-primary py-1"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const r = await saveGuestDietaryNeeds(guestId, clean);
              if (!r.ok) {
                setMessage(r.error);
                return;
              }
              setSaved(clean);
              setNeeds(clean);
              setMessage("Saved");
              onSaved?.(clean);
            })
          }
        >
          {pending ? "Saving…" : "Save dietary needs"}
        </button>
        {message ? (
          <span role="status" className={message === "Saved" ? "text-muted" : "text-red-700"}>
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
