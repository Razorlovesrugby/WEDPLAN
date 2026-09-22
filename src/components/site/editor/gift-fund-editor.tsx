"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGiftFund, saveGiftFund } from "@/server/actions/gift-funds";
import { fundProgress } from "@/lib/site/gift-funds";
import { formatMoneyShort } from "@/lib/format";
import type { GiftFundRow } from "@/lib/types/database";

/**
 * The gift list editor (0030).
 *
 * One card per fund, each its own form. Not one big form with a save button
 * at the bottom: a page of four funds saved together is a page where a typo
 * in the fourth loses the edits to the first three.
 *
 * Figures are in dollars here and stored as minor units, converted once in
 * `saveGiftFund`. The planner types what they would say out loud.
 */

type Draft = {
  name: string;
  blurb: string;
  target: string;
  raised: string;
  contribute_url: string;
};

function toDraft(row: GiftFundRow): Draft {
  return {
    name: row.name,
    blurb: row.blurb ?? "",
    // Minor units back to the dollars the planner typed. An empty target
    // stays empty rather than becoming "0", which would read as a fund with
    // a target of nothing.
    target: row.target_minor === null ? "" : String(row.target_minor / 100),
    raised: String(row.raised_minor / 100),
    contribute_url: row.contribute_url ?? "",
  };
}

const EMPTY: Draft = { name: "", blurb: "", target: "", raised: "", contribute_url: "" };

export function GiftFundEditor({ funds }: { funds: GiftFundRow[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
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

  // The same sum the guest site does, so the planner sees the bar they are
  // about to publish rather than finding out on the live page.
  const preview = fundProgress(
    Math.round(Number(draft.raised || 0) * 100),
    draft.target === "" ? null : Math.round(Number(draft.target) * 100),
  );

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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Target (optional)" name="target" errors={errors["target"]}>
          <input
            className="field"
            inputMode="decimal"
            value={draft.target}
            onChange={(event) => set("target", event.target.value)}
            placeholder="1200"
          />
        </Field>
        <Field label="Raised so far" name="raised" errors={errors["raised"]}>
          <input
            className="field"
            inputMode="decimal"
            value={draft.raised}
            onChange={(event) => set("raised", event.target.value)}
            placeholder="740"
          />
        </Field>
      </div>

      <Field label="Where Contribute sends them" name="contribute_url" errors={errors["contribute_url"]}>
        <input
          className="field"
          type="url"
          value={draft.contribute_url}
          onChange={(event) => set("contribute_url", event.target.value)}
          placeholder="https://…"
          maxLength={2000}
        />
        <p className="mt-1 text-xs text-muted">
          Leave it empty and the fund still shows, with no button.
        </p>
      </Field>

      {preview === null ? null : (
        <p className="text-xs text-muted">
          On the site: {formatMoneyShort(Math.round(Number(draft.raised || 0) * 100))} of{" "}
          {formatMoneyShort(Math.round(Number(draft.target) * 100))} — the rule is{" "}
          {Math.round(preview * 100)}% filled.
        </p>
      )}

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
