"use client";

import { useState, useTransition } from "react";
import { createShareLink, revokeShareLink } from "@/server/actions/seating-share";
import { PASSCODE_MAX, PASSCODE_MIN, SHARE_WARNING, shareLinkState } from "@/lib/seating/share";
import type { ShareLinkSummary } from "@/server/queries/seating";
import { useSeating } from "./seating-state";

/**
 * Share (spec 57 E.3): a view-only link to the event's live layout, with an
 * optional passcode and expiry. The address is shown once, here; a lost one is
 * switched off and replaced.
 */
export function ShareDialog({ links, timeZone }: { links: ShareLinkSummary[]; timeZone: string }) {
  const { eventId, refresh, setError, isDraft } = useSeating();
  const [label, setLabel] = useState("");
  const [passcode, setPasscode] = useState("");
  const [expires, setExpires] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const day = (iso: string) => new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium", timeZone }).format(new Date(iso));

  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none py-1">Share</summary>
      <div className="absolute right-0 z-30 mt-1 w-[24rem] space-y-3 rounded border border-line bg-white p-3 text-sm shadow-lg" role="dialog" aria-label="Share">
        <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-900">{SHARE_WARNING} They can open the exports, and change nothing.</p>
        {isDraft ? <p className="text-xs text-muted">A link shows the live layout, not this draft.</p> : null}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const r = await createShareLink(eventId, { label, passcode, expires });
              if (!r.ok) setError(r.error);
              else {
                setMade(r.data.url);
                setCopied(false);
                setLabel("");
                setPasscode("");
                setExpires("");
              }
              refresh();
            });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Who is it for? (optional)</span>
            <input className="field w-full" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="The caterer" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs text-muted">Passcode (optional)</span>
              <input className="field w-full" value={passcode} minLength={PASSCODE_MIN} maxLength={PASSCODE_MAX} onChange={(e) => setPasscode(e.target.value)} placeholder={`${PASSCODE_MIN}–${PASSCODE_MAX} characters`} autoComplete="off" />
            </label>
            <label>
              <span className="mb-1 block text-xs text-muted">Stops working after</span>
              <input className="field w-full" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            Make a link
          </button>
        </form>

        {made ? (
          <div className="space-y-1 rounded border border-line bg-paper p-2" role="status">
            <p className="text-xs text-muted">Copy it now: it won&rsquo;t be shown again.</p>
            <div className="flex gap-2">
              <input className="field flex-1 py-1 text-xs" readOnly value={made} onFocus={(e) => e.currentTarget.select()} aria-label="The link" />
              <button
                type="button"
                className="btn py-1"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(made);
                    setCopied(true);
                  } catch {
                    setError("Couldn't copy. Select the link and copy it.");
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}

        {links.length > 0 ? (
          <ul className="divide-y divide-line rounded border border-line">
            {links.map((l) => {
              const state = shareLinkState(l);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.label ?? "A link"}{l.hasPasscode ? " · passcode" : ""}</span>
                    <span className="block text-xs text-muted">
                      Made {day(l.created_at)}
                      {l.expires_at ? ` · ${state === "expired" ? "expired" : "until"} ${day(l.expires_at)}` : ""}
                      {state === "revoked" ? " · off" : ""}
                    </span>
                  </span>
                  {state === "live" ? (
                    <button
                      type="button"
                      className="btn py-0.5 text-red-700"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await revokeShareLink(eventId, l.id);
                          if (!r.ok) setError(r.error);
                          refresh();
                        })
                      }
                    >
                      Turn off
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
