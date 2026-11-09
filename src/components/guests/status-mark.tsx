import type { InviteState } from "@/lib/invites";
import { STATE_DESCRIPTION, type HouseholdEventSummary } from "@/lib/guest-table";

/**
 * The guest table's status symbols (spec 47 §4.2).
 *
 * Every state has its own shape as well as its own colour (✓ ? ✕, a filled
 * dot, an empty ring, a dash), so the grid still reads in greyscale or for a
 * colour-blind planner. The words live in the surrounding control's label;
 * the mark itself is decoration to a screen reader.
 */

const BASE =
  "relative inline-flex h-6 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none tabular-nums";

const STYLE: Record<InviteState, string> = {
  yes: "bg-green-50 text-green-800 ring-1 ring-inset ring-green-200",
  maybe: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  no: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200",
  sent: "text-muted",
  invited: "text-muted",
  not_invited: "text-muted/40 font-normal",
};

function Glyph({ state }: { state: InviteState }) {
  switch (state) {
    case "yes":
      return <>✓</>;
    case "maybe":
      return <>?</>;
    case "no":
      return <>✕</>;
    case "sent":
      return <span className="block h-2.5 w-2.5 rounded-full bg-current" />;
    case "invited":
      return <span className="block h-2.5 w-2.5 rounded-full border-[1.5px] border-current" />;
    case "not_invited":
      return <>–</>;
  }
}

export function StatusMark({ state, overridden = false }: { state: InviteState; overridden?: boolean }) {
  return (
    <span aria-hidden className={`${BASE} ${STYLE[state]}`}>
      <Glyph state={state} />
      {overridden ? (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
      ) : null}
    </span>
  );
}

/** The household row's cell: one shared state, or "2/3" for a split household. */
export function HouseholdMark({ summary, eventName }: { summary: HouseholdEventSummary; eventName: string }) {
  const words =
    summary.kind === "same"
      ? `${eventName}: ${STATE_DESCRIPTION[summary.state]}`
      : `${eventName}: ${summary.yes} of ${summary.invited} coming (${summary.detail})`;
  return (
    <span role="img" aria-label={words} title={words} className="inline-flex">
      {summary.kind === "same" ? (
        <StatusMark state={summary.state} />
      ) : (
        <span aria-hidden className={`${BASE} border border-dashed border-muted/50 font-medium text-ink`}>
          {summary.yes}/{summary.invited}
        </span>
      )}
    </span>
  );
}

const LEGEND: InviteState[] = ["yes", "maybe", "no", "sent", "invited", "not_invited"];

/** The key under the table. */
export function StatusLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="What the symbols mean">
      {LEGEND.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <StatusMark state={state} />
          {STATE_DESCRIPTION[state]}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className={`${BASE} border border-dashed border-muted/50 font-medium text-ink`}>
          2/3
        </span>
        Household split: 2 of the 3 invited coming
      </li>
      <li className="inline-flex items-center gap-1.5">
        <StatusMark state="yes" overridden />
        Set for this person, not their household
      </li>
    </ul>
  );
}
