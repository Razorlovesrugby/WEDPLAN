import type { Metadata } from "next";
import Link from "next/link";
import { RsvpForm } from "@/components/rsvp/rsvp-form";
import { PublicBoardView } from "@/components/moodboards/public-board";
import { listPublishedBoards } from "@/server/moodboards/resolve";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RSVP",
  // A guest list is not for search engines, whatever the token.
  robots: { index: false, follow: false, nocache: true },
};

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveInvitation(token);

  if (!resolved.ok) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="font-serif text-2xl">
          {resolved.reason === "throttled" ? "Too many attempts" : "We can't find that invitation"}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {resolved.reason === "throttled"
            ? "Give it a few minutes and try the link again."
            : /* Deliberately the same message whether the token is malformed or
                 simply unknown: distinguishing them would confirm which tokens
                 exist. */
              "The link may have been mistyped, or replaced with a newer one. Check the most recent message from the couple, or ask them to resend it."}
        </p>
      </main>
    );
  }

  const { context } = resolved;
  const { wedding, household, guests, events, questions, rsvps, answers, locked } = context;

  // The household's own token has already done the authenticating, so a board
  // published to this channel needs no credential of its own.
  const boards = await listPublishedBoards(wedding.id, "rsvp");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-muted">{household.display_name}</p>
        <h1 className="mt-1 font-serif text-3xl">{wedding.name}</h1>
        {wedding.wedding_date ? (
          <p className="mt-1 text-muted">{formatDate(wedding.wedding_date, wedding.timezone)}</p>
        ) : null}
      </header>

      {events.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            You&rsquo;re invited to
          </h2>
          <ul className="space-y-1 text-sm">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.name}</strong>
                {event.starts_at ? ` · ${formatDateTime(event.starts_at, wedding.timezone)}` : null}
                {event.venue ? ` · ${event.venue}` : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!locked && wedding.rsvp_lock_at ? (
        <p className="mb-6 text-sm text-muted">
          Please reply by {formatDate(wedding.rsvp_lock_at, wedding.timezone)}. You can change your
          answers until then.
        </p>
      ) : null}

      <RsvpForm
        token={token}
        guests={guests}
        events={events}
        questions={questions}
        rsvps={rsvps}
        answers={answers}
        locked={locked}
      />

      {/* Moodboards published to the RSVP channel. Below the form, never
          between a guest and the submit button — but on this page rather than
          behind a second link, because "what do I wear" gets asked by someone
          already standing here. */}
      {boards.map((board) => (
        <section key={board.board.id} className="mt-12 border-t border-line pt-8">
          <h2 className="font-serif text-2xl">{board.board.title}</h2>
          {board.board.description ? (
            <p className="mb-4 mt-1 whitespace-pre-line text-sm text-muted">{board.board.description}</p>
          ) : null}
          <PublicBoardView board={board} />
        </section>
      ))}

      <p className="mt-10 text-xs text-muted">
        This link is yours — there&rsquo;s no account to create. Please don&rsquo;t forward it;
        everyone else has their own.
      </p>

      <p className="mt-2 text-xs text-muted">
        <Link className="underline hover:text-accent" href="/privacy">
          What happens to what you enter here
        </Link>
      </p>
    </main>
  );
}
