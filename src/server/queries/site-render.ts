import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPaths } from "@/lib/supabase/storage";
import { SITE_SIGNED_URL_TTL_SECONDS } from "@/lib/site/assets";
import { buildSiteImage, type SiteImageData } from "@/lib/site/site-image";
import { listPublishedBoards } from "@/server/moodboards/resolve";
import {
  getGallerySettings,
  getHouseholdUploads,
  getPublicGallery,
  type GalleryImage,
} from "@/server/queries/gallery";
import { getHouseholdSeats, getPublicTravel } from "@/server/queries/travel";
import { getPublicSiteExtras, type SiteExtras } from "@/server/queries/site-extras";
import { flag, text } from "@/lib/site/sections";
import { resolveTheme, type SiteTheme } from "@/lib/theme/presets";
import { loadRsvpData, type RsvpData } from "@/server/rsvp/resolve";
import type { CoachSeatRow, EventRow, SiteAssetRow } from "@/lib/types/database";
import type { PublicEvent } from "@/components/site/content";

/**
 * Everything the renderer needs, gathered once (spec 23 §4).
 *
 * One context type for three callers — the shared site, a household's own
 * page, and the editor's preview — because the alternative is three layouts
 * that drift. A block asks this for what it needs; `personal` being null is
 * the single fact that separates "a stranger is reading this" from "we know
 * exactly who this is".
 */

export type PersonalContext = {
  householdName: string;
  /** The household's invitation token, or null before one is issued. */
  token: string | null;
  members: { id: string; name: string }[];
  /** Only the events somebody in this household is invited to. */
  events: EventRow[];
  invitedByEvent: Map<string, Set<string>>;
  rsvp: RsvpData | null;
  seats: Record<string, Pick<CoachSeatRow, "coach_stop_id" | "seats">>;
  uploads: GalleryImage[];
  /**
   * Who is reading, for the things only a known guest may do (spec 25 §10):
   * publish a guestbook note without review, and vote for a song.
   */
  householdId: string;
  /**
   * `okonkwo-4f7ak` — the household's own address, which is the credential for
   * anything keyed by it (the weekend calendar file). Null when it is not known.
   */
  addressSegment: string | null;
};

export type RenderContext = {
  wedding: {
    id: string;
    name: string;
    slug: string;
    wedding_date: string | null;
    timezone: string;
  };
  theme: SiteTheme;
  events: PublicEvent[];
  travel: Awaited<ReturnType<typeof getPublicTravel>>;
  gallery: GalleryImage[];
  boards: Awaited<ReturnType<typeof listPublishedBoards>>;
  uploadsOpen: boolean;
  uploadsModerated: boolean;
  /**
   * Signed URLs for the photographs blocks refer to by asset id.
   *
   * Signed rather than public: the bucket holds a guest list's faces, and a
   * public bucket is a permanent, un-revocable decision. Blocks store an id;
   * only this map turns one into something the browser can fetch.
   */
  imageUrls: Map<string, string>;
  /**
   * The same photographs, as everything the renderer needs to draw one well
   * (spec 27 step 2): a stable `/api/photo/<id>` address that never expires,
   * a `srcset` when narrower copies exist, its dimensions, a placeholder
   * colour and a focal point. Prefer this to `imageUrls`, which is a direct
   * signed URL and survives 24 hours.
   */
  images: Map<string, SiteImageData>;
  /**
   * Dress codes, arrival points, the public song list and the guestbook
   * (spec 25). Every list here is already filtered to what this reader may
   * see — approved rows only, and codes narrowed to their own events — so a
   * component cannot widen it by forgetting a filter.
   */
  extras: SiteExtras;
  /** Null when a stranger is reading; the household when we know who it is. */
  personal: PersonalContext | null;
  /**
   * True only on the builder's preview. A block with nothing in it draws a
   * "Choose a photo" tile there, and nothing at all on a live page: the tile
   * is a message to the planner, and a guest must never be shown it. Publish
   * refusing sample text is the other half of that promise.
   */
  preview: boolean;
};

/** The theme is configuration and still lives in `site_content`. */
async function loadTheme(weddingId: string): Promise<SiteTheme> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", weddingId)
    .eq("block_key", "theme")
    .maybeSingle();
  return resolveTheme(data?.payload ?? null);
}

/**
 * Every image this wedding could render: a direct signed URL for each, and the
 * richer `SiteImageData` the renderer prefers. One query, one signing round trip.
 */
async function loadImages(
  weddingId: string,
): Promise<{ urls: Map<string, string>; images: Map<string, SiteImageData> }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_assets")
    .select("id, storage_path, width, height, variants, colour, focal_x, focal_y")
    .eq("wedding_id", weddingId)
    .in("kind", ["hero", "story", "party", "stay", "gallery"]);

  const rows = (data ?? []) as Pick<
    SiteAssetRow,
    "id" | "storage_path" | "width" | "height" | "variants" | "colour" | "focal_x" | "focal_y"
  >[];
  const signed = await signPaths(
    rows.map((row) => row.storage_path),
    SITE_SIGNED_URL_TTL_SECONDS,
  );

  const urls = new Map<string, string>();
  const images = new Map<string, SiteImageData>();
  for (const row of rows) {
    const url = signed.get(row.storage_path);
    // A row whose object has gone missing is left out of both, so its block
    // renders as it always has for a missing photograph — nothing — and one
    // lost object cannot cost the page.
    if (!url) continue;
    urls.set(row.id, url);
    images.set(row.id, buildSiteImage(row));
  }
  return { urls, images };
}

export async function buildRenderContext(
  wedding: RenderContext["wedding"],
  personal: PersonalContext | null,
): Promise<RenderContext> {
  const [theme, events, travel, gallery, boards, galleryBlock, loaded] = await Promise.all([
    loadTheme(wedding.id),
    publicEvents(wedding.id),
    getPublicTravel(wedding.id),
    getPublicGallery(wedding.id),
    listPublishedBoards(wedding.id, personal ? "rsvp" : "public_site"),
    getGallerySettings(wedding.id),
    loadImages(wedding.id),
  ]);

  // The events this reader may see, which is what the dress codes are resolved
  // against: on a household's page that is their own weekend (spec 22), and a
  // code covering only the brunch they were not invited to would otherwise
  // name an event nobody told them about.
  const visibleEvents = personal
    ? personal.events.map((event) => ({
        id: event.id,
        name: event.name,
        dress_code_id: event.dress_code_id,
      }))
    : events.map((event) => ({
        id: event.id,
        name: event.name,
        dress_code_id: event.dress_code_id ?? null,
      }));

  const extras = await getPublicSiteExtras(
    wedding.id,
    visibleEvents,
    personal?.householdId ?? null,
  );

  return {
    wedding,
    theme,
    events,
    travel,
    gallery,
    boards,
    uploadsOpen: flag(galleryBlock, "uploads_open"),
    uploadsModerated: text(galleryBlock, "moderation") !== "auto",
    imageUrls: loaded.urls,
    images: loaded.images,
    extras,
    personal,
    preview: false,
  };
}

async function publicEvents(weddingId: string): Promise<PublicEvent[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("events")
    .select("id, name, starts_at, ends_at, venue, address, dress_code_id")
    .eq("wedding_id", weddingId)
    .eq("is_public", true)
    .order("sort_order")
    .order("starts_at");
  return (data ?? []) as PublicEvent[];
}

/** Assemble the personal half from a resolved household. */
export async function buildPersonalContext(
  weddingId: string,
  household: { id: string; display_name: string },
  token: string | null,
  rsvp: RsvpData | null,
  addressSegment: string | null = null,
): Promise<PersonalContext> {
  const [seats, uploads] = await Promise.all([
    getHouseholdSeats(weddingId, household.id),
    getHouseholdUploads(weddingId, household.id),
  ]);

  const members = (rsvp?.guests ?? []).map((guest) => ({
    id: guest.id,
    name: guest.preferred_name?.trim() || guest.first_name,
  }));

  const invitedByEvent = new Map(
    (rsvp?.events ?? []).map((event) => [
      event.id,
      new Set(
        (rsvp?.invites ?? [])
          .filter((row) => row.event_id === event.id)
          .map((row) => row.guest_id),
      ),
    ]),
  );

  return {
    householdName: household.display_name,
    householdId: household.id,
    addressSegment,
    token,
    members,
    events: rsvp?.events ?? [],
    invitedByEvent,
    rsvp,
    seats: Object.fromEntries(
      [...seats.entries()].map(([runId, seat]) => [
        runId,
        { coach_stop_id: seat.coach_stop_id, seats: seat.seats },
      ]),
    ),
    uploads,
  };
}


/**
 * A household's page as the *planner* previews it (spec 27 E7, spec 28 §4.3).
 *
 * The same data a guest's own link assembles — their people, the events they
 * are really invited to, the questions, whatever they have already answered —
 * through the same two functions (`loadRsvpData`, `buildPersonalContext`), but
 * with **no token**. That absence is the guard: every guest-facing component
 * that writes needs a token to do it, so in the preview they all draw and
 * respond and none of them can save anything.
 *
 * `blank` empties the household's existing answers, to see the form as a guest
 * who has not replied yet would.
 *
 * It used to build a stand-in from every public event with everyone invited to
 * all of it, which previewed a page no guest would ever get (an event not
 * marked public was missing from the preview and present on the real page).
 */
export async function buildPreviewPersonal(
  weddingId: string,
  household: { id: string; display_name: string; slug?: string; slug_suffix?: string },
  options: { blank?: boolean } = {},
): Promise<PersonalContext> {
  const loaded = await loadRsvpData(weddingId, household.id);
  const rsvp = loaded && options.blank ? { ...loaded, rsvps: [], answers: [] } : loaded;

  return buildPersonalContext(
    weddingId,
    household,
    null,
    rsvp,
    household.slug && household.slug_suffix ? `${household.slug}-${household.slug_suffix}` : null,
  );
}
