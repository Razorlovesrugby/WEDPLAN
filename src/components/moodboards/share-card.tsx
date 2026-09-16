"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShare, revokeShare, setChannelShare } from "@/server/actions/moodboards";
import { shareIsLive } from "@/lib/moodboards";
import type { MoodboardShareRow } from "@/lib/types/database";

/**
 * Sharing a board.
 *
 * Link shares are many-per-board on purpose: one per recipient means revoking
 * the photographer's does not disturb the one you sent your mum, and the view
 * count tells you who actually opened theirs.
 */
export function ShareCard({
  moodboardId,
  shares,
}: {
  moodboardId: string;
  shares: MoodboardShareRow[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ label: string; url: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const links = shares.filter((share) => share.channel === "link");
  const site = shares.find((share) => share.channel === "public_site");
  const rsvp = shares.find((share) => share.channel === "rsvp");

  return (
    <section className="card space-y-4 p-4">
      <h2 className="font-serif text-xl">Sharing</h2>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {/* A fresh token is shown exactly once — what is stored is a hash. */}
      {fresh ? (
        <div className="rounded border border-accent bg-accent/5 p-3 text-sm">
          <p className="font-medium">Link for {fresh.label || "this share"}</p>
          <p className="mt-1 break-all font-mono text-xs">{fresh.url}</p>
          <button
            type="button"
            className="btn mt-2"
            onClick={() => void navigator.clipboard.writeText(fresh.url)}
          >
            Copy
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Links</h3>
        {links.length === 0 ? (
          <p className="text-sm text-muted">No share links yet.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((share) => {
              const live = shareIsLive(share);
              return (
                <li key={share.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-sm">
                  <span className="font-medium">{share.label ?? "Unlabelled"}</span>
                  {share.show_notes ? (
                    <span className="rounded bg-line/60 px-1.5 py-0.5 text-xs">notes shown</span>
                  ) : null}
                  <span className="text-muted">
                    {share.view_count} view{share.view_count === 1 ? "" : "s"}
                    {share.last_viewed_at
                      ? ` · last ${new Date(share.last_viewed_at).toLocaleDateString()}`
                      : " · never opened"}
                  </span>
                  {live ? (
                    <button
                      type="button"
                      className="btn ml-auto text-red-700"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await revokeShare(share.id);
                          if (!result.ok) setError(result.error);
                          else router.refresh();
                        })
                      }
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="ml-auto text-xs text-muted">revoked</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 pt-2">
          <label className="text-sm">
            <span className="text-muted">Who is this for?</span>
            <input
              className="field mt-1"
              placeholder="Anna — photographer"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(event) => setShowNotes(event.target.checked)}
            />
            Show my private notes
          </label>
          <button
            type="button"
            className="btn-primary mb-1"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createShare(moodboardId, { label, showNotes });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setFresh({ label, url: result.data.url });
                setLabel("");
                setShowNotes(false);
                router.refresh();
              })
            }
          >
            Create link
          </button>
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <h3 className="text-sm font-medium">Publish</h3>
        <p className="text-sm text-muted">
          These need no link. Private notes are never shown on either, because there&rsquo;s nobody
          specific on the other end.
        </p>
        <Toggle
          label="On the public wedding site"
          on={site ? shareIsLive(site) : false}
          disabled={pending}
          onChange={(on) =>
            startTransition(async () => {
              const result = await setChannelShare(moodboardId, "public_site", on);
              if (!result.ok) setError(result.error);
              else router.refresh();
            })
          }
        />
        <Toggle
          label="On the RSVP page, where guests already are"
          on={rsvp ? shareIsLive(rsvp) : false}
          disabled={pending}
          onChange={(on) =>
            startTransition(async () => {
              const result = await setChannelShare(moodboardId, "rsvp", on);
              if (!result.ok) setError(result.error);
              else router.refresh();
            })
          }
        />
      </div>
    </section>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
