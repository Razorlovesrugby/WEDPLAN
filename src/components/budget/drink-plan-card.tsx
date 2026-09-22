"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteDrinkPlan, updateDrinkPlan } from "@/server/actions/drinks";
import { INTENSITY_PRESETS, sharesSumToOne, shoppingList, type DrinkPlanInput } from "@/lib/drinks";
import { pluralise } from "@/lib/format";
import type { DrinkPlanView } from "@/lib/types/database";

/**
 * One drink plan: its inputs on the left, what to buy on the right
 * (`docs/planning-spreadsheet-gaps.md` §5, Pattern C).
 *
 * The shopping list is recomputed **while you type**, from the same
 * `src/lib/drinks.ts` the server would use, so changing the hours moves the
 * bottle counts before anything saves. The headcount is the one number that
 * does not move here: it comes from `v_drink_plans`, live from the guest
 * list, and the only way to change it is to change the guest list.
 */
export function DrinkPlanCard({
  plan,
  events,
}: {
  plan: DrinkPlanView;
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Local, so the list moves as the planner drags a share around; saved on
  // blur rather than on every keystroke.
  const [draft, setDraft] = useState<DrinkPlanInput & { manualHeadcount: number | null }>({
    hours: plan.hours,
    intensity: plan.intensity,
    champagneToast: plan.champagne_toast,
    beerShare: plan.beer_share,
    wineShare: plan.wine_share,
    spiritShare: plan.spirit_share,
    redShare: plan.red_share,
    whiteShare: plan.white_share,
    roseShare: plan.rose_share,
    manualHeadcount: plan.manual_headcount,
  });

  const headcount =
    plan.headcount_source === "manual" ? (draft.manualHeadcount ?? 0) : (plan.headcount ?? 0);

  const alcoholOk = sharesSumToOne(draft.beerShare, draft.wineShare, draft.spiritShare);
  const wineOk = sharesSumToOne(draft.redShare, draft.whiteShare, draft.roseShare);
  const lines = shoppingList(draft, headcount);

  function save(fields: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateDrinkPlan(plan.id, fields);
      if (!result.ok) setError(result.fieldErrors ? Object.values(result.fieldErrors)[0]![0]! : result.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      const result = await deleteDrinkPlan(plan.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const sourceLabel =
    plan.headcount_source === "confirmed"
      ? "confirmed by RSVP"
      : plan.headcount_source === "invited"
        ? "invited, above the cut"
        : "typed by hand";

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">
          {plan.label}
          {plan.event_name ? <span className="text-muted"> · {plan.event_name}</span> : null}
        </h2>
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="text-xs text-muted underline hover:text-red-700"
        >
          Delete
        </button>
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      {/* The headcount, stated before anything derived from it. This is the
          line that separates this screen from the spreadsheet it replaces. */}
      <p className="text-sm">
        Planning for <span className="font-medium tabular-nums">{pluralise(headcount, "adult")}</span>{" "}
        <span className="text-muted">({sourceLabel})</span>
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Field label="Hours">
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={draft.hours}
                onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) })}
                onBlur={() => save({ hours: draft.hours })}
                className="field w-20 tabular-nums"
              />
            </Field>

            <Field label="Intensity">
              <select
                value={draft.intensity}
                onChange={(e) => {
                  const intensity = Number(e.target.value);
                  setDraft({ ...draft, intensity });
                  save({ intensity });
                }}
                className="field w-auto"
              >
                {INTENSITY_PRESETS.map((p) => (
                  <option key={p.key} value={p.value}>
                    {p.label} ({p.value.toFixed(2)})
                  </option>
                ))}
                {/* A stored value that is none of the four presets still has
                    to be selectable, or opening the card would silently
                    change it to whichever option happened to match. */}
                {INTENSITY_PRESETS.every((p) => p.value !== draft.intensity) ? (
                  <option value={draft.intensity}>Custom ({draft.intensity})</option>
                ) : null}
              </select>
            </Field>

            <Field label="Event">
              <select
                value={plan.event_id ?? ""}
                onChange={(e) => save({ event_id: e.target.value || null })}
                className="field w-auto"
              >
                <option value="">Whole wedding</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-3">
            <Field label="Headcount from">
              <select
                value={plan.headcount_source}
                onChange={(e) => {
                  const next = e.target.value as DrinkPlanView["headcount_source"];
                  // The two fields move together: the database refuses a
                  // manual plan with no number, and a live plan carrying a
                  // stale one. Switching to manual seeds the box with the
                  // count currently on screen, which is the number the
                  // planner was just looking at.
                  const manualHeadcount = next === "manual" ? (draft.manualHeadcount ?? headcount) : null;
                  setDraft({ ...draft, manualHeadcount });
                  save({ headcount_source: next, manual_headcount: manualHeadcount });
                }}
                className="field w-auto"
              >
                <option value="confirmed">RSVPs confirmed</option>
                <option value="invited">Everyone invited</option>
                <option value="manual">A number I type</option>
              </select>
            </Field>

            {plan.headcount_source === "manual" ? (
              <Field label="Headcount">
                <input
                  type="number"
                  min={0}
                  value={draft.manualHeadcount ?? 0}
                  onChange={(e) => setDraft({ ...draft, manualHeadcount: Number(e.target.value) })}
                  onBlur={() => save({ manual_headcount: draft.manualHeadcount })}
                  className="field w-24 tabular-nums"
                />
              </Field>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.champagneToast}
              onChange={(e) => {
                setDraft({ ...draft, champagneToast: e.target.checked });
                save({ champagne_toast: e.target.checked });
              }}
            />
            Champagne toast — one glass a head, taken off the bar total
          </label>

          <Shares
            legend="Beer / wine / spirits"
            ok={alcoholOk}
            values={[draft.beerShare, draft.wineShare, draft.spiritShare]}
            labels={["Beer", "Wine", "Spirits"]}
            onChange={([beerShare, wineShare, spiritShare]) =>
              setDraft({ ...draft, beerShare, wineShare, spiritShare })
            }
            onCommit={([beer_share, wine_share, spirit_share]) =>
              save({ beer_share, wine_share, spirit_share })
            }
          />

          <Shares
            legend="Red / white / rosé"
            ok={wineOk}
            values={[draft.redShare, draft.whiteShare, draft.roseShare]}
            labels={["Red", "White", "Rosé"]}
            onChange={([redShare, whiteShare, roseShare]) =>
              setDraft({ ...draft, redShare, whiteShare, roseShare })
            }
            onCommit={([red_share, white_share, rose_share]) =>
              save({ red_share, white_share, rose_share })
            }
          />

          {plan.budget_item_id ? (
            <p className="text-xs text-muted">
              Costed on{" "}
              <Link href={`/budget?item=${plan.budget_item_id}`} className="underline">
                {plan.budget_item_label ?? "its budget line"}
              </Link>
              . This plan says what to buy; the budget says what it costs.
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Shopping list</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {lines.map((line) => (
                <tr key={line.key}>
                  <td className="py-1 pr-2">{line.label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {line.containers}
                    <span className="text-muted">
                      {" "}
                      × {line.container}
                      {line.containers === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="py-1 text-right text-xs tabular-nums text-muted">
                    {line.servings === null ? "" : `${line.servings} served`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!alcoholOk || !wineOk ? (
            <p className="mt-2 text-xs text-red-700">
              The list above is computed from shares that do not add up to 100%, and will not save
              until they do.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

/**
 * A trio of shares that has to add to 100%. Entered as whole percentages
 * because "25" is what a person says, and stored as the 0–1 fraction the
 * column holds.
 */
function Shares({
  legend,
  labels,
  values,
  ok,
  onChange,
  onCommit,
}: {
  legend: string;
  labels: [string, string, string] | string[];
  values: number[];
  ok: boolean;
  onChange: (next: [number, number, number]) => void;
  onCommit: (next: [number, number, number]) => void;
}) {
  const total = Math.round(values.reduce((sum, v) => sum + v, 0) * 100);

  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium uppercase tracking-wide text-muted">{legend}</legend>
      <div className="flex flex-wrap items-end gap-2">
        {values.map((value, i) => (
          <label key={labels[i]} className="flex flex-col gap-1 text-xs text-muted">
            {labels[i]}
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(value * 100)}
                onChange={(e) => {
                  const next = [...values] as [number, number, number];
                  // Rounded to a whole percent so the box shows exactly what
                  // it will save — the display below rounds, and a typed
                  // 25.5 would otherwise render as 26 and store 0.255.
                  next[i] = Math.round(Number(e.target.value)) / 100;
                  onChange(next);
                }}
                onBlur={() => {
                  if (ok) onCommit(values as [number, number, number]);
                }}
                className="field w-16 tabular-nums"
              />
              <span aria-hidden>%</span>
            </span>
          </label>
        ))}
        <span className={`pb-2 text-xs tabular-nums ${ok ? "text-muted" : "text-red-700"}`}>
          = {total}%
        </span>
      </div>
    </fieldset>
  );
}
