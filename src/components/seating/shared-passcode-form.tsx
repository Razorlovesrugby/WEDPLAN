"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSharedPlan } from "@/server/actions/seating-share";

/** The passcode box on a shared plan. A right passcode is remembered for this link in this browser. */
export function SharedPasscodeForm({ token }: { token: string }) {
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await unlockSharedPlan(token, passcode);
          if (!r.ok) setMessage(r.error);
          else router.refresh();
        });
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Passcode</span>
        <input className="field w-full" type="password" autoComplete="off" value={passcode} maxLength={64} onChange={(e) => setPasscode(e.target.value)} autoFocus />
      </label>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending || passcode.length === 0}>
        Open the plan
      </button>
    </form>
  );
}
