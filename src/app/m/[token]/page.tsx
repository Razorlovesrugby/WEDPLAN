import type { Metadata } from "next";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { resolveShare } from "@/server/moodboards/resolve";

/**
 * A shared moodboard. No nav, no login prompt, no app chrome — a page, not
 * the app.
 *
 * noindex, always. The same call /w already makes, and more load-bearing
 * here: these are other people's photographs, collected privately. There is
 * also no index page, no /m root and nothing to enumerate.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedMoodboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShare(token);

  // Malformed, unknown, revoked and expired all render this. Distinguishing
  // them would confirm what exists — docs/HANDOFF.md section 7.
  if (!resolved.ok) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">This link isn&rsquo;t active</h1>
        <p className="mt-2 text-sm text-muted">
          It may have been turned off, or it may have expired. Ask whoever sent it for a new one.
        </p>
      </main>
    );
  }

  const { board } = resolved;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-3xl">{board.board.title}</h1>
        {board.board.description ? (
          <p className="mx-auto mt-2 max-w-xl whitespace-pre-line text-sm text-muted">
            {board.board.description}
          </p>
        ) : null}
      </header>

      {board.items.length === 0 ? (
        <p className="text-center text-sm text-muted">Nothing on this board yet.</p>
      ) : (
        <PublicBoardView board={board} />
      )}
    </main>
  );
}
