import { siteFontClasses, typographyCssVars } from "@/lib/fonts";
import { requireWedding } from "@/server/queries/wedding";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import { buildPreviewPersonal, buildRenderContext } from "@/server/queries/site-render";
import { createClient } from "@/lib/supabase/server";
import { visibleBlocks } from "@/lib/site/blocks";
import { themeCssVars } from "@/lib/theme/presets";
import { motionAttributes } from "@/lib/site/motion";
import { SiteBlocks } from "@/components/site/blocks/render";
import { PreviewBridge } from "@/components/site/preview-bridge";

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

  // Who the planner is previewing as. No `?as=` means the first household on
  // the list, because the greeting, the weekend and the reply bar exist only on
  // a household's own page and a default preview of the shared site would show
  // none of them. `?as=shared` is the shared site, for when that is the
  // question.
  const supabase = await createClient();
  let personal = null;
  if (as !== "shared") {
    let query = supabase
      .from("households")
      .select("id, display_name, slug, slug_suffix")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null);
    query = as ? query.eq("id", as) : query.order("display_name").limit(1);
    const { data: household } = await query.maybeSingle();

    if (household) personal = await buildPreviewPersonal(wedding.id, household);
  }

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

  const shown = visibleBlocks(blocks, personal !== null);

  return (
    <div
      style={{ ...themeCssVars(ctx.theme), ...typographyCssVars(ctx.theme.preset, ctx.theme.typography) }}
      data-site-theme={ctx.theme.preset}
      {...motionAttributes(ctx.theme.motion)}
      // The section rail is `position: fixed`, which inside this frame would
      // pin it to the editor window rather than to the page it belongs to.
      // The builder's iframe is the only place that is true, so the flag is
      // set here rather than passed down through the renderer.
      data-site-preview="true"
      className={`${siteFontClasses(ctx.theme.preset)} -m-4 min-h-screen bg-paper font-body text-ink antialiased sm:-m-6`}
    >
      <PreviewBridge />
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
