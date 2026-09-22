"use client";

import { saveTheDateWhatsappMessage } from "@/lib/email/templates-client";
import { formatRelative } from "@/lib/format";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import type { HouseholdAddress } from "@/lib/site/household-slug";

export type SaveTheDateWords = {
  weddingSlug: string;
  dateLabel: string | null;
  location: string | null;
};

/**
 * One household's save-the-date, on `/invitations` — its own column, apart
 * from the invitation's buttons, because they are two different links and
 * sending the wrong one is the mistake this layout exists to prevent.
 *
 * No email here: the planner sends it themselves, so this is the link, a
 * WhatsApp message to paste, and whether they've opened it. It needs no
 * invitation — a save-the-date goes out months before one exists.
 */
export function SaveTheDateActions({
  householdName,
  address,
  words,
  lastViewedAt,
  viewCount,
  link,
  onCopy,
}: {
  householdName: string;
  address: HouseholdAddress;
  words: SaveTheDateWords;
  lastViewedAt: string | null;
  viewCount: number;
  /** The link last copied for this row, shown under it. */
  link: string | null;
  onCopy: (text: string, note: string, link: string) => void;
}) {
  const path = saveTheDatePath(words.weddingSlug, address);
  // The browser's origin, like every other copy button here: the link that
  // works from wherever the planner is.
  const url = () => `${window.location.origin}${path}`;

  return (
    <>
      <p className="mb-1.5 text-xs text-muted">
        {lastViewedAt ? (
          <>
            Opened {formatRelative(lastViewedAt)}
            {viewCount > 1 ? ` ×${viewCount}` : ""}
          </>
        ) : (
          "Not opened yet"
        )}
      </p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn px-2 py-1 text-xs"
          onClick={() => onCopy(url(), `Save-the-date link copied for ${householdName}`, url())}
        >
          Copy link
        </button>
        <button
          type="button"
          className="btn px-2 py-1 text-xs"
          onClick={() =>
            onCopy(
              saveTheDateWhatsappMessage({
                householdName,
                dateLabel: words.dateLabel,
                location: words.location,
                url: url(),
              }),
              `Save-the-date message copied for ${householdName} — paste it into WhatsApp`,
              url(),
            )
          }
        >
          WhatsApp
        </button>
        {/* ?preview=1 so looking at it yourself isn't counted as them opening it. */}
        <a
          href={`${path}?preview=1`}
          target="_blank"
          rel="noreferrer"
          className="btn px-2 py-1 text-xs"
        >
          View
        </a>
      </div>
      {link ? <p className="mt-1 break-all text-xs text-muted">{link}</p> : null}
    </>
  );
}
