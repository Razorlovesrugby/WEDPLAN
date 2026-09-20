"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHouseholdEventInvite } from "@/server/actions/invites";
import { listNames } from "@/lib/invites";

/**
 * "Everyone here" — the household-level tick, per event (spec 22 §5).
 *
 * The grid on `/guests` is where one person gets singled out; this is where
 * the household as a whole is invited or removed, which is the common case.
 *
 * It names anybody who is set differently rather than hiding it, because the
 * checkbox is otherwise lying: ticked, with a child excluded underneath it, is
 * a state the planner has to be able to see from the screen they set it on.
 */
export function HouseholdEvents({
  householdId,
  events,
  invitedEventIds,
  exceptions,
  hasInvitation,
}: {
  householdId: string;
  events: { id: string; name: string }[];
  /** Events the household's own invitation covers. */
  invitedEventIds: Set<string>;
  /** Per event: the names of people singled out, in or out. */
  exceptions: Map<string, { added: string[]; removed: string[] }>;
  hasInvitation: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(eventId: string, invited: boolean) {
    startTransition(async () => {
      const result = await setHouseholdEventInvite(householdId, eventId, invited);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted">No events yet.</p>;
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {events.map((event) => {
          const exception = exceptions.get(event.id);
          return (
            <li key={event.id} className="text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={invitedEventIds.has(event.id)}
                  disabled={pending || !hasInvitation}
                  onChange={(input) => toggle(event.id, input.target.checked)}
                />
                <span>{event.name}</span>
              </label>
              {exception && exception.removed.length > 0 ? (
                <span className="ml-6 block text-xs text-muted">
                  not {listNames(exception.removed)}
                </span>
              ) : null}
              {exception && exception.added.length > 0 ? (
                <span className="ml-6 block text-xs text-muted">
                  plus {listNames(exception.added)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {!hasInvitation ? (
        <p className="mt-2 text-xs text-muted">
          Create their invitation on Invitations first — an event needs an invitation to hang on.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <p className="mt-2 text-xs text-muted">
        Ticking covers everyone here. To invite just one person, use their row on Guests.
      </p>
    </div>
  );
}
