"use client";

import { useEffect, useState } from "react";

/**
 * The reply bar: a strip along the bottom of a phone that says where they are
 * with their reply and takes them to it (spec 27 §7).
 *
 *   Your reply · by 1 May                          [ Reply ]
 *   You're coming — Chidi and Ada                  [ Change ]
 *
 * State carried by the page, not a toast that vanishes: the wording comes from
 * what the household has actually answered (`replyBarCopy`), computed on the
 * server, so it is right on arrival and right after they reply.
 *
 * **It gets out of the way**, which is most of the work:
 *   - hidden over the cover — the first screen is the invitation, not an ad for
 *     the form;
 *   - hidden while the reply section itself is on screen — it would sit on the
 *     thing it points at;
 *   - hidden while a field has focus. An on-screen keyboard plus a fixed bar is
 *     the classic mobile failure, and a field somebody is typing in must never
 *     be covered.
 *
 * Phones only (`globals.css`): beyond that the sticky nav already pins an RSVP
 * button, and a bottom bar on a laptop is a cookie banner nobody asked for.
 */
export function ReplyBar({
  text,
  action,
  targetId = "rsvp",
}: {
  text: string;
  action: string;
  /** The section the button scrolls to. */
  targetId?: string;
}) {
  const [coverVisible, setCoverVisible] = useState(true);
  const [targetVisible, setTargetVisible] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const cover = document.getElementById("hero");
    const target = document.getElementById(targetId);

    // No cover to wait for (a page with no hero): nothing to hide behind.
    if (!cover) setCoverVisible(false);

    const watch = (element: HTMLElement | null, set: (visible: boolean) => void) => {
      if (!element) return () => undefined;
      const observer = new IntersectionObserver(([entry]) => set(entry?.isIntersecting ?? false), {
        // A sliver of the cover or the form still on screen is "on screen".
        threshold: 0,
      });
      observer.observe(element);
      return () => observer.disconnect();
    };

    const stopCover = watch(cover, setCoverVisible);
    const stopTarget = watch(target, setTargetVisible);

    const isField = (element: EventTarget | null) =>
      element instanceof HTMLElement && element.matches("input, textarea, select, [contenteditable]");
    const onFocusIn = (event: FocusEvent) => isField(event.target) && setTyping(true);
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      stopCover();
      stopTarget();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [targetId]);

  const shown = !coverVisible && !targetVisible && !typing;

  // Tell the top bar whether this one is up, so a phone never shows two RSVP
  // buttons at once (spec 28 §5.2). A flag on the document rather than a prop:
  // the two live in different parts of the page and neither owns the other.
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.setAttribute("data-reply-bar", "");
    else root.removeAttribute("data-reply-bar");
    return () => root.removeAttribute("data-reply-bar");
  }, [shown]);

  return (
    <div
      role="region"
      aria-label="Your reply"
      className="site-replybar no-print-site"
      data-shown={shown ? "true" : "false"}
      // Out of the tab order and the accessibility tree while it is off screen.
      inert={!shown}
    >
      <span className="site-replybar-text">{text}</span>
      <a href={`#${targetId}`} className="site-replybar-action">
        {action}
      </a>
    </div>
  );
}
