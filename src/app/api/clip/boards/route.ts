import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateClip } from "@/server/moodboards/clip-auth";

/**
 * GET /api/clip/boards — the board list the extension builds its right-click
 * submenu from. Same bearer token, same one-wedding scoping as /api/clip.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateClip(request.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("moodboards")
    .select("id, title")
    .eq("wedding_id", auth.principal.weddingId)
    .is("archived_at", null)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { boards: data ?? [], defaultBoardId: auth.principal.defaultMoodboardId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
