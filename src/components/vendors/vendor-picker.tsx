"use client";

import { useMemo, useState, useTransition } from "react";
import { searchVendors } from "@/lib/vendor-search";
import { STAGE_LABEL, type VendorLike } from "@/lib/vendors";

/**
 * Type-to-filter over the wedding's vendors, with a plain-text escape hatch
 * (spec 8 §5).
 *
 * `HouseholdPicker` with the nouns changed, and one addition it does not
 * need: **a budget line may legitimately have no vendor record.** "$150 —
 * cake stand hire, from the village hall's cupboard" does not deserve one, so
 * typing a name and choosing "use as plain text" has to stay as easy as it
 * was before vendors existed. Anything else would turn a text field people
 * already use into a form that nags.
 */
export function VendorPicker({
  vendors,
  valueId,
  valueName,
  onPick,
  onPlainText,
  onCreate,
}: {
  vendors: VendorLike[];
  valueId: string | null;
  valueName: string;
  onPick: (vendor: VendorLike) => void;
  onPlainText: (name: string) => void;
  onCreate?: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState(valueName);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const options = useMemo(
    () => searchVendors(vendors.filter((v) => !v.archived_at), query).slice(0, 8),
    [vendors, query],
  );

  const picked = valueId ? vendors.find((v) => v.id === valueId) : null;
  const typed = query.trim();
  const exactExists = vendors.some(
    (v) => v.name.trim().toLowerCase() === typed.toLowerCase(),
  );

  return (
    <div className="relative">
      <input
        className="field"
        value={query}
        placeholder="Who is this with?"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          // Typing detaches from the linked vendor immediately: leaving the
          // link in place while the text says something else is how a line
          // ends up reading one name and pointing at another.
          onPlainText(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />

      {picked ? (
        <p className="mt-1 text-xs text-muted">
          Linked to {picked.name}
          {picked.category_name ? ` · ${picked.category_name}` : ""} ·{" "}
          {STAGE_LABEL[picked.stage]}
        </p>
      ) : typed ? (
        <p className="mt-1 text-xs text-muted">Plain text — not linked to a vendor record.</p>
      ) : null}

      {open && (options.length > 0 || (typed && !exactExists && onCreate)) ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-line bg-white shadow-sm">
          {options.map((vendor) => (
            <li key={vendor.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setQuery(vendor.name);
                  setOpen(false);
                  onPick(vendor);
                }}
              >
                <span className="block">{vendor.name}</span>
                <span className="block text-xs text-muted">
                  {vendor.category_name ?? "Uncategorised"} · {STAGE_LABEL[vendor.stage]}
                </span>
              </button>
            </li>
          ))}

          {typed && !exactExists && onCreate ? (
            <li className="border-t border-line">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-accent hover:bg-paper disabled:opacity-40"
                disabled={pending}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  startTransition(async () => {
                    await onCreate(typed);
                    setOpen(false);
                  })
                }
              >
                + Create &ldquo;{typed}&rdquo; as a vendor
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
