"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePassword } from "@/server/actions/auth";
import { changePartnerEmail, invitePartner, resendPartnerInvite } from "@/server/actions/partner";
import type { PartnerAccount } from "@/server/queries/partner";
import type { PartnerInvite } from "@/server/partner-invite";
import { CollaboratorNamesEditor } from "@/components/settings/collaborator-names-editor";
import { PASSWORD_MIN } from "@/lib/onboarding";
import type { CollaboratorRow } from "@/lib/types/database";

/**
 * Settings → Your account (spec 40 §6): both names, your password, and your
 * partner's invite. Your login email is shown and not editable (Q9).
 */
export function AccountSection({
  email,
  collaborators,
  partner,
}: {
  email: string | null;
  collaborators: CollaboratorRow[];
  partner: PartnerAccount | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Names</h3>
        <p className="text-sm text-muted">
          Shown on the assign picker and everywhere a task&rsquo;s assignee appears.
        </p>
        <CollaboratorNamesEditor collaborators={collaborators} />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Your login</h3>
        <p className="text-sm">
          Signed in as <strong>{email ?? "unknown"}</strong>
        </p>
        <ChangePasswordForm />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Your partner</h3>
        <PartnerCard partner={partner} />
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={() => { setOpen(true); setDone(false); }}>
          Change password
        </button>
        {done ? <span className="text-sm text-green-700">Password changed.</span> : null}
      </div>
    );
  }

  const err = (key: string) =>
    fieldErrors[key]?.[0] ? <p className="mt-1 text-xs text-red-700">{fieldErrors[key]![0]}</p> : null;

  return (
    <form
      className="card max-w-md space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await changePassword({
            current: String(data.get("current") ?? ""),
            next: String(data.get("next") ?? ""),
            again: String(data.get("again") ?? ""),
          });
          if (result.ok) {
            setError(null);
            setFieldErrors({});
            setDone(true);
            setOpen(false);
          } else {
            setError(result.fieldErrors ? null : result.error);
            setFieldErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Current password</span>
        <input name="current" type="password" required autoComplete="current-password" className="field" />
        {err("current")}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">New password</span>
        <input name="next" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="field" />
        <span className="mt-1 block text-xs text-muted">At least {PASSWORD_MIN} characters.</span>
        {err("next")}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">New password again</span>
        <input name="again" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="field" />
        {err("again")}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Link className="text-sm underline hover:text-accent" href="/forgot-password">
          Forgot it?
        </Link>
      </div>
    </form>
  );
}

function InviteResult({ invite }: { invite: PartnerInvite }) {
  return invite.emailed ? (
    <p className="text-sm text-green-700">Invite sent.</p>
  ) : (
    <div className="space-y-1 text-sm">
      <p className="text-muted">{invite.emailNote ?? "We couldn't email them."}</p>
      <p>Send them this link to choose a password. It works once:</p>
      <p className="break-all rounded bg-line/40 px-2 py-1 font-mono text-xs">{invite.link}</p>
    </div>
  );
}

function PartnerCard({ partner }: { partner: PartnerAccount | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<PartnerInvite | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);

  function run(action: () => Promise<{ ok: true; data: PartnerInvite } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        setInvite(result.data);
        setEditingEmail(false);
        router.refresh();
      } else {
        setError(Object.values(result.fieldErrors ?? {})[0]?.[0] ?? result.error);
      }
    });
  }

  if (!partner) {
    return (
      <form
        className="card max-w-md space-y-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          run(() => invitePartner(String(data.get("name") ?? ""), String(data.get("email") ?? "")));
        }}
      >
        <p className="text-sm text-muted">Invite your partner so they can plan with you. They&rsquo;ll see everything you can.</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Their name</span>
          <input name="name" className="field" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Their email</span>
          <input name="email" type="email" required className="field" />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Inviting…" : "Invite your partner"}
        </button>
        {invite ? <InviteResult invite={invite} /> : null}
      </form>
    );
  }

  return (
    <div className="card max-w-md space-y-3 p-3 text-sm">
      <p>
        <strong>{partner.name ?? "Your partner"}</strong>
        {partner.email ? <span className="text-muted"> · {partner.email}</span> : null}
      </p>
      <p className={partner.joined ? "text-green-700" : "text-muted"}>
        {partner.joined ? "Joined" : "Invited, not joined yet"}
      </p>
      {partner.joined ? null : editingEmail ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() => changePartnerEmail(String(data.get("email") ?? "")));
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Their email</span>
            <input name="email" type="email" required defaultValue={partner.email ?? ""} className="field" />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Saving…" : "Save and send"}
            </button>
            <button type="button" className="btn" onClick={() => setEditingEmail(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => resendPartnerInvite())}>
            {pending ? "Sending…" : "Re-send invite"}
          </button>
          <button type="button" className="btn" onClick={() => setEditingEmail(true)}>
            Change email
          </button>
        </div>
      )}
      {error ? <p className="text-red-700">{error}</p> : null}
      {invite ? <InviteResult invite={invite} /> : null}
    </div>
  );
}
