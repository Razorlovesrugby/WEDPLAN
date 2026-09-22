import Link from "next/link";
import { SubTabs } from "@/components/sub-tabs";
import { SaveTheDateEditor } from "@/components/save-the-date/editor";
import { GUESTS_TABS } from "@/lib/nav-tabs";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import { listHouseholds } from "@/server/queries/guests";
import { getSaveTheDateEditor, listSaveTheDateOpens } from "@/server/queries/save-the-date";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Save the date" };

/**
 * `/invitations/save-the-date` — designing the save-the-date.
 *
 * Here rather than on `/site` because it is something *sent*, like the
 * invitation, not a section of the website; and beside "Send save-the-dates"
 * so the design and the send are one tab apart. Each household's link, and
 * whether they opened it, is in Guests.
 */
export default async function SaveTheDateEditorPage() {
  const wedding = await requireWedding();
  const [editor, households, opens] = await Promise.all([
    getSaveTheDateEditor(wedding.id),
    listHouseholds(wedding.id),
    listSaveTheDateOpens(wedding.id),
  ]);

  // The top-ranked household: the preview greets them, and "open as a guest"
  // opens their real page with ?preview=1 so the visit is not counted.
  const first = households[0];
  const sample = first
    ? {
        name: first.display_name,
        path: saveTheDatePath(wedding.slug, {
          slug: first.slug,
          suffix: first.slug_suffix,
        }),
      }
    : null;

  const opened = households.filter((household) => (opens[household.id]?.viewCount ?? 0) > 0).length;

  return (
    <div className="space-y-5">
      <SubTabs tabs={GUESTS_TABS} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Save the date</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            One link per household, nothing for them to fill in. Design it here; copy each
            household&rsquo;s link from Guests, where you can also see who&rsquo;s opened it — or
            email it to everyone from Invitations.
          </p>
        </div>
        {/* Every household's link in one file, for a mail merge or a
            spreadsheet of who-sends-what. */}
        <Link href="/api/export/households" className="btn" prefetch={false}>
          Download every link (CSV)
        </Link>
      </div>

      <SaveTheDateEditor
        initial={editor.content}
        siteTheme={editor.siteTheme}
        library={editor.library}
        autoPhotoIds={editor.autoPhotoIds}
        wedding={{
          name: wedding.name,
          slug: wedding.slug,
          wedding_date: wedding.wedding_date,
        }}
        sample={sample}
        opens={{ opened, households: households.length }}
      />
    </div>
  );
}
