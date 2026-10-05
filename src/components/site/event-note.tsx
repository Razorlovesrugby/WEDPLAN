"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The couple's note for one event, under its venue (spec 28 §5.3): parking,
 * timings, what happens when.
 *
 * A long one shows its first three lines with **More** to open it in place, so
 * a guest scanning the weekend sees its shape and one who wants the parking
 * details taps. It is rendered whole on the server and only collapsed once the
 * browser has measured it — a guest without JavaScript, or in the instant
 * before hydration, reads the entire note rather than a clamp nothing can open.
 *
 * Whether it is long is measured, not guessed from a character count: the same
 * note is three lines on a laptop and six on a phone.
 */
const COLLAPSED_LINES = 3;

export function EventNote({ text }: { text: string }) {
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [collapsible, setCollapsible] = useState(false);
  const [open, setOpen] = useState(false);

  // Before paint, so a note that is about to be clamped is never seen whole.
  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 24;
    // `scrollHeight` is the full text height whether or not it is clamped, so
    // this reads the same on the way in and after a resize. Half a line of
    // slack: a note that runs three lines and a hair is not worth a button.
    setCollapsible(element.scrollHeight > lineHeight * (COLLAPSED_LINES + 0.5));
  }, [text]);

  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const remeasure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 24;
      setCollapsible(element.scrollHeight > lineHeight * (COLLAPSED_LINES + 0.5));
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [text]);

  return (
    <div className="site-event-note mt-3">
      <p
        ref={paragraph}
        className={`whitespace-pre-line text-[1rem] leading-relaxed text-ink ${
          collapsible && !open ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-[0.85rem] text-accent underline underline-offset-2"
        >
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}
