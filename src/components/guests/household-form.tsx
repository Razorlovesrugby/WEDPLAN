"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createHousehold, removeHousehold, updateHousehold } from "@/server/actions/guests";

export function HouseholdForm({
  household,
}: {
  household?: { id: string; display_name: string; address: string | null; notes: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

    // Kept as two branches rather than one: create returns the new id and
    // update returns nothing, so a shared `result` would type as the union
    // and lose the id exactly where it is needed.
    startTransition(async () => {
      if (household) {
        const result = await updateHousehold(household.id, fields);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setMessage(result.error);
          return;
        }
        setErrors({});
        setMessage("Saved");
        router.refresh();
        return;
      }

      const result = await createHousehold(fields);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      setErrors({});
      router.push(`/households/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Household name</span>
        <input
          name="display_name"
          defaultValue={household?.display_name ?? ""}
          placeholder="The Okonkwo family"
          required
          className="field"
        />
        <span className="mt-1 block text-xs text-muted">
          How you&rsquo;d address the envelope. This is the invite unit.
        </span>
        {errors["display_name"]?.[0] ? (
          <p className="mt-1 text-xs text-red-700">{errors["display_name"]![0]}</p>
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Address</span>
        <textarea name="address" defaultValue={household?.address ?? ""} rows={3} className="field" />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes</span>
        <textarea name="notes" defaultValue={household?.notes ?? ""} rows={2} className="field" />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : household ? "Save changes" : "Create household"}
        </button>
        {household ? (
          <button
            type="button"
            className="btn text-red-700"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeHousehold(household.id);
                if (result.ok) router.push("/guests");
                else setMessage(result.error);
              })
            }
          >
            Remove household
          </button>
        ) : null}
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>

      {!household ? (
        <p className="text-xs text-muted">
          New households join the bottom of the ranking, below the cut line. Nobody gets pushed off
          the list by someone you have only just thought of.
        </p>
      ) : null}
    </form>
  );
}
