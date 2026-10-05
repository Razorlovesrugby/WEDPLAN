"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PREVIEW_CHANNEL, isToPreview } from "@/lib/site/preview-messages";

/**
 * The preview frame's half of the builder channel (spec 24 §4, spec 27 E2).
 *
 * Mounted once on `/site/preview`. It listens for two instructions from the
 * builder that embeds it:
 *
 *   refresh   re-render against the current draft. `router.refresh()` reconciles
 *             the server output in place, which is the whole point: the frame is
 *             never unmounted, so the scroll position, an open FAQ and the
 *             reader's place all survive an edit. The old approach was a React
 *             `key` that destroyed the iframe on every save.
 *   scroll-to bring a block into view — the builder says this when the planner
 *             selects one, so the preview and the list agree about where they are.
 *
 * And it reports one thing back: a click on a block, which is what lets the
 * planner click the page to edit it. A click on a link or a button is left
 * alone — the preview must not become a trap for the things it is showing.
 *
 * **Same-origin, both ways.** Messages are accepted only from the parent window
 * and only from this origin, and nothing in either direction carries content —
 * an id or a verb.
 *
 * Does nothing when the page is opened on its own ("Open in a tab"): with no
 * parent there is nobody to talk to.
 */
/**
 * A block that has just been added is not in the frame until the refresh the
 * builder asked for has landed, and the two messages arrive close together. So
 * look for it a few times rather than once.
 */
function scrollToBlock(blockId: string, attempt = 0) {
  const target = document.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!target) {
    if (attempt < 12) setTimeout(() => scrollToBlock(blockId, attempt + 1), 150);
    return;
  }
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

export function PreviewBridge() {
  const router = useRouter();

  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (!isToPreview(event.data)) return;

      if (event.data.type === "refresh") {
        router.refresh();
        return;
      }

      scrollToBlock(event.data.blockId);
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      // Links, buttons and form controls keep doing what they do.
      if (event.target.closest("a, button, input, select, textarea, summary, label")) return;
      const block = event.target.closest("[data-block-id]");
      const blockId = block?.getAttribute("data-block-id");
      if (!blockId) return;
      window.parent.postMessage(
        { channel: PREVIEW_CHANNEL, type: "select", blockId },
        window.location.origin,
      );
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick);
    };
  }, [router]);

  return null;
}
