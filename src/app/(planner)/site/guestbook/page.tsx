import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { getGuestNotes } from "@/server/queries/site-extras";
import { GuestNoteList } from "@/components/site/editor/guest-note-list";

export const metadata = { title: "The guestbook" };

/**
 * The guestbook queue (spec 25 §12).
 *
 * Spec 23 cut this feature for one reason — somebody has to read what
 * strangers write — so the thing worth saying on this screen is how little of
 * that there is. A note left from a household's own link is already on the
 * page; only notes from the shared address are waiting here.
 *
 * If that ever stops being true, this screen becomes an evening's work in the
 * week of a wedding, and the feature should go back out.
 */
export default async function GuestbookPage() {
  const wedding = await requireWedding();
  const notes = await getGuestNotes(wedding.id);

  const waiting = notes.filter((note) => note.status === "new").length;
  const published = notes.filter((note) => note.status === "approved").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">The guestbook</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {notes.length === 0 ? (
              "Nothing yet. Add the guestbook block to your site and notes arrive here."
            ) : (
              <>
                {published} on the page
                {waiting > 0 ? (
                  <>
                    {" · "}
                    <span className="font-medium text-ink">
                      {waiting} waiting for you
                    </span>
                  </>
                ) : null}
                . Notes left from a guest&rsquo;s own invitation link go up straight away; these
                came from the shared address.
              </>
            )}
          </p>
        </div>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      <GuestNoteList
        rows={notes.map((note) => ({
          id: note.id,
          body: note.body,
          status: note.status,
          createdAt: note.created_at,
          // The household we already know beats whatever was typed, which is
          // why a note from an invitation link never needs a name field.
          authorName: note.householdName ?? note.author_name,
          fromInvitation: note.household_id !== null,
        }))}
      />
    </div>
  );
}
