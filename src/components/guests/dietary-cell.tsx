"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GuestDietaryNeeds } from "@/components/guest-dietary-needs";
import { dietarySummary, hasAllergy, type DietaryNeed } from "@/lib/dietary";

/**
 * The guest table's Dietary cell (spec 57 Part H): the free-text note as it
 * was (passed in as `children`), the tags under it, and a small editor for
 * the tags that opens in place.
 */
export function DietaryCell({ guestId, name, needs, children }: { guestId: string; name: string; needs: DietaryNeed[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-1">
      {children}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {needs.length > 0 ? <span className={hasAllergy(needs) ? "font-medium text-red-800" : "text-muted"}>{dietarySummary(needs)}</span> : null}
        <button type="button" className="underline text-muted" aria-expanded={open} aria-label={`Dietary tags for ${name}`} onClick={() => setOpen(!open)}>
          {open ? "Close" : needs.length > 0 ? "Edit tags" : "Add tags"}
        </button>
      </div>
      {open ? (
        <div className="rounded border border-line bg-white p-2">
          <GuestDietaryNeeds
            guestId={guestId}
            initial={needs}
            label={`${name}'s dietary needs`}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
