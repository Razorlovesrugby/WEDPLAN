"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendBroadcast, sendSaveTheDates, type SendSummary } from "@/server/actions/stationery";

/**
 * Save-the-dates and broadcasts (spec 14 §12.1, §12.3).
 *
 * Both are *bulk sends to real people*, so both are behind a confirm step that
 * names the number, and both report back what actually happened rather than
 * "done". The counts matter: "sent to 78 households, 11 have no email address"
 * is the difference between a job finished and a job you think is finished.
 */

export type BroadcastTag = { id: string; name: string };

function Summary({ summary }: { summary: SendSummary }) {
  return (
    <div className="rounded border border-line bg-white px-3 py-2 text-sm" role="status">
      <p>
        Sent to {summary.households} household{summary.households === 1 ? "" : "s"} ({summary.sent}{" "}
        email{summary.sent === 1 ? "" : "s"}).
      </p>
      {summary.skippedNoEmail > 0 ? (
        <p className="mt-1 text-muted">
          {summary.skippedNoEmail} household{summary.skippedNoEmail === 1 ? " has" : "s have"} no
          email address — copy the link to them instead.
        </p>
      ) : null}
      {summary.alreadySent > 0 ? (
        <p className="mt-1 text-muted">
          {summary.alreadySent} skipped, already had this one.
        </p>
      ) : null}
      {summary.failed > 0 ? (
        <p className="mt-1 text-tierB">{summary.failed} failed to send.</p>
      ) : null}
      {summary.remaining > 0 ? (
        <p className="mt-1 text-muted">
          {summary.remaining} more to go — still sending…
        </p>
      ) : null}
    </div>
  );
}

export function StationeryPanel({
  tags,
  weddingDateSet,
}: {
  tags: BroadcastTag[];
  weddingDateSet: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<"save" | "broadcast" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SendSummary | null>(null);

  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [segment, setSegment] = useState<"all" | "replied" | "no_reply" | "tag">("all");
  const [tagId, setTagId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  /**
   * Sends in batches until nothing is left.
   *
   * The action deliberately caps how many households one invocation reaches
   * (SEND_BATCH), so a four-hundred-household list does not time out half way
   * through and leave nobody knowing who got the email. Continuing is safe
   * because `dedupe_key` turns an overlap into a skip rather than a second
   * message; the totals accumulate so the count shown is the whole send, not
   * the last slice of it.
   */
  const run = (fn: () => Promise<Awaited<ReturnType<typeof sendSaveTheDates>>>) =>
    startTransition(async () => {
      setError(null);
      setSummary(null);

      const total: SendSummary = {
        sent: 0,
        households: 0,
        skippedNoEmail: 0,
        alreadySent: 0,
        failed: 0,
        remaining: 0,
      };

      // Bounded: even if the action somehow stopped making progress, this
      // ends rather than looping against the email provider forever.
      for (let pass = 0; pass < 100; pass += 1) {
        const result = await fn();
        if (!result.ok) {
          setError(result.error);
          // Whatever went out before the failure still went out.
          if (total.sent > 0) setSummary(total);
          return;
        }

        total.sent += result.data.sent;
        total.households += result.data.households;
        total.skippedNoEmail += result.data.skippedNoEmail;
        // alreadySent is a running total from the log, not a per-batch delta,
        // so it is taken rather than accumulated — adding it up would count
        // the first batch again on every pass.
        total.alreadySent = result.data.alreadySent;
        total.failed += result.data.failed;
        total.remaining = result.data.remaining;

        setSummary({ ...total });
        if (result.data.remaining === 0) break;
      }

      setConfirming(false);
      router.refresh();
    });

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-medium">Send something to everyone</h2>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(open === "save" ? null : "save");
            setConfirming(false);
            setSummary(null);
            setError(null);
          }}
        >
          Save the date
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(open === "broadcast" ? null : "broadcast");
            setConfirming(false);
            setSummary(null);
            setError(null);
          }}
        >
          Send an update
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-tierB">{error}</p> : null}
      {summary ? <div className="mt-3">{<Summary summary={summary} />}</div> : null}

      {open === "save" ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm text-muted">
            Goes to every household with an invitation link. It asks for nothing — no RSVP, no
            deadline — and links to their card so they can put the date in the diary. The invitation
            itself comes later, on the same link.
          </p>
          {!weddingDateSet ? (
            <p className="mt-2 text-sm text-tierB">
              Set the wedding date in Settings first — it&rsquo;s the whole message.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending}
                  onClick={() => run(() => sendSaveTheDates({}))}
                >
                  {pending ? "Sending…" : "Yes, send them"}
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={pending || !weddingDateSet}
                onClick={() => setConfirming(true)}
              >
                Send save-the-dates
              </button>
            )}
          </div>
        </div>
      ) : null}

      {open === "broadcast" ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">
            One message to a group. Nobody gets it twice, even if you press send again.
          </p>

          <div>
            <label htmlFor="broadcast-segment" className="block text-sm font-medium">
              Who
            </label>
            <select
              id="broadcast-segment"
              className="field mt-1"
              value={segment}
              onChange={(event) => setSegment(event.target.value as typeof segment)}
            >
              <option value="all">Everyone with an invitation</option>
              <option value="no_reply">Everyone who hasn&rsquo;t replied</option>
              <option value="replied">Everyone who has replied</option>
              <option value="tag" disabled={tags.length === 0}>
                A tagged group
              </option>
            </select>
          </div>

          {segment === "tag" ? (
            <div>
              <label htmlFor="broadcast-tag" className="block text-sm font-medium">
                Tag
              </label>
              <select
                id="broadcast-tag"
                className="field mt-1"
                value={tagId}
                onChange={(event) => setTagId(event.target.value)}
              >
                <option value="">Choose a tag…</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label htmlFor="broadcast-subject" className="block text-sm font-medium">
              Subject
            </label>
            <input
              id="broadcast-subject"
              className="field mt-1"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="The coach now leaves at two"
            />
          </div>

          <div>
            <label htmlFor="broadcast-body" className="block text-sm font-medium">
              Message
            </label>
            <textarea
              id="broadcast-body"
              className="field mt-1"
              rows={6}
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Each household gets it addressed to them, with a link to their own details.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      sendBroadcast({
                        subject,
                        body: bodyText,
                        segment,
                        tag_id: segment === "tag" ? tagId : undefined,
                        // Stamped into the dedupe key, so a corrected re-send
                        // is possible while an accidental double-click is not.
                        send_key: `${Date.now()}`,
                      }),
                    )
                  }
                >
                  {pending ? "Sending…" : "Yes, send it"}
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={
                  pending ||
                  subject.trim() === "" ||
                  bodyText.trim() === "" ||
                  (segment === "tag" && tagId === "")
                }
                onClick={() => setConfirming(true)}
              >
                Send this update
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
