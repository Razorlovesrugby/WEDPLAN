"use client";

import { useEffect, useRef, useState } from "react";
import { PreviewFrame, type PreviewDevice } from "@/components/preview-frame";
import type { PreviewHousehold } from "@/lib/site/preview-households";

/**
 * The shared live preview on a Design tab (spec 42 §5.3): the invitation page
 * as a chosen household will get it, on a phone or a laptop. `/site/preview`
 * renders the draft behind the planner's sign-in, so nothing here is a guest
 * link and nothing is counted as a visit.
 *
 * It reloads after a save: a save ends in `router.refresh()`, the server
 * renders the page again with a new `renderedAt`, and that is the signal.
 */
export function DesignPreview({
  households,
  anchor,
  renderedAt,
}: {
  households: PreviewHousehold[];
  anchor?: string;
  renderedAt: number;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<PreviewDevice>("phone");
  const [viewAs, setViewAs] = useState(households[0]?.id ?? "");
  const src = `/site/preview${viewAs ? `?as=${viewAs}` : ""}${anchor ? `#${anchor}` : ""}`;

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      iframe.current?.contentWindow?.location.reload();
    } catch {
      // Same-origin in practice; if not, the next navigation shows the change.
    }
  }, [renderedAt]);

  return (
    <section aria-label="Preview" className="card space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <div className="inline-flex rounded-lg border border-line bg-line/30 p-0.5 text-xs" role="group" aria-label="Preview size">
          {(["phone", "desktop"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={device === option}
              onClick={() => setDevice(option)}
              className={`rounded-md px-2.5 py-1 ${device === option ? "bg-white font-medium shadow-sm" : "text-muted"}`}
            >
              {option === "phone" ? "Phone" : "Laptop"}
            </button>
          ))}
        </div>
        {households.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            View as
            <select
              id="design-preview-as"
              className="field w-auto py-1 text-xs"
              value={viewAs}
              onChange={(event) => setViewAs(event.target.value)}
            >
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <PreviewFrame device={device} iframeRef={iframe} src={src} />
    </section>
  );
}
