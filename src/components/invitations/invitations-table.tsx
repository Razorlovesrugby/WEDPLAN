"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createInvitations,
  reissueInvitation,
  revealInvitationLink,
  sendInvitation,
  setRemindersMuted,
} from "@/server/actions/invitations";
import { setInvitationSent, setSaveTheDateSent } from "@/server/actions/invites";
import { whatsappMessage } from "@/lib/email/templates-client";
import { formatDate, formatRelative } from "@/lib/format";
import { isAllUnable, sendAnywayMessage, unableChip } from "@/lib/unable-to-attend";
import type { InvitationListItem } from "@/server/queries/invitations";
import { SaveTheDateActions, type SaveTheDateWords } from "./save-the-date-actions";
import type { EventRow } from "@/lib/types/database";

export function InvitationsTable({
  rows,
  events,
  weddingName,
  dateLabel,
  timezone,
  saveTheDate,
}: {
  rows: InvitationListItem[];
  events: EventRow[];
  weddingName: string;
  dateLabel: string;
  /** The wedding's own, for the date beside a tick box. */
  timezone: string;
  saveTheDate: SaveTheDateWords;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenEvents, setChosenEvents] = useState<Set<string>>(new Set(events.map((e) => e.id)));
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saveTheDateLinks, setSaveTheDateLinks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A tick shows at once and is dropped when the server's answer lands, so the
  // row's own data is the truth again (and a failed write snaps back).
  const [ticks, setTicks] = useState<{
    std: Record<string, boolean>;
    invite: Record<string, boolean>;
  }>({ std: {}, invite: {} });

  function tick(
    kind: "std" | "invite",
    householdId: string,
    checked: boolean,
    write: (householdId: string, sent: boolean) => Promise<{ ok: boolean; error?: string }>,
  ) {
    setTicks((prev) => ({ ...prev, [kind]: { ...prev[kind], [householdId]: checked } }));
    startTransition(async () => {
      const result = await write(householdId, checked);
      if (!result.ok) setMessage(result.error ?? "Couldn't save that tick");
      setTicks((prev) => {
        const next = { ...prev[kind] };
        delete next[householdId];
        return { ...prev, [kind]: next };
      });
    });
  }

  function toggle(set: Set<string>, id: string, update: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  }

  async function copy(text: string, note: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(note);
    } catch {
      setMessage("Couldn't reach the clipboard — select the link and copy it manually.");
    }
  }

  const uninvited = rows.filter((row) => !row.invitationId);
  // A household whose every guest has said they can't come is left out of
  // "select all" (spec 29 §4.5). It is still in the table and can still be
  // ticked by hand — the guard is on the sweep, not on the planner.
  const sweepable = uninvited.filter(
    (row) => !isAllUnable(row.summary?.guest_total ?? null, row.unableGuests.length),
  );
  const leftOut = uninvited.length - sweepable.length;

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Create invitations</h2>
        <p className="text-xs text-muted">
          Pick which events these households are invited to. Evening-only invitations are normal —
          the household only ever sees the events you tick here.
        </p>
        <div className="flex flex-wrap gap-3">
          {events.map((event) => (
            <label key={event.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={chosenEvents.has(event.id)}
                onChange={() => toggle(chosenEvents, event.id, setChosenEvents)}
              />
              {event.name}
            </label>
          ))}
          {events.length === 0 ? (
            <span className="text-sm text-red-700">
              Create an event first — an invitation to nothing is not much use.
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || selected.size === 0 || chosenEvents.size === 0}
            onClick={() => {
              // Anyone in the selection who has said they can't come: name
              // them and ask, rather than quietly creating their invitation.
              const flagged = rows
                .filter((row) => selected.has(row.household.id))
                .flatMap((row) => row.unableGuests.map((guest) => guest.name));
              if (
                flagged.length > 0 &&
                !confirm(sendAnywayMessage(flagged, "create their invitations"))
              ) {
                return;
              }
              startTransition(async () => {
                const result = await createInvitations([...selected], [...chosenEvents]);
                setMessage(
                  result.ok
                    ? `Created ${result.data.created} ${result.data.created === 1 ? "invitation" : "invitations"}`
                    : result.error,
                );
                if (result.ok) setSelected(new Set());
              });
            }}
          >
            Create for {selected.size} selected
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(new Set(sweepable.map((r) => r.household.id)))}
          >
            Select all {sweepable.length} without one
          </button>
          {leftOut > 0 ? (
            <span className="text-xs text-muted">
              {leftOut} left out — everyone in {leftOut === 1 ? "that household" : "those households"}{" "}
              can&rsquo;t come.
            </span>
          ) : null}
        </div>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[68rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2" />
              <th scope="col" className="px-3 py-2">Household</th>
              <th scope="col" className="px-3 py-2">Seats</th>
              {/* Two links per household, in two columns that never share a
                  button: the save-the-date first, because it goes out first. */}
              <th scope="col" className="border-l border-line bg-paper px-3 py-2">
                Save the date
              </th>
              <th scope="col" className="border-l border-line px-3 py-2">Invite sent</th>
              <th scope="col" className="px-3 py-2">Invite opened</th>
              <th scope="col" className="px-3 py-2">Answers</th>
              <th scope="col" className="px-3 py-2">Invitation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.household.id;
              return (
                <tr key={id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">
                    {row.invitationId ? null : (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.household.display_name}`}
                        checked={selected.has(id)}
                        onChange={() => toggle(selected, id, setSelected)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/households/${id}`} className="hover:underline">
                      {row.household.display_name}
                    </Link>
                    {row.remindersMuted ? (
                      <span className="ml-2 text-xs text-muted">(reminders muted)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted">{row.household.seat_count}</td>
                  <td className="border-l border-line bg-paper px-3 py-2 align-top">
                    <Tick
                      label="Save the Date Sent"
                      checked={ticks.std[id] ?? Boolean(row.summary?.std_sent_at)}
                      at={row.summary?.std_sent_at ?? new Date().toISOString()}
                      timezone={timezone}
                      onChange={(checked) => tick("std", id, checked, setSaveTheDateSent)}
                    />
                    <UnableChip row={row} />
                    <SaveTheDateActions
                      householdName={row.household.display_name}
                      address={{ slug: row.household.slug, suffix: row.household.slug_suffix }}
                      words={saveTheDate}
                      lastViewedAt={row.summary?.std_last_viewed_at ?? null}
                      viewCount={row.summary?.std_view_count ?? 0}
                      link={saveTheDateLinks[id] ?? null}
                      onCopy={(text, note, link) => {
                        setSaveTheDateLinks((prev) => ({ ...prev, [id]: link }));
                        void copy(text, note);
                      }}
                    />
                  </td>
                  <td className="border-l border-line px-3 py-2 align-top">
                    {row.invitationId ? (
                      <Tick
                        label="Invite Sent"
                        checked={ticks.invite[id] ?? Boolean(row.summary?.sent_at)}
                        at={row.summary?.sent_at ?? new Date().toISOString()}
                        timezone={timezone}
                        onChange={(checked) => tick("invite", id, checked, setInvitationSent)}
                      />
                    ) : (
                      <span className="text-xs text-muted">No invitation yet</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {/* Every open, not just the first (spec 22 §9): "opened
                        four times and still hasn't replied" is a different
                        chasing decision from "never looked". */}
                    {row.summary?.last_viewed_at ? (
                      <>
                        {formatRelative(row.summary.last_viewed_at)}
                        {(row.summary.view_count ?? 0) > 1 ? (
                          <span className="ml-1 text-xs">×{row.summary.view_count}</span>
                        ) : null}
                      </>
                    ) : row.summary?.opened_at ? (
                      formatRelative(row.summary.opened_at)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.summary ? (
                      <span
                        className={
                          row.summary.response_state === "complete"
                            ? "text-tierA"
                            : row.summary.response_state === "partial"
                              ? "text-tierB"
                              : "text-muted"
                        }
                      >
                        {row.summary.rsvp_answered}/{row.summary.rsvp_total}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.invitationId ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              // Anyone here who has said they can't come: ask first. The
                              // server refuses an all-declined household without this.
                              const flagged = row.unableGuests.map((guest) => guest.name);
                              if (flagged.length > 0 && !confirm(sendAnywayMessage(flagged))) return;
                              const result = await sendInvitation(row.invitationId!, {
                                sendAnyway: flagged.length > 0,
                              });
                              setMessage(
                                result.ok
                                  ? result.data.sentTo.length > 0
                                    ? `Sent to ${result.data.sentTo.join(", ")}`
                                    : "Already sent to everyone in this household"
                                  : result.error,
                              );
                            })
                          }
                        >
                          {row.summary?.sent_at ? "Resend" : "Send"}
                        </button>

                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await revealInvitationLink(row.invitationId!);
                              if (!result.ok) {
                                setMessage(result.error);
                                return;
                              }
                              setLinks((prev) => ({ ...prev, [id]: result.data.url }));
                              await copy(result.data.url, "Invitation link copied");
                            })
                          }
                        >
                          Copy link
                        </button>

                        {/* A plain link, not a fetch: the browser renders the
                            PNG in a tab, which is what "save this one for the
                            stationer" actually needs. */}
                        <a
                          href={`/api/qr/${row.invitationId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn px-2 py-1 text-xs"
                        >
                          QR
                        </a>

                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await revealInvitationLink(row.invitationId!);
                              if (!result.ok) {
                                setMessage(result.error);
                                return;
                              }
                              await copy(
                                whatsappMessage({
                                  weddingName,
                                  householdName: row.household.display_name,
                                  dateLabel,
                                  url: result.data.url,
                                }),
                                "Invitation message copied — paste it into WhatsApp",
                              );
                            })
                          }
                        >
                          WhatsApp
                        </button>

                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await setRemindersMuted(id, !row.remindersMuted);
                            })
                          }
                        >
                          {row.remindersMuted ? "Unmute" : "Mute"}
                        </button>

                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs text-red-700"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !confirm(
                                "Reissue this invitation? The old link stops working immediately — only do this if it went astray.",
                              )
                            )
                              return;
                            startTransition(async () => {
                              const result = await reissueInvitation(row.invitationId!);
                              setMessage(result.ok ? "New link issued" : result.error);
                            });
                          }}
                        >
                          Reissue
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">No invitation yet</span>
                    )}
                    {links[id] ? (
                      <p className="mt-1 break-all text-xs text-muted">{links[id]}</p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A checkbox that records something the planner did by hand — "I sent it".
 * The date beside it is when it was ticked, in the wedding's timezone.
 */
function Tick({
  label,
  checked,
  at,
  timezone,
  onChange,
}: {
  label: string;
  checked: boolean;
  at: string;
  timezone: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
      {checked ? (
        <span className="text-muted" title={formatRelative(at)}>
          · {formatDate(at, timezone, { day: "numeric", month: "short" })}
        </span>
      ) : null}
    </label>
  );
}

/**
 * "Can't attend: Ana and Ben", or "All can't attend". Rendered under the save
 * the date tick because that is where it was said. Nothing at all when nobody
 * has — an empty badge on every row would train the eye to ignore it.
 */
function UnableChip({ row }: { row: InvitationListItem }) {
  const chip = unableChip(
    row.summary?.guest_total ?? null,
    row.unableGuests.map((guest) => guest.name),
  );
  if (!chip) return null;
  const detail = row.unableGuests
    .map((guest) => `${guest.name} (${guest.via === "planner" ? "you recorded it" : "told us themselves"})`)
    .join(", ");
  return (
    <p
      title={detail}
      className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs ${
        chip.all ? "border-tierB/50 bg-tierB/15" : "border-line bg-line/40"
      }`}
    >
      {chip.label}
    </p>
  );
}
