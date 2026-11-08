"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvitations } from "@/server/actions/invitations";
import { setHouseholdEventInvite } from "@/server/actions/invites";

type GridRow = { householdId: string; name: string; invitationId: string | null; invitedEventIds: string[] };

/**
 * Invitation → Who (spec 42 §5.6): households down the side, events across
 * the top, a tick where a household is invited. A household without an
 * invitation yet is picked in the first column and made in one go below, as
 * the invitations table did; after that its ticks write straight through
 * `setHouseholdEventInvite`, the same action as the household page.
 *
 * A tick is the household as a whole. Anyone singled out in or out is set on
 * the household's own page, which the name links to.
 */
export function EventGrid({ rows, events }: { rows: GridRow[]; events: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [chosenEvents, setChosenEvents] = useState<Set<string>>(new Set(events.map((event) => event.id)));
  const withoutInvitation = rows.filter((row) => !row.invitationId);

  function run(task: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.error ?? "That didn't save.");
        return;
      }
      setError(null);
      setNotice(done ?? null);
      router.refresh();
    });
  }

  function flip(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  if (events.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        No events yet.{" "}
        <Link href="/events" className="underline">
          Add the ceremony, reception and the rest
        </Link>{" "}
        first; then tick who&rsquo;s invited to each here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {withoutInvitation.length > 0 ? (
        <div className="card space-y-3 p-4 text-sm">
          <p>
            <strong className="font-medium">{withoutInvitation.length}</strong> household
            {withoutInvitation.length === 1 ? " has" : "s have"} no invitation yet. Pick them in the first column,
            choose their events, and make their invitations.
          </p>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
            <legend className="sr-only">Events for the new invitations</legend>
            {events.map((event) => (
              <label key={event.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={chosenEvents.has(event.id)}
                  onChange={() => setChosenEvents((set) => flip(set, event.id))}
                />
                {event.name}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setPicked(new Set(withoutInvitation.map((row) => row.householdId)))}
            >
              Pick all {withoutInvitation.length}
            </button>
            <button
              type="button"
              id="create-invitations"
              className="btn-primary"
              disabled={pending || picked.size === 0 || chosenEvents.size === 0}
              onClick={() =>
                run(async () => {
                  const result = await createInvitations([...picked], [...chosenEvents]);
                  if (result.ok) setPicked(new Set());
                  return result;
                }, `Made ${picked.size} invitation${picked.size === 1 ? "" : "s"}.`)
              }
            >
              Make invitations for {picked.size} picked
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-muted" role="status">{notice}</p> : null}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">Household</th>
              {events.map((event) => (
                <th key={event.id} scope="col" className="px-3 py-2 text-center">
                  {event.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const invited = new Set(row.invitedEventIds);
              return (
                <tr key={row.householdId}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      {!row.invitationId ? (
                        <input
                          type="checkbox"
                          aria-label={`Pick ${row.name} for a new invitation`}
                          checked={picked.has(row.householdId)}
                          onChange={() => setPicked((set) => flip(set, row.householdId))}
                        />
                      ) : null}
                      <Link href={`/households/${row.householdId}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </span>
                  </th>
                  {events.map((event) => (
                    <td key={event.id} className="px-3 py-2 text-center">
                      {row.invitationId ? (
                        <input
                          type="checkbox"
                          aria-label={`${row.name} invited to ${event.name}`}
                          checked={invited.has(event.id)}
                          disabled={pending}
                          onChange={(input) =>
                            run(() => setHouseholdEventInvite(row.householdId, event.id, input.target.checked))
                          }
                        />
                      ) : (
                        <span className="text-muted" aria-label="No invitation yet">
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
