import Link from "next/link";
import { NewBoardForm } from "@/components/moodboards/new-board-form";
import { listArchivedMoodboards, listMoodboards } from "@/server/queries/moodboards";
import { signPaths } from "@/lib/supabase/storage";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import { MoreMenu } from "@/components/shell/more-menu";
import { PinterestCard } from "@/components/moodboards/pinterest-card";
import { ClipTokensCard } from "@/components/moodboards/clip-tokens-card";
import { getPinterestAccount, listClipTokens } from "@/server/queries/moodboards";
import { pinterestConfig } from "@/server/pinterest/client";
import { restoreMoodboard } from "@/server/actions/moodboards";

export const metadata = { title: "Moodboards" };

export default async function MoodboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; panel?: string }>;
}) {
  const { archived, panel } = await searchParams;
  const showArchived = archived === "1";
  const wedding = await requireWedding();

  const { ready, boards } = await listMoodboards(wedding.id);
  const archivedBoards = showArchived ? await listArchivedMoodboards(wedding.id) : [];

  // Pinterest and the clipper moved here from Settings (spec 41 §4.4). Couple
  // only, as before: a planner has no access to either's credentials (0044).
  const isCouple = (await getViewerKind()) !== "planner";
  const showImport = isCouple && panel === "import";
  const [clipTokens, pinterest] = showImport
    ? await Promise.all([listClipTokens(wedding.id), getPinterestAccount(wedding.id)])
    : [[], null];

  // A text list of moodboards is a contradiction, so the list is covers —
  // which means signing every cover thumbnail in one batch.
  const covers = await signPaths(
    boards.flatMap((board) => (board.cover_thumb_path ? [board.cover_thumb_path] : [])),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Moodboards</h1>
          <p className="text-sm text-muted">
            The vibe, in pictures — one board per audience, each shareable with a link that needs no
            account.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/moodboards/help" className="text-sm text-muted underline">
            How this works
          </Link>
          <NewBoardForm />
          <MoreMenu
            label="More for Moodboards"
            items={isCouple ? [{ href: "/moodboards?panel=import", label: "Pinterest & clipper" }] : []}
          />
        </div>
      </header>

      {showImport ? (
        <section id="import" aria-labelledby="import-title" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="import-title" className="text-sm font-medium uppercase tracking-wide text-muted">
              Pinterest &amp; clipper
            </h2>
            <Link href="/moodboards" className="btn">
              Done
            </Link>
          </div>
          <PinterestCard account={pinterest} configured={pinterestConfig() !== null} />
          <ClipTokensCard tokens={clipTokens} boards={boards.map((board) => ({ id: board.id, title: board.title }))} />
        </section>
      ) : null}

      {!ready ? (
        <div className="card space-y-2 p-8 text-center text-sm">
          <p className="font-medium">Moodboards aren&rsquo;t set up on this database yet.</p>
          <p className="text-muted">
            Migrations <code>0013_moodboards</code> and <code>0014_moodboard_clipper</code> haven&rsquo;t
            been applied here. Run <code>supabase db push</code>, then{" "}
            <code>node scripts/ensure-bucket.mjs</code> for the image bucket.
          </p>
          <p className="text-muted">
            <a href="/api/health" className="underline">
              Check what else is missing
            </a>
          </p>
        </div>
      ) : boards.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          No boards yet. Start one for the photographer, or one for what guests should wear.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => {
            const cover = board.cover_thumb_path ? covers.get(board.cover_thumb_path) : null;
            return (
              <li key={board.id} className="card overflow-hidden">
                <Link href={`/moodboards/${board.id}`} className="block">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-line/30 text-sm text-muted">
                      No images yet
                    </div>
                  )}
                  <div className="space-y-1 p-3">
                    <p className="font-medium">{board.title}</p>
                    <p className="text-sm text-muted">
                      {board.item_count} image{board.item_count === 1 ? "" : "s"}
                      {board.event_name ? ` · ${board.event_name}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {[
                        board.link_share_count > 0
                          ? `${board.link_share_count} link${board.link_share_count === 1 ? "" : "s"}`
                          : null,
                        board.published_to_site ? "on the site" : null,
                        board.published_to_rsvp ? "on the RSVP page" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not shared"}
                      {board.last_viewed_at
                        ? ` · last opened ${new Date(board.last_viewed_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="border-t border-line pt-4 text-sm">
        <Link href={showArchived ? "/moodboards" : "/moodboards?archived=1"} className="text-muted underline">
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </footer>

      {showArchived && archivedBoards.length > 0 ? (
        <ul className="space-y-2">
          {archivedBoards.map((board) => (
            <li key={board.id} className="card flex items-center justify-between p-3 text-sm">
              <span>{board.title}</span>
              <form
                action={async () => {
                  "use server";
                  await restoreMoodboard(board.id);
                }}
              >
                <button type="submit" className="btn">
                  Restore
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
