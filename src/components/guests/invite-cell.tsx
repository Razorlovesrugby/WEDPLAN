"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACTION_LABEL,
  INVITE_LABEL,
  actionsFor,
  needsConfirm,
  type InviteAction,
  type InviteState,
} from "@/lib/invites";
import {
  clearGuestEventOverride,
  markInvitationSent,
  setGuestEventInvite,
  setRsvpStatus,
} from "@/server/actions/invites";
import { STATE_DESCRIPTION } from "@/lib/guest-table";
import { StatusMark } from "./status-mark";
import { useFixedMenu } from "./use-fixed-menu";

/**
 * One cell of the guest grid: this person, this event (spec 22 §5).
 *
 * Clicking opens a menu rather than cycling the state. Six states behind one
 * click is a guessing game, and two of the transitions — un-inviting somebody
 * who has answered, and marking an invitation as sent — are not things to do
 * by accident.
 *
 * Writing happens at whichever level the action means: an answer writes
 * `rsvps`, inviting or removing one person writes an override, and marking as
 * sent writes a fact about the whole household. The last one is why the
 * confirm text says "the whole invitation" out loud.
 */

export function InviteCell({
  guestId,
  householdId,
  eventId,
  guestName,
  eventName,
  state,
  /** True when this person is singled out — the grid marks it with a dot. */
  overridden,
  hasInvitation,
  dimmed = false,
  layout = "cell",
}: {
  guestId: string;
  householdId: string;
  eventId: string;
  guestName: string;
  eventName: string;
  state: InviteState;
  overridden: boolean;
  hasInvitation: boolean;
  /** Faded for someone who can't attend; the menu itself stays full strength. */
  dimmed?: boolean;
  /**
   * "cell" is a table cell with a menu beside it. "sheet" is the phone's
   * guest cards (spec 48): a plain box whose choices open as an iOS-style
   * action sheet from the bottom of the screen, with full-width targets.
   */
  layout?: "cell" | "sheet";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cellRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const menuStyle = useFixedMenu(open && layout === "cell", close, buttonRef, cellRef, 224);
  const sheet = layout === "sheet";

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (!cellRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function confirmText(action: InviteAction): string | null {
    if (action === "mark_sent") {
      return `Mark the whole invitation for this household as sent? It covers every event they're invited to, not just ${eventName}.`;
    }
    if (action === "remove") {
      return `${guestName} answered "${INVITE_LABEL[state]}" for ${eventName}. Remove them from it anyway? Their answer is kept, it just stops counting.`;
    }
    return null;
  }

  function run(action: InviteAction) {
    const confirmation = needsConfirm(action, state) ? confirmText(action) : null;
    if (confirmation && !window.confirm(confirmation)) return;

    startTransition(async () => {
      const result = await (async () => {
        switch (action) {
          case "invite":
            return setGuestEventInvite(guestId, eventId, true);
          case "remove":
            return setGuestEventInvite(guestId, eventId, false);
          case "mark_sent":
            return markInvitationSent(householdId);
          case "set_yes":
            return setRsvpStatus(guestId, eventId, "yes");
          case "set_no":
            return setRsvpStatus(guestId, eventId, "no");
          case "set_maybe":
            return setRsvpStatus(guestId, eventId, "maybe");
          case "clear_answer":
            return setRsvpStatus(guestId, eventId, "pending");
        }
      })();

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  const actions = actionsFor(state);

  const words = `${guestName}, ${eventName}: ${STATE_DESCRIPTION[state]}${
    overridden ? ". Set for this person, not their household" : ""
  }`;

  const Wrapper = sheet ? "div" : "td";
  const item = sheet
    ? "block min-h-12 w-full border-b border-line/70 px-4 text-left text-[17px] font-normal text-accent last:border-b-0 active:bg-line/40 disabled:opacity-50"
    : "block min-h-9 w-full rounded px-2 py-1.5 text-left text-sm font-normal text-ink hover:bg-paper disabled:opacity-50";

  return (
    <Wrapper ref={cellRef as never} className={sheet ? "flex justify-center" : "px-1 py-1 text-center"}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={pending}
        className={`inline-flex ${sheet ? "min-h-11 min-w-11" : "min-h-8 min-w-10"} items-center justify-center rounded-md hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 ${dimmed ? "opacity-55" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={words}
        title={words}
      >
        <StatusMark state={state} overridden={overridden} />
      </button>

      {open && sheet ? (
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          className="sheet-backdrop fixed inset-0 z-40 cursor-default bg-black/30"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open ? (
        <div
          role="menu"
          aria-label={`${guestName}, ${eventName}`}
          style={sheet ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" } : menuStyle}
          className={
            sheet
              ? "sheet-panel fixed inset-x-0 bottom-0 z-50 space-y-2 px-2 text-center"
              : "z-40 rounded-md border border-line bg-white p-1 text-left shadow-lg"
          }
        >
          <div className={sheet ? "overflow-hidden rounded-2xl bg-white/95 text-center backdrop-blur-xl" : ""}>
          <p
            className={
              sheet
                ? "flex flex-col items-center gap-1 border-b border-line/70 px-4 py-3 text-[13px] text-muted"
                : "flex items-center gap-2 border-b border-line px-2 pb-2 pt-1 text-xs text-muted"
            }
          >
            <StatusMark state={state} overridden={overridden} />
            <span>
              <span className="block font-medium text-ink">{sheet ? `${guestName} · ${eventName}` : eventName}</span>
              {STATE_DESCRIPTION[state]}
            </span>
          </p>
          {!hasInvitation ? (
            <p className="px-2 py-1.5 text-xs font-normal text-muted">
              No invitation yet — create one on Invitations before inviting them to events.
            </p>
          ) : null}

          {actions.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              disabled={pending || !hasInvitation}
              onClick={() => run(action)}
              className={sheet ? item.replace("text-left", "text-center") : item}
            >
              {ACTION_LABEL[action]}
            </button>
          ))}

          {overridden ? (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await clearGuestEventOverride(guestId, eventId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
              className={
                sheet
                  ? item.replace("text-left", "text-center")
                  : "mt-1 block w-full rounded border-t border-line px-2 py-1.5 text-left text-xs text-muted hover:bg-paper"
              }
            >
              Follow the household again
            </button>
          ) : null}

          {error ? <p className="px-2 py-1.5 text-xs text-red-700">{error}</p> : null}
          </div>
          {sheet ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block min-h-14 w-full rounded-2xl bg-white text-[17px] font-semibold text-accent active:bg-line/40"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </Wrapper>
  );
}
