"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { InlineText } from "./inline-text";
import { HouseholdPicker } from "./household-picker";
import { HouseholdLinks } from "./household-links";
import { InviteCell } from "./invite-cell";
import { SaveTheDateOpened } from "./save-the-date-cell";
import { HouseholdMark, StatusLegend } from "./status-mark";
import { moveGuests, setGuestTags, updateGuest } from "@/server/actions/guests";
import { setEventInviteForHouseholds } from "@/server/actions/invites";
import { inviteState, type InviteState } from "@/lib/invites";
import {
  GUEST_VIEWS,
  columnsFor,
  groupByHousehold,
  parseGrouped,
  parseGuestView,
  type GuestColumn,
  type GuestView,
  type HouseholdGroup,
  type HouseholdSummary,
} from "@/lib/guest-table";
import { guestName, sideLabel } from "@/lib/format";
import { tierBadgeClass } from "@/lib/tier-colors";
import type { GuestListItem } from "@/server/queries/guests";
import type { SaveTheDateOpens } from "@/server/queries/save-the-date";
import type {
  CollaboratorRow,
  EventRow,
  GuestEventInviteView,
  HouseholdView,
  TagRow,
} from "@/lib/types/database";

/**
 * The guest list (spec 47).
 *
 * Grouped by household by default, because invitations go to households: the
 * household row carries what's shared (tier, address, save the date, links,
 * a summary per event), and its people sit underneath with what's theirs. A
 * household of one is a single row. The View control swaps which columns
 * show, so most jobs fit without scrolling sideways; Everything keeps every
 * column, with the name pinned.
 *
 * View and grouping live in the URL (`?view=`, `?rows=people`), like the
 * filters, but switching them doesn't reload anything: the rows are already
 * here.
 */

const AGE_WORDS = { adult: "Adult", child: "Child", infant: "Infant" } as const;

/**
 * How a row for someone who can't come is quietened: grey text and colours,
 * not transparency, so it stays readable (WCAG contrast). The name cell only
 * greys its text, keeping the "Can't attend" chip in colour.
 */
const FADED = "text-muted grayscale";
const FADED_NAME = "text-muted";

export function GuestsTable({
  guests,
  tags,
  events,
  households,
  collaborators,
  invites,
  weddingSlug,
  saveTheDateOpens,
  invitationIds,
  householdSummaries,
  weddingName,
  dateLabel,
}: {
  guests: GuestListItem[];
  tags: TagRow[];
  events: EventRow[];
  households: HouseholdView[];
  collaborators: CollaboratorRow[];
  /** `v_guest_event_invites` for this wedding — who is invited to what. */
  invites: GuestEventInviteView[];
  weddingSlug: string;
  /** Save-the-date opens by household id (0031). */
  saveTheDateOpens: Record<string, SaveTheDateOpens>;
  /** Each household's invitation id, for its Links menu. */
  invitationIds: Record<string, string>;
  /** The household rows' event cells and size, from the whole household. */
  householdSummaries: Record<string, HouseholdSummary>;
  /** For the WhatsApp message in each household's Links menu. */
  weddingName: string;
  dateLabel: string;
}) {
  const searchParams = useSearchParams();
  const view = parseGuestView(searchParams.get("view"));
  const grouped = parseGrouped(searchParams.get("rows"));
  const columns = columnsFor(view);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const householdById = useMemo(
    () => new Map(households.map((household) => [household.id, household])),
    [households],
  );

  // Keyed lookup rather than a filter per cell: a hundred guests by five
  // events is five hundred cells, and each one asks this question once.
  const inviteByPair = useMemo(
    () => new Map(invites.map((row) => [`${row.guest_id}:${row.event_id}`, row])),
    [invites],
  );

  const groups = useMemo(() => groupByHousehold(guests), [guests]);

  function stateFor(guest: GuestListItem, eventId: string): InviteState {
    const status = guest.rsvps.find((r) => r.event_id === eventId)?.status;
    return inviteState(inviteByPair.get(`${guest.id}:${eventId}`), status);
  }

  /** Change `?view=` or `?rows=` without a round trip; the rows are already here. */
  function setUrlParam(key: "view" | "rows", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/guests?${query}` : "/guests");
  }

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

  function toggleMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleCollapsed(householdId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(householdId)) next.delete(householdId);
      else next.add(householdId);
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

  // ---- cells -------------------------------------------------------------

  const multiGroups = groups.filter(
    (group) => (householdSummaries[group.householdId]?.size ?? group.guests.length) > 1,
  );
  const anyCollapsible = grouped && multiGroups.length > 0;
  const allCollapsed = anyCollapsible && multiGroups.every((group) => collapsed.has(group.householdId));

  const td = "px-3 py-1.5 align-middle";
  const nameTd = (extra = "") =>
    `sticky left-0 z-[1] whitespace-nowrap border-r border-line/60 px-3 py-1.5 align-middle ${extra}`;

  function tierChip(guest: GuestListItem) {
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tierBadgeClass(guest.tier_position)}`}>
        {guest.tier}
      </span>
    );
  }

  function sideChip(side: GuestListItem["side"]) {
    return side ? (
      <span className="whitespace-nowrap rounded bg-line/50 px-1.5 py-0.5 text-xs font-medium">
        {sideLabel(side, collaborators)}
      </span>
    ) : (
      <span className="text-muted">—</span>
    );
  }

  function tagChips(guest: GuestListItem) {
    if (guest.tag_ids.length === 0) return <span className="text-muted">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {guest.tag_ids.map((id) => {
          const tag = tagById.get(id);
          if (!tag) return null;
          return (
            <span
              key={id}
              className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs"
              style={{ backgroundColor: `${tag.colour}22`, color: tag.colour }}
            >
              {tag.name}
            </span>
          );
        })}
      </span>
    );
  }

  function addressCell(householdId: string, address: string | null) {
    return address ? (
      <span className="block max-w-[16rem] truncate text-xs" title={address}>
        {address}
      </span>
    ) : (
      <Link href={`/households/${householdId}`} className="text-xs text-amber-800 hover:underline">
        Add address
      </Link>
    );
  }

  function comingCell(guest: GuestListItem) {
    const invitedTo = events.filter((event) => stateFor(guest, event.id) !== "not_invited");
    if (invitedTo.length === 0) return <span className="text-muted">Not invited</span>;
    const yes = invitedTo.filter((event) => stateFor(guest, event.id) === "yes").length;
    return (
      <span className="tabular-nums" title={invitedTo.map((e) => e.name).join(", ")}>
        <span className="font-medium">{yes}</span>
        <span className="text-muted"> of {invitedTo.length}</span>
      </span>
    );
  }

  function eventCells(guest: GuestListItem, dimmed: boolean) {
    return events.map((event) => {
      const invite = inviteByPair.get(`${guest.id}:${event.id}`);
      return (
        <InviteCell
          key={event.id}
          guestId={guest.id}
          householdId={guest.household_id}
          eventId={event.id}
          guestName={guestName(guest)}
          eventName={event.name}
          state={stateFor(guest, event.id)}
          overridden={invite?.override != null}
          hasInvitation={invite?.invitation_id != null}
          dimmed={dimmed}
        />
      );
    });
  }

  function linksFor(householdId: string, householdName: string) {
    const household = householdById.get(householdId);
    return (
      <HouseholdLinks
        householdName={householdName}
        weddingSlug={weddingSlug}
        address={household ? { slug: household.slug, suffix: household.slug_suffix } : null}
        invitationId={invitationIds[householdId] ?? null}
        weddingName={weddingName}
        dateLabel={dateLabel}
      />
    );
  }

  function std(householdId: string) {
    const opens = saveTheDateOpens[householdId];
    return <SaveTheDateOpened lastViewedAt={opens?.lastViewedAt ?? null} viewCount={opens?.viewCount ?? 0} />;
  }

  /** The person's name: a link to their page, then their editable last name. */
  function personName(guest: GuestListItem, under?: ReactNode) {
    return (
      <span className="flex items-center gap-2.5">
        <input
          type="checkbox"
          aria-label={`Select ${guestName(guest)}`}
          checked={selected.has(guest.id)}
          onChange={() => toggle(guest.id)}
        />
        <span className="min-w-0">
          <span className="flex items-center">
            <Link href={`/guests/${guest.id}`} className="font-medium hover:underline">
              {guest.preferred_name?.trim() || guest.first_name}
            </Link>
            {/* Sized to the name, so a short surname doesn't leave a gap
                before the chips; it scrolls inside if typed longer. */}
            <span className="ml-0.5" style={{ width: `${Math.max(guest.last_name?.length ?? 0, 9) + 3}ch` }}>
              <InlineText
                value={guest.last_name}
                placeholder="Last name"
                ariaLabel={`Last name for ${guestName(guest)}`}
                onSave={(next) => updateGuest(guest.id, { last_name: next })}
              />
            </span>
            {guest.age_band !== "adult" ? (
              <span className="ml-1 rounded bg-line/50 px-1 text-[0.7rem] text-muted">{guest.age_band}</span>
            ) : null}
            {/* Still invited, so the grid's cells are unchanged — this is
                only the reminder that they won't be counted (spec 29). */}
            {guest.unable_to_attend_at ? (
              <span
                className="ml-1.5 rounded border border-tierB/50 bg-tierB/15 px-1 text-xs"
                title={
                  guest.unable_to_attend_via === "save_the_date"
                    ? "Told us they can't come, from their save the date"
                    : "You recorded that they can't come"
                }
              >
                Can&rsquo;t attend
              </span>
            ) : null}
          </span>
          {under}
        </span>
      </span>
    );
  }

  /**
   * A row for one person. `solo` is a household of one shown grouped: the row
   * carries the household's own cells too. `flat` adds the Household column.
   */
  function personRow(guest: GuestListItem, mode: "flat" | "solo") {
    const dim = guest.unable_to_attend_at !== null;
    const fade = dim ? FADED : "";
    const fullName = `${guest.first_name} ${guest.last_name ?? ""}`.trim();
    const showHouseholdUnder =
      mode === "solo" && guest.household_name.trim().toLowerCase() !== fullName.toLowerCase();
    return (
      <tr key={guest.id} className="group border-b border-line/60 bg-white hover:bg-paper/70">
        <td className={nameTd(`bg-white group-hover:bg-paper ${dim ? FADED_NAME : ""}`)}>
          {personName(
            guest,
            showHouseholdUnder ? (
              <Link
                href={`/households/${guest.household_id}`}
                className="block pl-1.5 text-xs text-muted hover:underline"
              >
                {guest.household_name}
              </Link>
            ) : null,
          )}
        </td>
        {mode === "flat" ? (
          <td className={`${td} whitespace-nowrap ${fade}`}>
            <Link href={`/households/${guest.household_id}`} className="text-muted hover:underline">
              {guest.household_name}
            </Link>
          </td>
        ) : null}
        {columns.map((column) => (
          <Fragment key={column}>{personCell(guest, column, dim, true)}</Fragment>
        ))}
      </tr>
    );
  }

  /**
   * One cell of a person's row. `withHousehold` is false under a household
   * row, where the household's own cells (tier, address, save the date,
   * links) are already shown once above.
   */
  function personCell(guest: GuestListItem, column: GuestColumn, dim: boolean, withHousehold: boolean, mixedSide = false) {
    const fade = dim ? FADED : "";
    switch (column) {
      case "tier":
        return <td className={`${td} ${fade}`}>{withHousehold ? tierChip(guest) : null}</td>;
      case "side":
        return <td className={`${td} ${fade}`}>{withHousehold || mixedSide ? sideChip(guest.side) : null}</td>;
      case "email":
        return (
          <td className={`${td} min-w-[12rem] ${fade}`}>
            <InlineText
              value={guest.email}
              placeholder="Add email"
              ariaLabel={`Email for ${guestName(guest)}`}
              onSave={(next) => updateGuest(guest.id, { email: next })}
            />
          </td>
        );
      case "address":
        return <td className={`${td} ${fade}`}>{withHousehold ? addressCell(guest.household_id, guest.household_address) : null}</td>;
      case "age":
        return <td className={`${td} whitespace-nowrap ${fade}`}>{AGE_WORDS[guest.age_band]}</td>;
      case "dietary":
        return (
          <td className={`${td} min-w-[11rem] ${fade}`}>
            <InlineText
              value={guest.dietary}
              placeholder="None given"
              ariaLabel={`Dietary requirements for ${guestName(guest)}`}
              onSave={(next) => updateGuest(guest.id, { dietary: next })}
            />
          </td>
        );
      case "coming":
        return <td className={`${td} whitespace-nowrap ${fade}`}>{comingCell(guest)}</td>;
      case "tags":
        return <td className={`${td} min-w-[9rem] ${fade}`}>{tagChips(guest)}</td>;
      case "std":
        return <td className={`${td} ${fade}`}>{withHousehold ? std(guest.household_id) : null}</td>;
      case "events":
        return <>{eventCells(guest, dim)}</>;
      case "links":
        return (
          <td className={`${td} text-right`}>
            {withHousehold ? linksFor(guest.household_id, guest.household_name) : null}
          </td>
        );
    }
  }

  /** The household's own cell for a column, on its row above its people. */
  function householdCell(group: HouseholdGroup<GuestListItem>, column: GuestColumn, mixedSide: boolean, fade: string) {
    const first = group.guests[0]!;
    const n = group.guests.length;
    switch (column) {
      case "tier":
        return <td className={`${td} ${fade}`}>{tierChip(first)}</td>;
      case "side":
        return (
          <td className={`${td} ${fade}`}>
            {mixedSide ? <span className="text-xs text-muted">Mixed</span> : sideChip(first.side)}
          </td>
        );
      case "email": {
        const have = group.guests.filter((guest) => guest.email).length;
        return (
          <td className={`${td} whitespace-nowrap text-xs ${fade}`} title={`${have} of ${n} have an email address`}>
            <span className={have === n ? "text-muted" : "text-amber-800"}>
              {have === n ? "All have email" : `${have} of ${n} have email`}
            </span>
          </td>
        );
      }
      case "address":
        return <td className={`${td} ${fade}`}>{addressCell(group.householdId, first.household_address)}</td>;
      case "age": {
        const counts = (["adult", "child", "infant"] as const)
          .map((band) => [band, group.guests.filter((guest) => guest.age_band === band).length] as const)
          .filter(([, count]) => count > 0)
          .map(([band, count]) => `${count} ${band === "child" && count > 1 ? "children" : `${band}${count > 1 ? "s" : ""}`}`);
        return <td className={`${td} whitespace-nowrap text-xs text-muted ${fade}`}>{counts.join(" · ")}</td>;
      }
      case "dietary": {
        const needs = group.guests.filter((guest) => guest.dietary?.trim()).length;
        return (
          <td className={`${td} whitespace-nowrap text-xs text-muted ${fade}`}>
            {needs > 0 ? `${needs} with needs` : null}
          </td>
        );
      }
      case "coming":
      case "tags":
        return <td className={td} />;
      case "std":
        return <td className={`${td} ${fade}`}>{std(group.householdId)}</td>;
      case "events":
        return (
          <>
            {events.map((event) => (
              <td key={event.id} className={`px-1 py-1.5 text-center ${fade}`}>
                <HouseholdMark
                  eventName={event.name}
                  summary={
                    householdSummaries[group.householdId]?.events[event.id] ?? { kind: "same", state: "not_invited" }
                  }
                />
              </td>
            ))}
          </>
        );
      case "links":
        return <td className={`${td} text-right`}>{linksFor(group.householdId, first.household_name)}</td>;
    }
  }

  function householdRows(group: HouseholdGroup<GuestListItem>) {
    const first = group.guests[0]!;
    const ids = group.guests.map((guest) => guest.id);
    const picked = ids.filter((id) => selected.has(id)).length;
    const isCollapsed = collapsed.has(group.householdId);
    // A filter can leave some of the household off screen.
    const size = householdSummaries[group.householdId]?.size ?? ids.length;
    const mixedSide = group.guests.some((guest) => guest.side !== first.side);
    const allUnable = group.guests.every((guest) => guest.unable_to_attend_at !== null);
    const fade = allUnable ? FADED : "";

    return (
      <Fragment key={group.householdId}>
        <tr className="group border-b border-line/60 bg-paper hover:bg-line/30">
          <td className={nameTd(`bg-paper group-hover:bg-[rgb(244_241_237)] ${allUnable ? FADED_NAME : ""}`)}>
            <span className="flex items-center gap-2.5">
              <input
                type="checkbox"
                aria-label={`Select ${size > ids.length ? "the people shown" : "everyone"} in ${first.household_name}`}
                checked={picked === ids.length}
                ref={(box) => {
                  if (box) box.indeterminate = picked > 0 && picked < ids.length;
                }}
                onChange={() => toggleMany(ids, picked < ids.length)}
              />
              <button
                type="button"
                onClick={() => toggleCollapsed(group.householdId)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Show" : "Hide"} the people in ${first.household_name}`}
                className="-mx-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-line/60 hover:text-ink"
              >
                <span aria-hidden className={`inline-block text-[0.7rem] transition-transform motion-reduce:transition-none ${isCollapsed ? "-rotate-90" : ""}`}>
                  ▼
                </span>
              </button>
              <Link href={`/households/${group.householdId}`} className="font-semibold hover:underline">
                {first.household_name}
              </Link>
              <span className="text-xs tabular-nums text-muted">
                {size > ids.length ? `${ids.length} of ${size} shown` : ids.length}
              </span>
            </span>
          </td>
          {columns.map((column) => (
            <Fragment key={column}>{householdCell(group, column, mixedSide, fade)}</Fragment>
          ))}
        </tr>
        {isCollapsed
          ? null
          : group.guests.map((guest) => {
              const dim = guest.unable_to_attend_at !== null;
              return (
                <tr key={guest.id} className="group border-b border-line/60 bg-white hover:bg-paper/70">
                  <td className={nameTd(`bg-white pl-10 group-hover:bg-paper ${dim ? FADED_NAME : ""}`)}>
                    {personName(guest)}
                  </td>
                  {columns.map((column) => (
                    <Fragment key={column}>{personCell(guest, column, dim, false, mixedSide)}</Fragment>
                  ))}
                </tr>
              );
            })}
      </Fragment>
    );
  }

  const th = "px-3 py-2 font-medium";
  const headerFor = (column: GuestColumn): ReactNode => {
    const plain: Record<Exclude<GuestColumn, "events" | "links">, string> = {
      tier: "Tier",
      side: "Side",
      email: "Email",
      address: "Address",
      age: "Age",
      dietary: "Dietary",
      coming: "Coming to",
      tags: "Tags",
      std: "Save the date",
    };
    if (column === "links") {
      return (
        <th key={column} scope="col" className={th}>
          <span className="sr-only">Links</span>
        </th>
      );
    }
    if (column === "events") {
      return events.map((event) => (
        <th key={event.id} scope="col" className="w-20 px-1 py-2 text-center font-medium" title={event.name}>
          <span className="block max-w-[7rem] truncate">{event.name}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[0.65rem] font-normal normal-case tracking-normal text-muted">
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
      ));
    }
    return (
      <th key={column} scope="col" className={th}>
        {plain[column]}
      </th>
    );
  };

  const householdCount = groups.length;

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

      <div className="card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2.5">
          <Segmented
            label="Columns"
            value={view}
            options={GUEST_VIEWS.map((entry) => ({ value: entry.id, label: entry.label }))}
            onChange={(next: GuestView) => setUrlParam("view", next === "rsvp" ? null : next)}
          />
          <Segmented
            label="Rows"
            value={grouped ? "households" : "people"}
            options={[
              { value: "households", label: "Households" },
              { value: "people", label: "One row per person" },
            ]}
            onChange={(next) => setUrlParam("rows", next === "people" ? "people" : null)}
          />
          <span className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span className="tabular-nums">
              {householdCount} {householdCount === 1 ? "household" : "households"} · {guests.length}{" "}
              {guests.length === 1 ? "guest" : "guests"}
            </span>
            {anyCollapsible ? (
              <button
                type="button"
                className="rounded px-1.5 py-1 font-medium text-ink hover:bg-line/50"
                onClick={() =>
                  setCollapsed(allCollapsed ? new Set() : new Set(multiGroups.map((group) => group.householdId)))
                }
              >
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            ) : null}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className={`${th} sticky left-0 z-[1] border-r border-line/60 bg-white`}>
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      ref={(box) => {
                        if (box) box.indeterminate = selected.size > 0 && !allSelected;
                      }}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(guests.map((g) => g.id)))
                      }
                    />
                    {grouped ? "Household / guest" : "Guest"}
                  </span>
                </th>
                {!grouped ? (
                  <th scope="col" className={th}>
                    Household
                  </th>
                ) : null}
                {columns.map((column) => headerFor(column))}
              </tr>
            </thead>
            <tbody>
              {grouped
                ? groups.map((group) =>
                    // One row only for a household of one, not for a bigger one
                    // a filter has narrowed to one person.
                    (householdSummaries[group.householdId]?.size ?? group.guests.length) === 1
                      ? personRow(group.guests[0]!, "solo")
                      : householdRows(group),
                  )
                : guests.map((guest) => personRow(guest, "flat"))}
            </tbody>
          </table>
        </div>

        {columns.includes("events") ? (
          <div className="border-t border-line px-3 py-2.5">
            <StatusLegend />
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted">
        Last name, email and dietary are editable here; everything else is on the guest page. Click
        an event cell to invite someone, mark their invitation as sent, or record an answer. Each
        household&rsquo;s Links menu copies its save-the-date link, invitation link or WhatsApp
        message.
      </p>
    </div>
  );
}

/** A small Mac-style segmented control, the same look as the section tabs. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-line bg-line/30 p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              active ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
