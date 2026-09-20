"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { InlineText } from "./inline-text";
import { HouseholdPicker } from "./household-picker";
import { InviteCell } from "./invite-cell";
import { moveGuests, setGuestTags, updateGuest } from "@/server/actions/guests";
import { setEventInviteForHouseholds } from "@/server/actions/invites";
import { inviteState } from "@/lib/invites";
import { guestName, sideLabel } from "@/lib/format";
import { tierBadgeClass } from "@/lib/tier-colors";
import type { GuestListItem } from "@/server/queries/guests";
import type {
  CollaboratorRow,
  EventRow,
  GuestEventInviteView,
  HouseholdView,
  TagRow,
} from "@/lib/types/database";

export function GuestsTable({
  guests,
  tags,
  events,
  households,
  collaborators,
  invites,
}: {
  guests: GuestListItem[];
  tags: TagRow[];
  events: EventRow[];
  households: HouseholdView[];
  collaborators: CollaboratorRow[];
  /** `v_guest_event_invites` for this wedding — who is invited to what. */
  invites: GuestEventInviteView[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Keyed lookup rather than a filter per cell: a hundred guests by five
  // events is five hundred cells, and each one asks this question once.
  const inviteByPair = useMemo(
    () => new Map(invites.map((row) => [`${row.guest_id}:${row.event_id}`, row])),
    [invites],
  );

  /**
   * The column header invites or removes every household currently on screen
   * — which is the filtered set, deliberately: "invite tier A to the evening
   * do" is the filter plus this button, and doing it to households the
   * planner cannot see would be a surprise.
   */
  function inviteEveryoneShown(event: EventRow, invited: boolean) {
    const householdIds = [...new Set(guests.map((guest) => guest.household_id))];
    const verb = invited ? "Invite" : "Remove";
    if (
      !window.confirm(
        `${verb} all ${householdIds.length} households shown ${invited ? "to" : "from"} ${event.name}? Anyone singled out individually keeps the setting you gave them.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setEventInviteForHouseholds(householdIds, event.id, invited);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.data.skipped > 0
          ? `${result.data.changed} updated · ${result.data.skipped} skipped (no invitation yet)`
          : `${result.data.changed} households updated`,
      );
    });
  }
  const allSelected = guests.length > 0 && selected.size === guests.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkTag(action: "add" | "remove") {
    if (!bulkTag || selected.size === 0) return;
    startTransition(async () => {
      const result = await setGuestTags([...selected], bulkTag, action);
      if (result.ok) {
        setMessage(
          `${action === "add" ? "Tagged" : "Untagged"} ${result.data.affected} ` +
            `${result.data.affected === 1 ? "guest" : "guests"}`,
        );
        setSelected(new Set());
      } else {
        setMessage(result.error);
      }
    });
  }

  async function moveSelection(targetHouseholdId: string) {
    const result = await moveGuests([...selected], targetHouseholdId);
    if (result.ok) {
      setMessage(`Moved ${result.data.moved} ${result.data.moved === 1 ? "guest" : "guests"}`);
      setSelected(new Set());
    }
    return result;
  }

  if (guests.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-muted">
        No guests match these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-line bg-white p-2 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className="field w-auto">
            <option value="">Choose a tag…</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={!bulkTag || pending} onClick={() => applyBulkTag("add")}>
            Add tag
          </button>
          <button type="button" className="btn" disabled={!bulkTag || pending} onClick={() => applyBulkTag("remove")}>
            Remove tag
          </button>
          <span className="border-l border-line pl-2">
            <HouseholdPicker households={households} label="Move to household…" move={moveSelection} />
          </span>
          <button type="button" className="btn ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(guests.map((g) => g.id)))
                  }
                />
              </th>
              <th scope="col" className="px-3 py-2">First name</th>
              <th scope="col" className="px-3 py-2">Last name</th>
              <th scope="col" className="px-3 py-2">Household</th>
              <th scope="col" className="px-3 py-2">Tier</th>
              <th scope="col" className="px-3 py-2">Side</th>
              <th scope="col" className="px-3 py-2">Email</th>
              <th scope="col" className="px-3 py-2">Dietary</th>
              <th scope="col" className="px-3 py-2">Tags</th>
              {events.map((event) => (
                <th key={event.id} scope="col" className="px-3 py-2" title={event.name}>
                  <span className="block">{event.name}</span>
                  <span className="mt-0.5 block text-[0.65rem] font-normal text-muted">
                    <button
                      type="button"
                      className="hover:underline disabled:opacity-50"
                      disabled={pending || guests.length === 0}
                      onClick={() => inviteEveryoneShown(event, true)}
                    >
                      invite all
                    </button>
                    {" · "}
                    <button
                      type="button"
                      className="hover:underline disabled:opacity-50"
                      disabled={pending || guests.length === 0}
                      onClick={() => inviteEveryoneShown(event, false)}
                    >
                      none
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => {
              const rsvpByEvent = new Map(guest.rsvps.map((r) => [r.event_id, r.status]));
              return (
                <tr key={guest.id} className="border-b border-line/60 last:border-0 hover:bg-paper">
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${guestName(guest)}`}
                      checked={selected.has(guest.id)}
                      onChange={() => toggle(guest.id)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/guests/${guest.id}`} className="font-medium hover:underline">
                      {guest.preferred_name?.trim() || guest.first_name}
                    </Link>
                    {guest.age_band !== "adult" ? (
                      <span className="ml-1.5 text-xs text-muted">({guest.age_band})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <InlineText
                      value={guest.last_name}
                      placeholder="—"
                      ariaLabel={`Last name for ${guestName(guest)}`}
                      onSave={(next) => updateGuest(guest.id, { last_name: next })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/households/${guest.household_id}`} className="text-muted hover:underline">
                      {guest.household_name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${tierBadgeClass(guest.tier_position)}`}
                    >
                      {guest.tier}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {guest.side ? (
                      <span className="rounded bg-paper px-1.5 py-0.5 text-xs font-medium">
                        {sideLabel(guest.side, collaborators)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <InlineText
                      value={guest.email}
                      placeholder="—"
                      ariaLabel={`Email for ${guestName(guest)}`}
                      onSave={(next) => updateGuest(guest.id, { email: next })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <InlineText
                      value={guest.dietary}
                      placeholder="—"
                      ariaLabel={`Dietary requirements for ${guestName(guest)}`}
                      onSave={(next) => updateGuest(guest.id, { dietary: next })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap gap-1">
                      {guest.tag_ids.map((id) => {
                        const tag = tagById.get(id);
                        if (!tag) return null;
                        return (
                          <span
                            key={id}
                            className="rounded px-1.5 py-0.5 text-xs"
                            style={{ backgroundColor: `${tag.colour}22`, color: tag.colour }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  {events.map((event) => {
                    const invite = inviteByPair.get(`${guest.id}:${event.id}`);
                    return (
                      <InviteCell
                        key={event.id}
                        guestId={guest.id}
                        householdId={guest.household_id}
                        eventId={event.id}
                        guestName={guestName(guest)}
                        eventName={event.name}
                        state={inviteState(invite, rsvpByEvent.get(event.id))}
                        overridden={invite?.override != null}
                        hasInvitation={invite?.invitation_id != null}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        {guests.length} {guests.length === 1 ? "guest" : "guests"} shown. Last name, email, and
        dietary are editable here; everything else is on the guest page. Click an event cell to
        invite someone, mark their invitation as sent, or record an answer — a dot means that
        person is set differently from their household.
      </p>
    </div>
  );
}
