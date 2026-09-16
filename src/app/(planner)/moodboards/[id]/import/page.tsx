import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/moodboards/import-wizard";
import { getMoodboard, getPinterestAccount, listImportedPinIds, listShares } from "@/server/queries/moodboards";
import { requireWedding } from "@/server/queries/wedding";
import { shareIsLive } from "@/lib/moodboards";

export const metadata = { title: "Import from Pinterest" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  const board = await getMoodboard(wedding.id, id);
  if (!board) notFound();

  const [account, imported, shares] = await Promise.all([
    getPinterestAccount(wedding.id),
    listImportedPinIds(wedding.id, id),
    listShares(wedding.id, id),
  ]);

  const published = shares.some(
    (share) => share.channel !== "link" && shareIsLive(share),
  );

  return (
    <div className="space-y-6">
      <Link href={`/moodboards/${id}`} className="text-sm text-muted underline">
        ← {board.title}
      </Link>

      <header>
        <h1 className="font-serif text-3xl">Import from Pinterest</h1>
        <p className="text-sm text-muted">Into “{board.title}”. Pins already here are ticked and skipped.</p>
      </header>

      {/* Rehosting somebody else's photographs privately and publishing them
          are different acts. Warn, rather than quietly doing the second. */}
      {published ? (
        <p className="card border-amber-300 bg-amber-50 p-3 text-sm">
          This board is published publicly. Anything you import lands on that page too.
        </p>
      ) : null}

      {account ? (
        <ImportWizard moodboardId={id} alreadyImported={[...imported]} />
      ) : (
        <p className="card p-6 text-sm">
          No Pinterest account is connected yet.{" "}
          <Link href="/settings" className="underline">
            Connect one in Settings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
