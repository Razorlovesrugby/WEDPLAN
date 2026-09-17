import Link from "next/link";
import { CapacityControl } from "@/components/rank/capacity-control";
import { RankList } from "@/components/rank/rank-list";
import { CutLinePicker } from "@/components/settings/cut-line-picker";
import { SubTabs } from "@/components/sub-tabs";
import { GUESTS_TABS } from "@/lib/nav-tabs";
import { listHouseholds } from "@/server/queries/guests";
import { getCutLines, getWeddingStats, requireWedding } from "@/server/queries/wedding";
import { getPerSeatCostInvited } from "@/server/queries/budget";
import { ranksNeedRebalance } from "@/server/actions/rank";
import { formatMoney, pluralise } from "@/lib/format";

export const metadata = { title: "Ranking" };

export default async function RankPage() {
  const wedding = await requireWedding();
  const [households, stats, rebalanceOffered, perSeatCost, cutLines] = await Promise.all([
    listHouseholds(wedding.id),
    getWeddingStats(wedding.id),
    ranksNeedRebalance(),
    getPerSeatCostInvited(wedding.id),
    getCutLines(wedding.id),
  ]);

  const aboveCutSeats = stats?.above_cut_seats ?? 0;

  /**
   * Waitlist suggestions.
   *
   * When a decline lands, the question is never "who is next" — it is "who is
   * next that actually fits". A household of four cannot take two returned
   * seats, so the first household below the line is often the wrong answer.
   */
  const spare = wedding.capacity === null ? 0 : wedding.capacity - aboveCutSeats;
  const suggestions =
    spare > 0
      ? households
          .filter((h) => h.tier_position !== 0 && h.seat_count <= spare)
          .slice(0, 5)
      : [];

  return (
    <div className="space-y-5">
      <SubTabs tabs={GUESTS_TABS} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Ranking</h1>
        <span className="text-sm text-muted">
          {pluralise(households.length, "household")} · {aboveCutSeats} seats above the cut
        </span>
      </div>

      <p className="max-w-2xl text-sm text-muted">
        Put everyone you could conceivably invite in the list, then drag until the order feels
        right. Set the cut at capacity and everything below it becomes the waitlist — no separate
        list to maintain, and no decision to make twice.
      </p>

      <CapacityControl
        capacity={wedding.capacity}
        aboveCutSeats={aboveCutSeats}
        rebalanceOffered={rebalanceOffered}
      />

      {perSeatCost !== null ? (
        <p className="text-sm text-muted">
          Each seat above the line currently costs about{" "}
          <Link href="/budget" className="font-medium text-ink hover:underline">
            {formatMoney(perSeatCost, wedding.base_currency)}
          </Link>{" "}
          — from every per-unit and consumption budget line, on invited counts.
        </p>
      ) : null}

      {households.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          No households yet.{" "}
          <Link href="/households/new" className="underline">
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <>
          <CutLinePicker households={households} cutLines={cutLines} />
          <RankList households={households} capacity={wedding.capacity} cutLines={cutLines} />
        </>
      )}

      {suggestions.length > 0 ? (
        <section className="card p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Would fit in the {pluralise(spare, "spare seat")}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Next off the waitlist, filtered to households small enough to actually fit.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {suggestions.map((household) => (
              <li key={household.id} className="flex items-baseline justify-between gap-3">
                <Link href={`/households/${household.id}`} className="hover:underline">
                  {household.display_name}
                </Link>
                <span className="text-xs text-muted">
                  tier {household.tier} · {pluralise(household.seat_count, "seat")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
