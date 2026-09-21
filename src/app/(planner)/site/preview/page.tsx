import { siteFontClasses } from "@/lib/fonts";
import { requireWedding } from "@/server/queries/wedding";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import { buildPersonalContext, buildRenderContext } from "@/server/queries/site-render";
import { createClient } from "@/lib/supabase/server";
import { visibleBlocks } from "@/lib/site/blocks";
import { themeCssVars } from "@/lib/theme/presets";
import { SiteBlocks } from "@/components/site/blocks/render";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * The draft, rendered exactly as a guest would get it (spec 23 §5).
 *
 * Behind the planner's own authentication, inside the `(planner)` group, and
 * reading `site_blocks` rather than a revision — this is the one place the
 * draft is visible, and it is visible only to somebody signed in.
 *
 * It renders through `SiteBlocks`, the same component the public page uses. A
 * preview with its own renderer is a preview that starts lying the moment
 * anybody changes the real one.
 *
 * `?as=<household id>` previews somebody's personalised version. It logs
 * nothing: an open count that includes the planner looking at their own work
 * is worse than no open count (spec 22 §9).
 */
export default async function SitePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const wedding = await requireWedding();
  const blocks = await listDraftBlocks(wedding.id);

  let personal = null;
  if (as) {
    const supabase = await createClient();
    const { data: household } = await supabase
      .from("households")
      .select("id, display_name")
      .eq("wedding_id", wedding.id)
      .eq("id", as)
      .maybeSingle();

    if (household) {
      // No token: the preview shows the shape of their page, and the RSVP
      // form needs a credential this screen deliberately does not hold.
      personal = await buildPersonalContext(wedding.id, household, null, null);
    }
  }

  const ctx = await buildRenderContext(
    {
      id: wedding.id,
      name: wedding.name,
      slug: wedding.slug,
      wedding_date: wedding.wedding_date,
      timezone: wedding.timezone,
    },
    personal,
  );

  const shown = visibleBlocks(blocks, personal !== null);

  return (
    <div
      style={themeCssVars(ctx.theme)}
      className={`${siteFontClasses(ctx.theme.preset)} -m-4 min-h-screen bg-paper font-body text-ink antialiased sm:-m-6`}
    >
      {shown.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted">
          Nothing on the page yet. Add a block and it appears here.
        </p>
      ) : (
        <SiteBlocks blocks={shown} ctx={ctx} />
      )}
    </div>
  );
}
