"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markClaimsViewed, releaseClaimAsCouple, setClaimStatus } from "@/server/actions/registry";
import { CLAIM_STATUSES, STATUS_LABELS, needsThanks, type ClaimStatus } from "@/lib/registry/status";
import type { PlannerClaim } from "@/server/queries/registry";

export type ClaimRowData = PlannerClaim & { when: string; isNew: boolean };

type Filter = "all" | "thanks" | "waiting" | "released";

/**
 * Who said they would buy what, and what they wrote (spec 36 §7). The only
 * screen anywhere that shows a buyer's name or message besides the buyer's own
 * private page.
 */
export function ClaimsTable({ claims }: { claims: ClaimRowData[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Opening this tab is what clears "N new claims". Done on the planner's own
  // visit, in the browser — nothing a link scanner fetching a URL could trigger.
  useEffect(() => {
    void markClaimsViewed();
  }, []);

  const shown = useMemo(() => {
    switch (filter) {
      case "thanks":
        return claims.filter(needsThanks);
      case "waiting":
        return claims.filter((c) => c.released_at === null && (c.status === "claimed" || c.status === "bought"));
      case "released":
        return claims.filter((c) => c.released_at !== null);
      default:
        return claims;
    }
  }, [claims, filter]);

  function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await run();
      setError(result.ok ? null : (result.error ?? "That didn't save"));
      router.refresh();
    });
  }

  const counts = {
    thanks: claims.filter(needsThanks).length,
    waiting: claims.filter((c) => c.released_at === null && (c.status === "claimed" || c.status === "bought")).length,
  };

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: `All (${claims.length})` },
    { id: "waiting", label: `Waiting to arrive (${counts.waiting})` },
    { id: "thanks", label: `Need a thank-you (${counts.thanks})` },
    { id: "released", label: "Released" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter claims">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded px-3 py-1.5 text-sm ${filter === f.id ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <a className="btn" href="/api/export/registry">Download thank-you list (CSV)</a>
      </div>

      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

      {claims.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody has said they&rsquo;ll buy anything yet. When they do, their name and message appear here &mdash; and nobody else can see them.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing in this view.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((claim) => (
            <li key={claim.id} className={`card space-y-2 p-3 ${claim.released_at ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{claim.name}</span>{" "}
                  <span className="text-muted">
                    is getting {claim.quantity > 1 ? `${claim.quantity} × ` : ""}
                    <span className={claim.item_deleted ? "italic" : ""}>{claim.item_title}</span>
                  </span>
                  {claim.isNew ? <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">New</span> : null}
                  {claim.released_at ? <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-xs">Released</span> : null}
                </p>
                <span className="text-xs text-muted">{claim.when}</span>
              </div>

              {claim.message ? (
                <blockquote className="whitespace-pre-line border-l-2 border-line pl-3 text-sm italic">{claim.message}</blockquote>
              ) : null}

              {claim.released_at === null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Stage for ${claim.name}`}>
                    {CLAIM_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={pending}
                        aria-pressed={claim.status === status}
                        onClick={() => claim.status !== status && act(() => setClaimStatus(claim.id, status as ClaimStatus))}
                        className={`rounded-full border px-3 py-1 text-sm ${
                          claim.status === status ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"
                        }`}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn ml-auto"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Put “${claim.item_title}” back on the registry? ${claim.name} isn't told.`)) {
                        act(() => releaseClaimAsCouple(claim.id));
                      }
                    }}
                  >
                    Release
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
