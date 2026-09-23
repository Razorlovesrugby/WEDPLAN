"use client";

import { useState } from "react";
import { absoluteUrl } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import type { HouseholdAddress } from "@/lib/site/household-slug";

/**
 * The household's save-the-date link and when they last opened it (0031).
 *
 * Copy rather than send: the save-the-date is just a URL, and the planner
 * pastes it into whichever chat that household actually reads.
 */
export function SaveTheDateCell({
  weddingSlug,
  address,
  lastViewedAt,
  viewCount,
}: {
  weddingSlug: string;
  address: HouseholdAddress | null;
  lastViewedAt: string | null;
  viewCount: number;
}) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  async function copy() {
    if (!address) return;
    // The site's public address, not the browser's: a deployment-specific
    // *.vercel.app address sits behind Vercel's login, and guests can't open it.
    const url = absoluteUrl(saveTheDatePath(weddingSlug, address));
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <td className="whitespace-nowrap px-3 py-1.5">
      <span
        className={lastViewedAt ? "" : "text-muted"}
        title={viewCount > 0 ? `Opened ${viewCount} ${viewCount === 1 ? "time" : "times"}` : undefined}
      >
        {lastViewedAt ? formatRelative(lastViewedAt) : "Not opened"}
      </span>
      {address ? (
        <button type="button" className="ml-2 text-xs text-muted hover:underline" onClick={copy}>
          {copied === "ok" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy link"}
        </button>
      ) : null}
    </td>
  );
}
