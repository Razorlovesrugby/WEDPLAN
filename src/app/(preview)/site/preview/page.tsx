import { z } from "zod";
import { siteFontClasses, typographyCssVars } from "@/lib/fonts";
import { requireWedding } from "@/server/queries/wedding";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import { buildPreviewPersonal, buildRenderContext } from "@/server/queries/site-render";
import { createClient } from "@/lib/supabase/server";
import { visibleBlocks } from "@/lib/site/blocks";
import { themeCssVars, themeAttributes } from "@/lib/theme/presets";
import { motionAttributes } from "@/lib/site/motion";
import { SiteBlocks } from "@/components/site/blocks/render";
import { PreviewBridge } from "@/components/site/preview-bridge";
import { SiteTopBar } from "@/components/site/top-bar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

/**
 * The draft, rendered exactly as a guest would get it (spec 23 §5).
 *
 * Behind the planner's own authentication and reading `site_blocks` rather than
 * a revision — this is the one place the draft is visible, and it is visible
 * only to somebody signed in (middleware gates the path, `requireWedding`
 * checks again).
 *
 * It lives in its own `(preview)` route group, **not** `(planner)`: that group's
 * layout draws the planner's header and menu, which inside the editor's frame
 * would sit above the guest's cover where no guest has ever seen anything.
 * The URL is unchanged; only the layout it inherits is.
 *
 * It renders through `SiteBlocks`, the same component the public page uses. A
 * preview with its own renderer is a preview that starts lying the moment
 * anybody changes the real one.
 *
 * `?as=<household id>` previews somebody's own page, and every page a guest can
 * reach is somebody's (spec 28 §7a.4), so there is no neutral version: no `as`
 * means the first household on the list. It is built from that household's
 * real invitations and answers, and it logs nothing — an open count that
 * includes the planner looking at their own work is worse than no open count
 * (spec 22 §9). `?blank=1` shows the reply form as it is before anyone answers.
 *
 * The household has no token here, which is what makes the reply form, the
 * vote button, the coach booking and the uploader fully usable and unable to
 * save (`buildPreviewPersonal`).
 */
export default async function SitePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; blank?: string }>;
}) {
  const { as, blank } = await searchParams;
  const wedding = await requireWedding();
  const blocks = await listDraftBlocks(wedding.id);

  // Who the planner is previewing as. A value that is not a household id (an
  // old `?as=shared` link, say) is the same as none.
  const supabase = await createClient();
  const householdId = z.string().uuid().safeParse(as);
  let query = supabase
    .from("households")
    .select("id, display_name, slug, slug_suffix")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null);
  query = householdId.success ? query.eq("id", householdId.data) : query.order("display_name").limit(1);
  const { data: household } = await query.maybeSingle();

  const personal = household
    ? await buildPreviewPersonal(wedding.id, household, { blank: blank === "1" })
    : null;

  const built = await buildRenderContext(
    {
      id: wedding.id,
      name: wedding.name,
      slug: wedding.slug,
      wedding_date: wedding.wedding_date,
      timezone: wedding.timezone,
    },
    personal,
  );
  // The one place `preview` is true: an empty photo block says so here and
  // draws nothing on a guest's page.
  const ctx = { ...built, preview: true };

  const shown = visibleBlocks(blocks);

  return (
    <div
      style={{ ...themeCssVars(ctx.theme), ...typographyCssVars(ctx.theme.preset, ctx.theme.typography) }}
      {...themeAttributes(ctx.theme)}
      {...motionAttributes(ctx.theme.motion)}
      // The section rail is `position: fixed`, which inside this frame would
      // pin it to the editor window rather than to the page it belongs to.
      // The builder's iframe is the only place that is true, so the flag is
      // set here rather than passed down through the renderer.
      data-site-preview="true"
      className={`${siteFontClasses(ctx.theme.preset)} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      <PreviewBridge />
      {/* The bar a guest gets, sticky to this frame, so the switch and the bar's
          shape can be judged while editing (spec 28 §5.2). */}
      <SiteTopBar ctx={ctx} blocks={shown} />
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
