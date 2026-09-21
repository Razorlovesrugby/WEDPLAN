"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyReply, saveDeclineNote } from "@/server/actions/reply";

/**
 * The banner that appears when somebody arrives from the email's Yes or No
 * button (spec 22 §8).
 *
 * It applies the reply **from the browser, on mount**, rather than letting the
 * page write during its server render. Mail scanners and link previewers fetch
 * every URL in a message; a write on GET would record answers nobody gave.
 * They do not run JavaScript, so this line is the whole defence.
 *
 * Then it says what it did, in names, with everything editable below — and
 * after a No, it offers the optional message (Q4) and takes no for an answer.
 */
export function ReplyBanner({
  token,
  reply,
  names,
}: {
  token: string;
  reply: "yes" | "no";
  /** "Chidi and Ada" — who the reply covered. */
  names: string;
}) {
  const router = useRouter();
  const applied = useRef(false);
  const [state, setState] = useState<"applying" | "done" | "error">("applying");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saved">("idle");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Once per mount. React runs effects twice in development, and this is a
    // write.
    if (applied.current) return;
    applied.current = true;

    void (async () => {
      const result = await applyReply({ token, reply });
      if (!result.ok) {
        setError(result.error);
        setState("error");
        return;
      }
      setState("done");
      router.refresh();
    })();
  }, [token, reply, router]);

  if (state === "error") {
    return (
      <div className="mx-auto mt-8 max-w-2xl px-5">
        <p className="border border-line bg-paper p-4 text-[0.95rem] text-muted">
          {error} You can still answer using the form below.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-2xl px-5">
      <div className="border border-accent/40 bg-paper p-5">
        <p className="text-[1.0625rem] text-ink">
          {state === "applying"
            ? "One moment…"
            : reply === "yes"
              ? `Wonderful — we've marked ${names} as coming. Change anything below.`
              : `That's a shame — we've marked ${names} as unable to come. Change anything below.`}
        </p>

        {state === "done" && reply === "no" ? (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await saveDeclineNote({ token, note });
                if (result.ok) setNoteState("saved");
              });
            }}
          >
            <label className="block">
              <span className="mb-1 block text-[0.95rem] text-muted">
                Anything you&rsquo;d like to say? (optional)
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="w-full border border-line bg-white p-2 text-[0.95rem]"
              />
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={pending || note.trim().length === 0}
                className="border border-accent px-4 py-1.5 text-[0.8rem] uppercase tracking-[0.12em] text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
              >
                Send it
              </button>
              {noteState === "saved" ? (
                <span className="text-[0.9rem] text-muted">Sent — thank you.</span>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
