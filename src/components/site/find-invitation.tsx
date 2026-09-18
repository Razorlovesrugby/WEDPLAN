"use client";

import { useState, useTransition } from "react";
import { findMyInvitation } from "@/server/actions/find-invitation";

/**
 * "Lost your link?" on the public site (spec 14 §2).
 *
 * Deliberately says the same thing whether or not the address matched — see
 * the action. The copy has to carry that without sounding evasive, which is
 * why it says "if that address is on our guest list" rather than "sent".
 */
export function FindInvitation() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div id="find-invitation" className="no-print-site mx-auto mt-8 max-w-sm scroll-mt-16 text-left">
      <label htmlFor="find-email" className="block text-[0.85rem] font-medium text-ink">
        Lost your link? Enter the email we&rsquo;d have used.
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="find-email"
          type="email"
          autoComplete="email"
          className="w-full rounded-sm border border-line bg-paper px-3 py-2 text-[0.95rem] text-ink outline-none focus:border-accent"
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          type="button"
          className="shrink-0 border border-accent px-3 py-2 text-[0.72rem] uppercase tracking-[0.12em] text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
          disabled={pending || email.trim() === ""}
          onClick={() =>
            startTransition(async () => {
              const result = await findMyInvitation({ email });
              setMessage(result.ok ? result.data.message : "Something went wrong — message us.");
            })
          }
        >
          {pending ? "Sending…" : "Send it"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-[0.85rem] text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
