import { WeddingBasicsForm } from "@/components/settings/wedding-basics-form";
import { CutLinePicker } from "@/components/settings/cut-line-picker";
import { ListAppearanceEditor } from "@/components/settings/list-appearance-editor";
import { CapacityControl } from "@/components/rank/capacity-control";
import { listHouseholds } from "@/server/queries/guests";
import { getLists } from "@/server/queries/lists";
import { getCutLines, getWeddingStats, requireWedding } from "@/server/queries/wedding";
import { ranksNeedRebalance } from "@/server/actions/rank";
import { ClipTokensCard } from "@/components/moodboards/clip-tokens-card";
import { PinterestCard } from "@/components/moodboards/pinterest-card";
import { getPinterestAccount, listClipTokens, listMoodboards } from "@/server/queries/moodboards";
import { pinterestConfig } from "@/server/pinterest/client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const wedding = await requireWedding();
  const [households, stats, rebalanceOffered, lists, cutLines, clipTokens, pinterest, boards] =
    await Promise.all([
      listHouseholds(wedding.id),
      getWeddingStats(wedding.id),
      ranksNeedRebalance(),
      getLists(wedding.id),
      getCutLines(wedding.id),
      listClipTokens(wedding.id),
      getPinterestAccount(wedding.id),
      listMoodboards(wedding.id),
    ]);

  const timeZones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl">Settings</h1>

      <section aria-labelledby="basics" className="card space-y-4 p-4">
        <h2 id="basics" className="text-sm font-medium uppercase tracking-wide text-muted">
          Wedding basics
        </h2>
        <WeddingBasicsForm wedding={wedding} timeZones={timeZones} />
      </section>

      <section aria-labelledby="cut-lines" className="card space-y-4 p-4">
        <h2 id="cut-lines" className="text-sm font-medium uppercase tracking-wide text-muted">
          Cut lines &amp; capacity
        </h2>
        <CapacityControl
          capacity={wedding.capacity}
          aboveCutSeats={stats?.above_cut_seats ?? 0}
          rebalanceOffered={rebalanceOffered}
        />
        {households.length === 0 ? (
          <p className="text-sm text-muted">No households yet — nothing to set a cut line on.</p>
        ) : (
          <CutLinePicker households={households} cutLines={cutLines} />
        )}
      </section>

      <section aria-labelledby="list-appearance" className="card space-y-4 p-4">
        <h2 id="list-appearance" className="text-sm font-medium uppercase tracking-wide text-muted">
          List appearance
        </h2>
        <ListAppearanceEditor lists={lists} />
      </section>

      <PinterestCard account={pinterest} configured={pinterestConfig() !== null} />

      <ClipTokensCard
        tokens={clipTokens}
        boards={boards.map((board) => ({ id: board.id, title: board.title }))}
      />
    </div>
  );
}
