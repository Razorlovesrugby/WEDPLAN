import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signPath } from "@/lib/supabase/storage";
import { SITE_SIGNED_URL_TTL_SECONDS, siteAssetPath } from "@/lib/site/assets";
import {
  chooseVariant,
  mayServePublicly,
  parseWidth,
  revisionReferences,
} from "@/lib/site/photo-access";

/**
 * GET /api/photo/<asset id>[?w=480|960] — a stable address for a photograph
 * (spec 27 D3).
 *
 * The bucket is private, so a photograph can only be fetched through a signed
 * URL, and a signed URL expires. A page that carried those directly worked for
 * an hour and then showed a column of broken images to anyone who left the tab
 * open and came back — which is exactly what a guest does with an invitation.
 * So the page carries *this* address, which never expires, and this route
 * checks the photograph may be shown and redirects to a URL signed a moment ago.
 *
 * **It decides for itself whether to answer**, because it is public:
 *
 *   - The planner's own session, for any photograph of their wedding. They are
 *     looking at a draft, so a photograph nobody has published yet must work.
 *   - Anybody else, for a photograph the **latest published revision** refers
 *     to, or a guest's upload the couple have approved. Nothing in a draft, and
 *     nothing awaiting moderation, is reachable from here.
 *
 * Every refusal is the same bare 404, so the route cannot be used to ask
 * whether an id exists. Asset ids are random uuids, which is the other half of
 * why this is safe to leave open; the paths it signs are derived from ids the
 * server holds and a width from a closed list, never from the request.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notFound = () => new NextResponse(null, { status: 404 });

type Asset = {
  id: string;
  wedding_id: string;
  storage_path: string;
  variants: number[] | null;
  approved_at: string | null;
  uploaded_by_household: string | null;
};

const COLUMNS = "id, wedding_id, storage_path, variants, approved_at, uploaded_by_household";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();

  const width = parseWidth(request.nextUrl.searchParams.get("w"));
  if (width === undefined) return notFound();

  let asset: Asset | null = null;
  let isPlanner = false;

  // The planner's session first — but only look when there is a session
  // cookie at all, so a guest's request costs one query rather than two.
  if (request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from("site_assets").select(COLUMNS).eq("id", id).maybeSingle();
      if (data) {
        asset = data as Asset;
        isPlanner = true;
      }
    } catch {
      // A broken session is a stranger, not an error.
    }
  }

  if (!asset) {
    const admin = createAdminClient();
    const { data } = await admin.from("site_assets").select(COLUMNS).eq("id", id).maybeSingle();
    if (!data) return notFound();
    const row = data as Asset;

    // Only look at the published revision when it can change the answer: an
    // unapproved photograph is refused outright, and a guest's approved upload
    // is public without it.
    let referenced = false;
    if (row.approved_at && row.uploaded_by_household === null) {
      const { data: revision } = await admin
        .from("site_revisions")
        .select("blocks")
        .eq("wedding_id", row.wedding_id)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      referenced = revisionReferences(revision?.blocks, row.id);
    }
    if (!mayServePublicly(row, referenced)) return notFound();
    asset = row;
  }

  // A copy that does not exist falls back to the original rather than 404ing:
  // an older `srcset` should never turn into a broken image.
  const variant = chooseVariant(width, asset.variants);
  const path =
    variant === "display" ? asset.storage_path : siteAssetPath(asset.wedding_id, asset.id, variant);

  const signed = await signPath(path, SITE_SIGNED_URL_TTL_SECONDS);
  if (!signed) return notFound();

  const response = NextResponse.redirect(signed, 302);
  response.headers.set(
    "Cache-Control",
    // The planner is looking at a draft: never cache it where a guest's request
    // could be answered from it. For everyone else the redirect may be reused
    // for an hour, which is well inside the 24-hour life of what it points at.
    isPlanner ? "private, no-store" : "public, max-age=300, s-maxage=3600",
  );
  // The image itself is cross-origin (storage), and a referrer would hand the
  // guest's address — a credential on a household page — to that host.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
