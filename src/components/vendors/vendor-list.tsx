"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  committedWithoutBudget,
  matchesVendorFilter,
  readVendorFilter,
  sortVendors,
  STAGE_LABEL,
  VENDOR_STAGES,
} from "@/lib/vendors";
import { createVendor, createVendorFromBudgetLines } from "@/server/actions/vendors";
import { formatMoney, formatRelative } from "@/lib/format";
import type { UnlinkedVendorName } from "@/server/queries/vendors";
import type { VendorCategoryRow, VendorView } from "@/lib/types/database";

/**
 * The vendor list (spec 8 §5).
 *
 * Grouped by category with uncategorised last, filtered from the URL, and
 * carrying two things the planner cannot get anywhere else: the vendors they
 * have committed to with no money set aside, and the budget lines with a
 * typed vendor name and no record behind it.
 */
export function VendorList({
  vendors,
  categories,
  unlinked,
  params,
}: {
  vendors: VendorView[];
  categories: VendorCategoryRow[];
  unlinked: UnlinkedVendorName[];
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const filter = readVendorFilter(params);
  const shown = useMemo(
    () => sortVendors(vendors.filter((vendor) => matchesVendorFilter(vendor, filter))),
    [vendors, filter],
  );
  const unbudgeted = useMemo(() => committedWithoutBudget(vendors), [vendors]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/vendors?${next.toString()}`);
  }

  function act(run: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await run();
      setMessage(result.ok ? (done ?? null) : (result.error ?? "That didn't work"));
      if (result.ok) router.refresh();
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, VendorView[]>();
    for (const vendor of shown) {
      const key = vendor.category_name ?? "Uncategorised";
      const list = map.get(key);
      if (list) list.push(vendor);
      else map.set(key, [vendor]);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <div className="space-y-5">
      {/* ---- the backfill panel (§4) ---- */}
      {unlinked.length > 0 && !dismissed && !filter.archived ? (
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Names on budget lines with no vendor record</h2>
            <button
              type="button"
              className="text-xs text-muted hover:underline"
              onClick={() => setDismissed(true)}
            >
              Not now
            </button>
          </div>
          <p className="text-sm text-muted">
            One button each: creates the vendor and links every line carrying that exact name.
            Nothing is matched automatically — &ldquo;The Old Barn&rdquo; and &ldquo;Old
            Barn&rdquo; are as likely to be two suppliers as one.
          </p>
          <ul className="space-y-2">
            {unlinked.map((row) => (
              <li key={row.name} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="flex-1">
                  {row.name}
                  <span className="ml-2 text-xs text-muted">
                    {row.lineCount} {row.lineCount === 1 ? "line" : "lines"}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      const result = await createVendorFromBudgetLines(row.name, null);
                      return result.ok
                        ? { ok: true as const }
                        : { ok: false as const, error: result.error };
                    }, `Created ${row.name} and linked its lines`)
                  }
                >
                  Create and link
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- committed with no budget ---- */}
      {unbudgeted.length > 0 && !filter.archived ? (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm">
          <span className="font-medium">
            {unbudgeted.length === 1 ? "One vendor is" : `${unbudgeted.length} vendors are`} booked
            with nothing set aside:
          </span>{" "}
          {unbudgeted.map((vendor, index) => (
            <span key={vendor.id}>
              {index > 0 ? ", " : ""}
              <Link href={`/vendors/${vendor.id}`} className="underline">
                {vendor.name}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}

      {/* ---- filters ---- */}
      <div className="flex flex-wrap items-end gap-2">
        <input
          className="field w-48"
          defaultValue={filter.q ?? ""}
          placeholder="Search"
          aria-label="Search vendors"
          onChange={(event) => setParam("q", event.target.value || null)}
        />
        <select
          className="field w-auto"
          value={filter.stage ?? ""}
          aria-label="Stage"
          onChange={(event) => setParam("stage", event.target.value || null)}
        >
          <option value="">Any stage</option>
          {VENDOR_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </select>
        <select
          className="field w-auto"
          value={filter.category ?? ""}
          aria-label="Category"
          onChange={(event) => setParam("category", event.target.value || null)}
        >
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`btn ${filter.archived ? "border-accent" : ""}`}
          onClick={() => setParam("archived", filter.archived ? null : "1")}
        >
          {filter.archived ? "Showing archived" : "Archived"}
        </button>
      </div>

      {/* ---- add ---- */}
      {!filter.archived ? (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <label className="flex-1 text-sm">
            <span className="block font-medium">Add a vendor</span>
            <input
              className="field mt-1"
              value={name}
              placeholder="Bloom & Co"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || name.trim() === ""}
            onClick={() =>
              act(async () => {
                const result = await createVendor({ name });
                if (result.ok) setName("");
                return result.ok
                  ? { ok: true as const }
                  : { ok: false as const, error: result.error };
              }, "Added")
            }
          >
            Add
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-muted">{message}</p> : null}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {filter.archived ? "Nothing archived." : "No vendors match."}
        </p>
      ) : (
        groups.map(([category, rows]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs uppercase tracking-wide text-muted">{category}</h2>
            <ul className="card divide-y divide-line">
              {rows.map((vendor) => (
                <li key={vendor.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
                  <Link href={`/vendors/${vendor.id}`} className="font-medium hover:underline">
                    {vendor.name}
                  </Link>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {STAGE_LABEL[vendor.stage]}
                  </span>

                  {vendor.primary_contact_name ? (
                    <span className="text-sm text-muted">
                      {vendor.primary_contact_name}
                      {vendor.primary_contact_email ? (
                        <>
                          {" · "}
                          <a
                            className="underline"
                            href={`mailto:${vendor.primary_contact_email}`}
                          >
                            {vendor.primary_contact_email}
                          </a>
                        </>
                      ) : null}
                      {vendor.primary_contact_phone ? (
                        <>
                          {" · "}
                          <a className="underline" href={`tel:${vendor.primary_contact_phone}`}>
                            {vendor.primary_contact_phone}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ) : null}

                  <span className="ml-auto text-sm tabular-nums">
                    {vendor.budget_line_count > 0 ? (
                      <>
                        {formatMoney(vendor.committed)}
                        <span className="text-muted"> · {formatMoney(vendor.paid)} paid</span>
                      </>
                    ) : (
                      <span className="text-muted">No budget line</span>
                    )}
                  </span>

                  {vendor.next_payment_due ? (
                    <span className="text-xs text-muted">
                      next {formatRelative(vendor.next_payment_due)}
                    </span>
                  ) : null}
                  {vendor.note_count > 0 ? (
                    <span className="text-xs text-muted">
                      {vendor.note_count} {vendor.note_count === 1 ? "note" : "notes"}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
