"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantPlannerAccess, revokePlannerAccess, type PlannerInvite } from "@/server/actions/people-access";
import type { PersonRow } from "@/lib/types/database";

/**
 * Sign-in for one person (spec 39 part C). "Planner" level: they see the tasks,
 * vendors and the day, and look at the guest list; not the budget, and not what's
 * private to the two of you. Giving access makes a login and hands back a
 * one-time link to choose a password, which is also emailed if email is set up.
 */
export function PlannerAccess({ person, email }: { person: PersonRow; email: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<PlannerInvite | null>(null);
  const [copied, setCopied] = useState(false);

  function grant(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await grantPlannerAccess(person.id, address);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setInvite(result.data);
      setOpen(false);
      router.refresh();
    });
  }

  function revoke() {
    if (!confirm(`Take away ${person.name}'s access? They'll be signed out of everything on their next click.`)) return;
    startTransition(async () => {
      const result = await revokePlannerAccess(person.id);
      if (!result.ok) setError(result.error);
      else {
        setError(null);
        setInvite(null);
        router.refresh();
      }
    });
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const hasAccess = person.access === "planner";

  return (
    <div className="space-y-2 text-xs">
      {hasAccess ? (
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800">Can sign in</span>
          {email ? <span className="text-muted">{email}</span> : null}
          <button type="button" className="underline" disabled={pending} onClick={() => setOpen((v) => !v)}>
            Send a new link
          </button>
          <button type="button" className="text-red-700 underline" disabled={pending} onClick={revoke}>
            Take away access
          </button>
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-muted">
          <span>No login.</span>
          <button type="button" className="underline" disabled={pending} onClick={() => setOpen((v) => !v)}>
            Let them sign in
          </button>
        </p>
      )}

      {open ? (
        <form onSubmit={grant} className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            required
            className="field max-w-xs"
            placeholder="their email address"
            aria-label={`Email address for ${person.name}`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <button type="submit" className="btn" disabled={pending || address.trim() === ""}>
            Create login &amp; send link
          </button>
          <span className="text-muted">
            They&rsquo;ll see tasks, vendors and the day, and view the guest list. Not the budget.
          </span>
        </form>
      ) : null}

      {invite ? (
        <div className="space-y-1 rounded border border-line bg-white p-2">
          <p>
            {invite.emailed ? "Emailed. " : ""}
            {invite.emailNote ?? ""}
          </p>
          <p className="text-muted">
            This link works once and lets whoever opens it choose a password for {person.name}&rsquo;s login. Send it
            only to them.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly className="field flex-1 font-mono" value={invite.link} aria-label="One-time sign-in link" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-red-700">{error}</p> : null}
    </div>
  );
}
