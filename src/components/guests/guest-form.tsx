"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGuest, removeGuest, updateGuest } from "@/server/actions/guests";
import type { GuestRow } from "@/lib/types/database";

type Fields = Record<string, string>;

const AGE_BANDS = [
  { value: "adult", label: "Adult" },
  { value: "child", label: "Child — needs a seat and a child's meal" },
  { value: "infant", label: "Infant — no seat, may need a high chair" },
] as const;

const SIDES = [
  { value: "", label: "Not set" },
  { value: "partner_a", label: "Partner A" },
  { value: "partner_b", label: "Partner B" },
  { value: "both", label: "Both" },
  { value: "other", label: "Other" },
] as const;

export function GuestForm({
  guest,
  householdId,
}: {
  guest?: GuestRow;
  householdId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields: Fields = {};
    for (const [key, value] of form.entries()) fields[key] = String(value);

    startTransition(async () => {
      const result = guest
        ? await updateGuest(guest.id, fields)
        : await createGuest(householdId, fields);

      if (result.ok) {
        setErrors({});
        setMessage("Saved");
        if (!guest) router.push(`/households/${householdId}`);
        else router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    });
  }

  function onDelete() {
    if (!guest) return;
    startTransition(async () => {
      const result = await removeGuest(guest.id);
      if (result.ok) router.push(`/households/${householdId}`);
      else setMessage(result.error);
    });
  }

  const fieldError = (name: string) =>
    errors[name]?.[0] ? <p className="mt-1 text-xs text-red-700">{errors[name]![0]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">First name</span>
          <input name="first_name" defaultValue={guest?.first_name ?? ""} required className="field" />
          {fieldError("first_name")}
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Last name</span>
          <input name="last_name" defaultValue={guest?.last_name ?? ""} className="field" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Goes by</span>
          <input
            name="preferred_name"
            defaultValue={guest?.preferred_name ?? ""}
            placeholder="Used on place cards"
            className="field"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Age band</span>
          <select name="age_band" defaultValue={guest?.age_band ?? "adult"} className="field">
            {AGE_BANDS.map((band) => (
              <option key={band.value} value={band.value}>
                {band.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input type="email" name="email" defaultValue={guest?.email ?? ""} className="field" />
          {fieldError("email")}
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Phone</span>
          <input name="phone" defaultValue={guest?.phone ?? ""} className="field" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Side</span>
          <select name="side" defaultValue={guest?.side ?? ""} className="field">
            {SIDES.map((side) => (
              <option key={side.value} value={side.value}>
                {side.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Dietary requirements</span>
        <input
          name="dietary"
          defaultValue={guest?.dietary ?? ""}
          placeholder="Vegetarian, coeliac, no nuts…"
          className="field"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Accessibility</span>
        <input
          name="accessibility"
          defaultValue={guest?.accessibility ?? ""}
          placeholder="Step-free access, hearing loop, seated near an exit…"
          className="field"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes</span>
        <textarea name="notes" defaultValue={guest?.notes ?? ""} rows={3} className="field" />
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : guest ? "Save changes" : "Add guest"}
        </button>
        {guest ? (
          <button type="button" className="btn text-red-700" disabled={pending} onClick={onDelete}>
            Remove from list
          </button>
        ) : null}
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>
    </form>
  );
}
