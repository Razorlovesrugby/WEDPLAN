import Link from "next/link";
import { DesignFrame } from "@/components/design/design-frame";
import { SaveTheDateEditor } from "@/components/save-the-date/editor";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import { listHouseholds } from "@/server/queries/guests";
import { getSaveTheDateEditor, listSaveTheDateOpens } from "@/server/queries/save-the-date";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Save the date · Design" };

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
    // The editor has its own live preview, tied to unsaved changes and its
    // Save button, so it takes the Design frame without the shared one.
    <DesignFrame
      title="Save the date"
      description={
        <>
          One page per household, nothing for them to fill in. Design it here. Who gets it and
          sending it are under{" "}
          <Link href="/invitations?stage=save-the-date" className="underline">
            Invitations → Save the date
          </Link>
          .
        </>
      }
    >
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
    </DesignFrame>
  );
}
