"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BLOCKS, isBlockType } from "@/lib/site/blocks";
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
 * And it reports two things back: a click on a block, which is what lets the
 * planner click the page to edit it, and — when asked — where every block is,
 * which is what turns a drop onto the preview into "after which block". A click on a link or a button is left
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
 * Outlines for the block under the pointer and the one being edited.
 *
 * Injected here, not shipped in `globals.css`: they exist only inside the
 * builder's frame, and a guest's page must never carry editing chrome. The
 * wrapper is made `position: relative` so the label can sit in its corner; that
 * moves nothing, because it has no offset.
 */
const EDIT_STYLE = `
[data-block-id] { position: relative; }
[data-block-id][data-edit-hover] { outline: 2px solid rgba(122, 92, 60, 0.5); outline-offset: -2px; cursor: pointer; }
[data-block-id][data-edit-selected] { outline: 2px solid #7a5c3c; outline-offset: -2px; }
[data-block-id][data-edit-hover]::after,
[data-block-id][data-edit-selected]::after {
  content: attr(data-edit-label);
  position: absolute; top: 6px; left: 6px; z-index: 60;
  background: #2b2724; color: #fff; padding: 4px 7px; border-radius: 2px;
  font: 600 10px/1 system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
  pointer-events: none;
}
`;

function labelFor(element: Element): string {
  const type = element.getAttribute("data-block-type") ?? "";
  return isBlockType(type) ? BLOCKS[type].label : type;
}

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
  // **Not `scrollIntoView`** (spec 28 §4.2). Called from inside an iframe, it
  // asks every scrollable ancestor — in the *embedding* page too — to make up
  // whatever this document could not scroll itself, which it cannot when the
  // block is near the foot of the page. The builder's clipping box is
  // `overflow: hidden`, which is still programmatically scrollable, so it was
  // dragged upward by the shortfall and the preview collapsed to a strip with
  // the rest blank; the editor's own page scrolled too. `window.scrollTo`
  // moves this window and nothing else.
  window.scrollTo({
    top: target.getBoundingClientRect().top + window.scrollY,
    behavior: calm ? "auto" : "smooth",
  });
}

export function PreviewBridge() {
  const router = useRouter();

  useEffect(() => {
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (!isToPreview(event.data)) return;

      switch (event.data.type) {
        case "refresh":
          router.refresh();
          return;
        case "scroll-to":
          scrollToBlock(event.data.blockId);
          return;
        case "highlight": {
          for (const marked of document.querySelectorAll("[data-edit-selected]")) {
            marked.removeAttribute("data-edit-selected");
          }
          if (event.data.blockId) {
            const target = document.querySelector(`[data-block-id="${CSS.escape(event.data.blockId)}"]`);
            target?.setAttribute("data-edit-selected", "");
            target?.setAttribute("data-edit-label", target ? labelFor(target) : "");
          }
          return;
        }
        case "measure": {
          const blocks = [...document.querySelectorAll("[data-block-id]")].map((element) => {
            const box = element.getBoundingClientRect();
            return {
              id: element.getAttribute("data-block-id") ?? "",
              top: box.top + window.scrollY,
              bottom: box.bottom + window.scrollY,
            };
          });
          window.parent.postMessage(
            { channel: PREVIEW_CHANNEL, type: "rects", blocks, scrollY: window.scrollY },
            window.location.origin,
          );
          return;
        }
      }
    };

    // Hover outlines: the block under the pointer says what it is, so the click
    // that selects it is not a surprise.
    const style = document.createElement("style");
    style.textContent = EDIT_STYLE;
    document.head.appendChild(style);
    let hovered: Element | null = null;
    const onOver = (event: MouseEvent) => {
      const block = event.target instanceof Element ? event.target.closest("[data-block-id]") : null;
      if (block === hovered) return;
      hovered?.removeAttribute("data-edit-hover");
      hovered = block;
      if (block) {
        block.setAttribute("data-edit-hover", "");
        block.setAttribute("data-edit-label", labelFor(block));
      }
    };
    const onLeave = () => {
      hovered?.removeAttribute("data-edit-hover");
      hovered = null;
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
    document.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      style.remove();
    };
  }, [router]);

  return null;
}
