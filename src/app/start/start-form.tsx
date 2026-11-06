"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWedding } from "@/server/actions/onboarding";
import type { PartnerInvite } from "@/server/partner-invite";
import { CurrencySelect } from "@/components/currency-select";
import { TimeZoneSelect } from "@/components/timezone-select";
import { HONEYPOT_FIELD, PASSWORD_MIN, defaultWeddingName } from "@/lib/onboarding";

/**
 * The /start questionnaire (spec 40 §5.2). One page, no wizard: only what
 * can't sensibly be defaulted. Signed in with no wedding? The account fields
 * are left out.
 */
export function StartForm({
  signedInEmail,
  timeZones,
  currencies,
}: {
  signedInEmail: string | null;
  timeZones: string[];
  currencies: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [yourName, setYourName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  // The wedding name follows the two names until the person types their own.
  const [weddingName, setWeddingName] = useState("");
  const [weddingNameTouched, setWeddingNameTouched] = useState(false);
  const [invite, setInvite] = useState<PartnerInvite | null>(null);

  const shownWeddingName = weddingNameTouched ? weddingName : defaultWeddingName(yourName, partnerName);

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const fields = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    startTransition(async () => {
      const result = await startWedding(fields);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setError(null);
      setFieldErrors({});
      const partnerInvite = result.data.partnerInvite;
      // Email didn't go? Show the one-time link before moving on, so it isn't lost.
      if (partnerInvite && !partnerInvite.emailed) {
        setInvite(partnerInvite);
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  if (invite) {
    return (
      <div className="card mt-8 space-y-3 p-4 text-sm">
        <p className="font-medium">Your wedding is ready.</p>
        <p className="text-muted">{invite.emailNote ?? "We couldn't email your partner."}</p>
        <p>Send your partner this link to choose their password. It works once:</p>
        <p className="break-all rounded bg-line/40 px-2 py-1 font-mono text-xs">{invite.link}</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            router.replace("/");
            router.refresh();
          }}
        >
          Go to your wedding
        </button>
      </div>
    );
  }

  const err = (key: string) =>
    fieldErrors[key]?.[0] ? <p className="mt-1 text-xs text-red-700">{fieldErrors[key]![0]}</p> : null;

  return (
    <form
      className="mt-8 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {/* Nobody sees this. A bot that fills it gets a polite nothing. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase tracking-wide text-muted">You</legend>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Your name</span>
          <input
            name="your_name"
            required
            autoComplete="name"
            className="field"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
          />
          {err("your_name")}
        </label>
        {signedInEmail ? (
          <p className="text-sm text-muted">
            Signed in as <strong>{signedInEmail}</strong>.
          </p>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Email</span>
              <input name="email" type="email" required autoComplete="email" className="field" />
              {err("email")}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={PASSWORD_MIN}
                  autoComplete="new-password"
                  className="field"
                />
                <span className="mt-1 block text-xs text-muted">At least {PASSWORD_MIN} characters.</span>
                {err("password")}
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Password again</span>
                <input
                  name="password_again"
                  type="password"
                  required
                  minLength={PASSWORD_MIN}
                  autoComplete="new-password"
                  className="field"
                />
                {err("password_again")}
              </label>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase tracking-wide text-muted">Your partner (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Their name</span>
            <input
              name="partner_name"
              className="field"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
            />
            {err("partner_name")}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Their email</span>
            <input name="partner_email" type="email" className="field" />
            {err("partner_email")}
          </label>
        </div>
        <p className="text-xs text-muted">
          Give their email and we&rsquo;ll send them a link to choose a password. You can also invite them later from
          Settings.
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase tracking-wide text-muted">The wedding</legend>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Wedding name</span>
          <input
            name="wedding_name"
            required
            className="field"
            value={shownWeddingName}
            onChange={(e) => {
              setWeddingNameTouched(true);
              setWeddingName(e.target.value);
            }}
          />
          {err("wedding_name")}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Date (if you know it)</span>
            <input name="wedding_date" type="date" className="field" />
            {err("wedding_date")}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Rough guest count</span>
            <input name="capacity" type="number" min={1} max={5000} inputMode="numeric" className="field" />
            {err("capacity")}
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Timezone of the venue</span>
          <TimeZoneSelect name="timezone" timeZones={timeZones} detect />
          <span className="mt-1 block text-xs text-muted">Every task, date and time in the app uses this.</span>
          {err("timezone")}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Currency</span>
          <CurrencySelect name="currency" currencies={currencies} />
          <span className="mt-1 block text-xs text-muted">The symbol your budget shows. Amounts are never converted.</span>
          {err("currency")}
        </label>
      </fieldset>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating your wedding…" : "Create our wedding"}
      </button>
      <p className="text-center text-xs text-muted">You can change all of this later in Settings.</p>
    </form>
  );
}
