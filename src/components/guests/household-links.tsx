"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { absoluteUrl } from "@/lib/env";
import { whatsappMessage } from "@/lib/email/templates-client";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import { householdPath, type HouseholdAddress } from "@/lib/site/household-slug";
import { useFixedMenu } from "./use-fixed-menu";

/**
 * "Links ▾" on a household's row (spec 47 §4.5): the links a planner pastes
 * into whichever chat that household reads, without leaving the guest list.
 *
 * The same links as Invitations → Send, which keeps its own buttons; this is
 * a second way in, not a move. Copy rather than send: nothing here emails
 * anyone. The links are built here, not fetched: Safari refuses a clipboard
 * write that waits on the network after the click.
 */
export function HouseholdLinks({
  householdName,
  weddingSlug,
  address,
  invitationId,
  weddingName,
  dateLabel,
}: {
  householdName: string;
  weddingSlug: string;
  /** The household's page address (spec 21); null if the household is missing. */
  address: HouseholdAddress | null;
  /** null until the household has an invitation. */
  invitationId: string | null;
  weddingName: string;
  dateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /** Shown when the clipboard refuses, so the text can be copied by hand. */
  const [fallback, setFallback] = useState<{ label: string; text: string } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const fallbackField = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const close = useCallback(() => {
    setOpen(false);
    setFallback(null);
  }, []);
  const style = useFixedMenu(open, close, button, wrapper, 256);

  const placed = open && style.visibility !== "hidden";

  // Focus the first item once the menu is placed: an element that is still
  // invisible can't take focus.
  useEffect(() => {
    if (placed && !fallback) menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
  }, [placed, fallback]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open, close]);

  useEffect(() => {
    if (fallback) fallbackField.current?.select();
  }, [fallback]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      close();
      button.current?.focus();
    } catch {
      setFallback({ label, text });
    }
  }

  function copyInvitation(asMessage: boolean) {
    if (!address) return;
    const url = absoluteUrl(householdPath(weddingSlug, address));
    void copy(
      asMessage ? "WhatsApp message copied" : "Invitation link copied",
      asMessage ? whatsappMessage({ weddingName, householdName, dateLabel, url }) : url,
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // The copy-it-yourself box keeps its own arrow keys.
    if (event.target instanceof HTMLTextAreaElement && event.key !== "Escape") return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled]):not([aria-disabled=true])") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      button.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    }
  }

  const noInvitation = invitationId === null;
  const item =
    "flex min-h-10 w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-sm text-ink hover:bg-paper focus-visible:bg-paper focus-visible:outline-none disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent";
  const hint = <span className="shrink-0 text-xs text-muted">No invitation yet</span>;

  return (
    <div
      ref={wrapper}
      className="inline-block"
      onKeyDown={open ? onKeyDown : undefined}
      // Tabbing out closes it, like clicking away does.
      onBlur={(event) => {
        if (open && event.relatedTarget && !wrapper.current?.contains(event.relatedTarget)) close();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Links for ${householdName}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors ${
          copied
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-line bg-white text-ink hover:bg-line/40"
        }`}
      >
        {copied ? (
          <>✓ Copied</>
        ) : (
          <>
            Links <span aria-hidden className="text-muted">▾</span>
          </>
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ?? ""}
      </span>

      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={`Links for ${householdName}`}
          style={style}
          className="z-40 rounded-md border border-line bg-white p-1 shadow-lg"
        >
          <p className="truncate border-b border-line px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted">
            {householdName}
          </p>

          {fallback ? (
            <div className="space-y-1.5 p-2">
              <p className="text-xs text-muted">
                Couldn&rsquo;t reach the clipboard. It&rsquo;s selected below: copy it with ⌘C or Ctrl+C.
              </p>
              <textarea
                ref={fallbackField}
                readOnly
                value={fallback.text}
                rows={fallback.text.includes("\n") ? 5 : 2}
                aria-label={fallback.label}
                className="field resize-none px-2 py-1.5 text-xs"
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!address}
                className={item}
                onClick={() =>
                  address &&
                  void copy("Save-the-date link copied", absoluteUrl(saveTheDatePath(weddingSlug, address)))
                }
              >
                Copy save-the-date link
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={noInvitation || !address}
                className={item}
                onClick={() => copyInvitation(false)}
              >
                Copy invitation link
                {noInvitation ? hint : null}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={noInvitation || !address}
                className={item}
                onClick={() => copyInvitation(true)}
              >
                Copy WhatsApp message
                {noInvitation ? hint : null}
              </button>
              {/* A plain link, not a fetch: the browser shows the PNG in a tab,
                  ready to save for the stationer. */}
              {noInvitation ? (
                <span role="menuitem" aria-disabled="true" className={`${item} cursor-default text-muted hover:bg-transparent`}>
                  QR code
                  {hint}
                </span>
              ) : (
                <a
                  role="menuitem"
                  href={`/api/qr/${invitationId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={item}
                  onClick={close}
                >
                  QR code
                  <span aria-hidden className="text-xs text-muted">
                    ↗
                  </span>
                </a>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
