"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGiftFund, saveGiftBankDetails, saveGiftFund } from "@/server/actions/gift-funds";
import { DEFAULT_GIFT_MESSAGE } from "@/lib/site/gift-funds";
import { accountDigits, formatNzAccount, giftReference, parseNzAccount } from "@/lib/site/bank-account";
import type { GiftBankDetailsRow, GiftFundRow } from "@/lib/types/database";

/**
 * The gift list editor (0030).
 *
 * One card per fund, each its own form. Not one big form with a save button
 * at the bottom: a page of four funds saved together is a page where a typo
 * in the fourth loses the edits to the first three.
 *
 * Spec 28 §6.1: a fund is a name, a line and an optional link. The target and
 * "raised so far" fields are gone — a gift is a transfer to the couple's
 * account, which is written down once, at the top, and opened by the
 * guest's Contribute button.
 */

type Draft = {
  name: string;
  blurb: string;
  contribute_url: string;
};

function toDraft(row: GiftFundRow): Draft {
  return {
    name: row.name,
    blurb: row.blurb ?? "",
    contribute_url: row.contribute_url ?? "",
  };
}

const EMPTY: Draft = { name: "", blurb: "", contribute_url: "" };

export function GiftFundEditor({
  funds,
  bank,
}: {
  funds: GiftFundRow[];
  bank: GiftBankDetailsRow | null;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <BankDetailsCard bank={bank} />

      <h2 className="pt-2 font-serif text-lg">What you&rsquo;re saving towards</h2>
      {funds.map((fund) => (
        <FundCard key={fund.id} id={fund.id} initial={toDraft(fund)} />
      ))}

      {adding ? (
        <FundCard id={null} initial={EMPTY} onFinished={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn w-full" onClick={() => setAdding(true)}>
          + Add a fund
        </button>
      )}

      {funds.length === 0 && !adding ? (
        <p className="text-sm text-muted">
          Nothing yet. Most couples have two or three — the honeymoon, something for the house, a
          charity that matters to them.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The wedding's account details, written once.
 *
 * The number is checked as it is typed — the same `parseNzAccount` the action
 * uses, so the message here and the refusal there cannot disagree — and shown
 * back in the grouping a guest will see, so a slipped digit is caught here
 * rather than by a bank. Saving it empty is allowed: no details, no Contribute
 * button.
 */
function BankDetailsCard({ bank }: { bank: GiftBankDetailsRow | null }) {
  const router = useRouter();
  const [accountName, setAccountName] = useState(bank?.account_name ?? "");
  const [accountNumber, setAccountNumber] = useState(
    bank?.account_number ? formatNzAccount(bank.account_number) : "",
  );
  const [message, setMessage] = useState(bank?.message ?? "");
  const [note, setNote] = useState(bank?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const typed = accountNumber.trim() !== "";
  const checked = typed ? parseNzAccount(accountNumber) : null;
  // Nothing is said until there is something to say: an error under an empty
  // field the planner has not reached yet is nagging.
  const numberProblem = checked && !checked.ok && accountDigits(accountNumber).length >= 4 ? checked.error : null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveGiftBankDetails({
        account_name: accountName,
        account_number: accountNumber,
        message,
        note,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.error);
        return;
      }
      setErrors({});
      // Tidy what is in the box into the grouping that was saved.
      if (checked?.ok) setAccountNumber(checked.formatted);
      setStatus("Saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div>
        <h2 className="font-serif text-lg">Where guests send it</h2>
        <p className="mt-0.5 text-sm text-muted">
          Written once for the whole wedding. Guests see it when they press Contribute — on their
          own page only, never in a link preview.
        </p>
      </div>

      <Field label="Account name" name="account_name" errors={errors["account_name"]}>
        <input
          className="field"
          value={accountName}
          onChange={(event) => {
            setAccountName(event.target.value);
            setStatus(null);
          }}
          placeholder="Ray & Olivia Smith"
          maxLength={120}
        />
      </Field>

      <Field label="Account number" name="account_number" errors={errors["account_number"]}>
        <input
          className="field tabular-nums"
          inputMode="numeric"
          value={accountNumber}
          onChange={(event) => {
            setAccountNumber(event.target.value);
            setStatus(null);
          }}
          placeholder="12-3456-7890123-00"
          aria-invalid={numberProblem ? true : undefined}
        />
        {numberProblem ? (
          <span className="mt-1 block text-sm text-red-700">{numberProblem}</span>
        ) : checked?.ok ? (
          <span className="mt-1 block text-sm text-muted">
            Guests will see {checked.formatted}.
          </span>
        ) : null}
      </Field>

      <Field label="A word of thanks (optional)" name="message" errors={errors["message"]}>
        <input
          className="field"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            setStatus(null);
          }}
          placeholder={DEFAULT_GIFT_MESSAGE}
          maxLength={300}
        />
        <p className="mt-1 text-xs text-muted">At the top of the popup. Empty keeps the line above.</p>
      </Field>

      <Field label="Anything else (optional)" name="note" errors={errors["note"]}>
        <input
          className="field"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setStatus(null);
          }}
          placeholder="ASB, if that helps"
          maxLength={400}
        />
      </Field>

      <p className="text-xs text-muted">
        Each household is asked to put its own name as the reference —{" "}
        <span className="font-medium text-ink">{giftReference("The Okonkwo Family")}</span> for the
        Okonkwos — so you can tell from your statement who sent what.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={pending || Boolean(numberProblem)}>
          {pending ? "Saving…" : "Save details"}
        </button>
        {status ? <span className="text-sm text-muted">{status}</span> : null}
      </div>
    </form>
  );
}

function FundCard({
  id,
  initial,
  onFinished,
}: {
  id: string | null;
  initial: Draft;
  onFinished?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: keyof Draft, value: string) {
    setDraft((was) => ({ ...was, [key]: value }));
    setMessage(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveGiftFund({ ...draft, ...(id ? { id } : {}) });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      setErrors({});
      setMessage("Saved");
      onFinished?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <Field label="What it is" name="name" errors={errors["name"]}>
        <input
          className="field"
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="The honeymoon"
          required
          maxLength={120}
        />
      </Field>

      <Field label="A line about it" name="blurb" errors={errors["blurb"]}>
        <input
          className="field"
          value={draft.blurb}
          onChange={(event) => set("blurb", event.target.value)}
          placeholder="Two weeks somewhere with no phone signal"
          maxLength={400}
        />
      </Field>

      <Field label="Or give online (optional)" name="contribute_url" errors={errors["contribute_url"]}>
        <input
          className="field"
          type="url"
          value={draft.contribute_url}
          onChange={(event) => set("contribute_url", event.target.value)}
          placeholder="https://…"
          maxLength={2000}
        />
        <p className="mt-1 text-xs text-muted">
          A payment page, if you have one. Guests see it as &ldquo;Or give online&rdquo; under
          your bank details. Leave it empty for none.
        </p>
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : id ? "Save" : "Add it"}
        </button>
        {id ? (
          <button
            type="button"
            className="text-sm text-red-700 hover:underline"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete "${draft.name}"? This cannot be undone.`)) return;
              startTransition(async () => {
                const result = await deleteGiftFund(id);
                if (!result.ok) setMessage(result.error);
                else router.refresh();
              });
            }}
          >
            Delete
          </button>
        ) : (
          <button type="button" className="btn" onClick={onFinished}>
            Cancel
          </button>
        )}
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  errors,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {errors?.length ? (
        <span className="mt-1 block text-sm text-red-700">{errors.join(" ")}</span>
      ) : null}
    </label>
  );
}
