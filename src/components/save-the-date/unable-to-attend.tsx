"use client";

import { useState, useTransition } from "react";
import { declineSaveTheDate, undoSaveTheDateDecline } from "@/server/actions/save-the-date-reply";
import { UNABLE_BUTTON_LABEL } from "@/lib/site/save-the-date";
import { declinedConfirmation } from "@/lib/unable-to-attend";

/**
 * "Already know you won't be able to make it?" (spec 29 §4.2).
 *
 * A quiet block under the save-the-date, for the guest who is CERTAIN. It is
 * deliberately not an RSVP and must never read like one: no "RSVP", "reply",
 * "confirm" or "required" anywhere on it, no commitment asked of anyone
 * undecided, and nothing happens unless somebody presses the button. A guest
 * who never touches it stays on the invitation list by default.
 *
 * Three states, one button each way:
 *
 *   idle     the planner's words and the button.
 *   confirm  one step, because a mis-tap costs the guest their invitation.
 *            A one-person household is asked once; a household of several
 *            gets its names, all pre-ticked, so a couple where only one can't
 *            come isn't forced into all-or-nothing — and the common case is
 *            still one tap and one confirm.
 *   done     a thank-you naming who won't be sent one, with Undo, because the
 *            guest has no other way to correct it.
 *
 * `preview` is the planner's own look (the designer, or "open as a guest"):
 * it behaves like the real thing but saves nothing, the same way the site
 * preview shows every control and lets none of them write.
 */

export type UnablePerson = { id: string; name: string };

export function UnableToAttend({
  weddingSlug,
  address,
  text,
  candidates: initialCandidates,
  declined: initialDeclined,
  preview = false,
}: {
  weddingSlug: string;
  /** The household's address segment, `okonkwo-4f7ak`. */
  address: string;
  text: string;
  /** Guests with nothing recorded — who could be named. */
  candidates: UnablePerson[];
  /** Guests who already told us from this page. */
  declined: UnablePerson[];
  preview?: boolean;
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [declined, setDeclined] = useState(initialDeclined);
  const [view, setView] = useState<"idle" | "choose" | "done">(
    initialDeclined.length > 0 ? "done" : "idle",
  );
  const [ticked, setTicked] = useState<Set<string>>(new Set(initialCandidates.map((p) => p.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Nobody on this page has anything left to say, or to take back.
  if (candidates.length === 0 && declined.length === 0) return null;

  const everyone = candidates.length + declined.length;
  const alone = everyone === 1;

  function open() {
    setError(null);
    setTicked(new Set(candidates.map((person) => person.id)));
    setView("choose");
  }

  function submit() {
    const chosen = candidates.filter((person) => ticked.has(person.id));
    if (chosen.length === 0) return;
    setError(null);

    const apply = () => {
      const done = new Set(chosen.map((person) => person.id));
      setDeclined((current) => [...current, ...chosen]);
      setCandidates((current) => current.filter((person) => !done.has(person.id)));
      setView("done");
    };

    if (preview) {
      apply();
      return;
    }
    startTransition(async () => {
      const result = await declineSaveTheDate({
        weddingSlug,
        address,
        guestIds: chosen.map((person) => person.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      apply();
    });
  }

  function undo() {
    setError(null);
    const restore = () => {
      setCandidates((current) => [...current, ...declined]);
      setDeclined([]);
      setView("idle");
    };
    if (preview) {
      restore();
      return;
    }
    startTransition(async () => {
      const result = await undoSaveTheDateDecline({ weddingSlug, address });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      restore();
    });
  }

  const textClass = "font-body text-[15px] leading-relaxed text-muted";

  return (
    <div className="border-t border-line pt-8" data-unable-to-attend>
      {view === "idle" ? (
        <>
          <p className={`${textClass} max-w-xl whitespace-pre-line`}>{text}</p>
          <button type="button" className="std-button mt-5" onClick={open}>
            {UNABLE_BUTTON_LABEL}
          </button>
        </>
      ) : null}

      {view === "choose" ? (
        <div className="max-w-xl">
          {alone ? (
            <p className={textClass}>Let us know you can’t come?</p>
          ) : (
            <fieldset>
              <legend className={textClass}>Who can’t come?</legend>
              <ul className="mt-3 space-y-2">
                {candidates.map((person) => (
                  <li key={person.id}>
                    <label className="flex items-center gap-2.5 text-[15px]">
                      <input
                        type="checkbox"
                        checked={ticked.has(person.id)}
                        onChange={(event) =>
                          setTicked((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(person.id);
                            else next.delete(person.id);
                            return next;
                          })
                        }
                      />
                      {person.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="std-button"
              onClick={submit}
              disabled={pending || (!alone && ticked.size === 0)}
            >
              {alone ? `Yes, ${UNABLE_BUTTON_LABEL.charAt(0).toLowerCase()}${UNABLE_BUTTON_LABEL.slice(1)}` : "Let us know"}
            </button>
            <button
              type="button"
              className="text-sm text-muted underline"
              onClick={() => setView(declined.length > 0 ? "done" : "idle")}
              disabled={pending}
            >
              Go back
            </button>
          </div>
          {preview ? (
            <p className="mt-3 text-xs text-muted">Preview — nothing is saved.</p>
          ) : null}
        </div>
      ) : null}

      {view === "done" ? (
        <div className="max-w-xl" role="status">
          <p className={textClass}>
            {declinedConfirmation(
              declined.map((person) => person.name),
              candidates.length === 0,
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="text-muted">Changed your mind?</span>
            <button type="button" className="underline" onClick={undo} disabled={pending}>
              Undo
            </button>
            {candidates.length > 0 ? (
              <button type="button" className="text-muted underline" onClick={open} disabled={pending}>
                Someone else can’t come either
              </button>
            ) : null}
          </div>
          {preview ? (
            <p className="mt-3 text-xs text-muted">Preview — nothing is saved.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
