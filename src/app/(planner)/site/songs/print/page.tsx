import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { getPlannerSongs } from "@/server/queries/site-extras";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import { doNotPlayFrom } from "@/lib/site/song-match";

export const metadata = { title: "Songs for the DJ" };

/**
 * The page you hand the DJ (spec 31 §7): the chart in rank order, the
 * couple's picks marked, and the do-not-play list at the bottom where it
 * cannot be missed. Listed songs only — a hidden one is hidden from the DJ
 * too. The do-not-play list is read from the draft block, because this is the
 * couple's own copy and the latest thing they wrote is the one they mean.
 */
export default async function SongsPrintPage() {
  const wedding = await requireWedding();
  const [rows, blocks] = await Promise.all([getPlannerSongs(wedding.id), listDraftBlocks(wedding.id)]);
  const listed = rows.filter((row) => row.status === "approved" || row.status === "played");
  const bans = doNotPlayFrom(blocks.find((block) => block.type === "song_requests")?.payload);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-serif text-2xl">Songs for the DJ</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The chart as your guests ranked it, your picks marked, and the do-not-play list at the bottom.
          </p>
        </div>
        <Link href="/site/songs" className="btn">
          Back to song requests
        </Link>
      </div>

      <div className="print-sheet">
        <h2 className="mb-4 font-serif text-xl">
          {wedding.name}
          {wedding.wedding_date ? ` · ${wedding.wedding_date}` : ""}
        </h2>
        {listed.length === 0 ? (
          <p className="text-sm text-muted">No songs on the list yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Song</th>
                <th className="py-2 pr-3 font-medium">Artist</th>
                <th className="py-2 pr-3 font-medium">Votes</th>
                <th className="py-2 font-medium">Asked for by</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((row, index) => (
                <tr key={row.id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-3 tabular-nums">{index + 1}</td>
                  <td className="py-1.5 pr-3">
                    {row.title}
                    {row.couplesPick ? " ♥" : ""}
                  </td>
                  <td className="py-1.5 pr-3">{row.artist ?? ""}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.votes}</td>
                  <td className="py-1.5">{row.askedBy ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {listed.some((row) => row.couplesPick) ? <p className="mt-2 text-xs text-muted">♥ the couple&rsquo;s pick</p> : null}

        {bans.length > 0 ? (
          <div className="mt-8">
            <h3 className="font-serif text-lg">Do not play</h3>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {bans.map((ban) => (
                <li key={ban.line}>{ban.line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
