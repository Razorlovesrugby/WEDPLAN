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
import { whatsappMessage } from "@/lib/email/templates-client";
import { formatRelative } from "@/lib/format";
import type { InvitationListItem } from "@/server/queries/invitations";
import type { EventRow } from "@/lib/types/database";

export function InvitationsTable({
  rows,
  events,
  weddingName,
  dateLabel,
}: {
  rows: InvitationListItem[];
  events: EventRow[];
  weddingName: string;
  dateLabel: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosenEvents, setChosenEvents] = useState<Set<string>>(new Set(events.map((e) => e.id)));
  const [links, setLinks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
            onClick={() =>
              startTransition(async () => {
                const result = await createInvitations([...selected], [...chosenEvents]);
                setMessage(
                  result.ok
                    ? `Created ${result.data.created} ${result.data.created === 1 ? "invitation" : "invitations"}`
                    : result.error,
                );
                if (result.ok) setSelected(new Set());
              })
            }
          >
            Create for {selected.size} selected
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSelected(new Set(uninvited.map((r) => r.household.id)))}
          >
            Select all {uninvited.length} without one
          </button>
        </div>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[54rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2" />
              <th scope="col" className="px-3 py-2">Household</th>
              <th scope="col" className="px-3 py-2">Seats</th>
              <th scope="col" className="px-3 py-2">Sent</th>
              <th scope="col" className="px-3 py-2">Opened</th>
              <th scope="col" className="px-3 py-2">Answers</th>
              <th scope="col" className="px-3 py-2">Actions</th>
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
                  <td className="px-3 py-2 text-muted">
                    {row.summary?.sent_at ? formatRelative(row.summary.sent_at) : "—"}
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
                              const result = await sendInvitation(row.invitationId!);
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
                              await copy(result.data.url, "Link copied");
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
                                "WhatsApp message copied — paste it straight in",
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
