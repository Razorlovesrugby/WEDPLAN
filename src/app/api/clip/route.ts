import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBytes } from "@/lib/supabase/storage";
import { authenticateClip } from "@/server/moodboards/clip-auth";
import { fetchImage } from "@/lib/net/fetch-image";
import { isAcceptedImageType, storageObjectPath, validateUpload } from "@/lib/moodboards";

/**
 * POST /api/clip — the Chrome extension's endpoint.
 *
 * Runs as the service role because there is no session: a browser extension
 * is not a signed-in page. Scoping therefore rests entirely on
 * authenticateClip(), which resolves the bearer token to ONE wedding, and on
 * this file constraining every query to it. The board id in the payload is
 * checked against that wedding before anything is written.
 *
 * Two body shapes:
 *
 *   multipart/form-data — the normal case. The extension decoded and
 *   downscaled the image itself in an offscreen document, so it sends the two
 *   derivatives and this endpoint never fetches anything. No SSRF surface at
 *   all on this path.
 *
 *   application/json — the fallback, for an image the extension could not
 *   decode (a CORS-restricted canvas, a format it does not know). Here the
 *   server does fetch the URL, through src/lib/net/fetch-image.ts and its
 *   address checks. This is the path the whole of that module exists for.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: unknown, status: number) {
  // No caching, ever: this is an authenticated write endpoint.
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateClip(request.headers);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const { weddingId, defaultMoodboardId } = auth.principal;
  const supabase = createAdminClient();

  const contentType = request.headers.get("content-type") ?? "";
  let requestedBoardId: string | null = null;
  let sourceUrl: string | null = null;
  let title: string | null = null;
  let displayBytes: Uint8Array | null = null;
  let thumbBytes: Uint8Array | null = null;
  let imageType = "image/webp";
  let width: number | null = null;
  let height: number | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    requestedBoardId = asString(form.get("boardId"));
    sourceUrl = asString(form.get("sourceUrl"));
    title = asString(form.get("title"));
    width = asInt(form.get("width"));
    height = asInt(form.get("height"));

    const display = form.get("display");
    const thumb = form.get("thumb");
    if (!(display instanceof File)) return json({ error: "No image in that clip." }, 400);

    imageType = isAcceptedImageType(display.type) ? display.type : "image/webp";
    displayBytes = new Uint8Array(await display.arrayBuffer());
    thumbBytes = thumb instanceof File ? new Uint8Array(await thumb.arrayBuffer()) : null;
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "That wasn't readable JSON." }, 400);
    }
    const payload = (body ?? {}) as Record<string, unknown>;
    requestedBoardId = asString(payload["boardId"]);
    sourceUrl = asString(payload["sourceUrl"]);
    title = asString(payload["title"]);

    const imageUrl = asString(payload["imageUrl"]);
    if (!imageUrl) return json({ error: "No image address in that clip." }, 400);

    const fetched = await fetchImage(imageUrl);
    if (!fetched.ok) return json({ error: fetched.reason }, 422);

    displayBytes = new Uint8Array(fetched.image.bytes);
    imageType = fetched.image.contentType;
    sourceUrl = sourceUrl ?? fetched.image.finalUrl;
  }

  // --- which board -------------------------------------------------------
  // Checked against the token's wedding. A board id from a clip is a string
  // off the wire like any other.
  let boardId: string | null = null;
  if (requestedBoardId) {
    const { data } = await supabase
      .from("moodboards")
      .select("id")
      .eq("wedding_id", weddingId)
      .eq("id", requestedBoardId)
      .is("archived_at", null)
      .maybeSingle();
    // 404, not 403: a 403 would confirm that the board exists.
    if (!data) return json({ error: "That board isn't available." }, 404);
    boardId = data.id;
  } else if (defaultMoodboardId) {
    const { data } = await supabase
      .from("moodboards")
      .select("id")
      .eq("wedding_id", weddingId)
      .eq("id", defaultMoodboardId)
      .is("archived_at", null)
      .maybeSingle();
    boardId = data?.id ?? null;
  }

  if (!boardId) {
    const { data } = await supabase
      .from("moodboards")
      .select("id")
      .eq("wedding_id", weddingId)
      .is("archived_at", null)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!data) return json({ error: "There are no moodboards to clip into yet." }, 409);
    boardId = data.id;
  }

  // --- caps --------------------------------------------------------------
  const [{ count }, { data: sizes }] = await Promise.all([
    supabase
      .from("moodboard_items")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .eq("moodboard_id", boardId),
    supabase.from("moodboard_items").select("byte_size").eq("wedding_id", weddingId),
  ]);

  const check = validateUpload({
    contentType: imageType,
    byteSize: displayBytes.byteLength,
    itemCount: count ?? 0,
    weddingBytes: (sizes ?? []).reduce((total, row) => total + (row.byte_size ?? 0), 0),
  });
  if (!check.ok) return json({ error: check.reason }, 413);

  // --- store -------------------------------------------------------------
  const itemId = crypto.randomUUID();
  const displayPath = storageObjectPath(weddingId, boardId, itemId, "display", imageType);
  // With no separate thumbnail (the JSON path has one image), both columns
  // point at the same object. The grid then loads the display copy, which is
  // the cost of the extension not having been able to decode it.
  const thumbPath = thumbBytes
    ? storageObjectPath(weddingId, boardId, itemId, "thumb", imageType)
    : displayPath;

  const stored = await uploadBytes(displayPath, displayBytes, imageType);
  if (!stored.ok) return json({ error: `Storage refused that image: ${stored.error}` }, 502);
  if (thumbBytes) {
    const thumbStored = await uploadBytes(thumbPath, thumbBytes, "image/webp");
    if (!thumbStored.ok) return json({ error: `Storage refused that image: ${thumbStored.error}` }, 502);
  }

  const { data: lastRow } = await supabase
    .from("moodboard_items")
    .select("sort_order")
    .eq("wedding_id", weddingId)
    .eq("moodboard_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("moodboard_items").insert({
    id: itemId,
    wedding_id: weddingId,
    moodboard_id: boardId,
    storage_path: displayPath,
    thumb_path: thumbPath,
    content_type: imageType,
    byte_size: displayBytes.byteLength,
    width,
    height,
    // Set here, not by a later confirm: the bytes are already in the bucket.
    uploaded_at: new Date().toISOString(),
    caption: title ? title.slice(0, 500) : null,
    source_url: sourceUrl ? sourceUrl.slice(0, 2000) : null,
    origin: "clip",
    sort_order: (lastRow?.sort_order ?? -1) + 1,
  });

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, itemId, boardId }, 201);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function asInt(value: unknown): number | null {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
