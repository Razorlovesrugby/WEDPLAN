import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPaths } from "@/lib/supabase/storage";
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
import type { RsvpContext } from "@/server/rsvp/resolve";
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
  rsvp: RsvpContext | null;
  seats: Record<string, Pick<CoachSeatRow, "coach_stop_id" | "seats">>;
  uploads: GalleryImage[];
  /**
   * Who is reading, for the things only a known guest may do (spec 25 §10):
   * publish a guestbook note without review, and vote for a song.
   */
  householdId: string;
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
   * Dress codes, arrival points, the public song list and the guestbook
   * (spec 25). Every list here is already filtered to what this reader may
   * see — approved rows only, and codes narrowed to their own events — so a
   * component cannot widen it by forgetting a filter.
   */
  extras: SiteExtras;
  /** Null when a stranger is reading; the household when we know who it is. */
  personal: PersonalContext | null;
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

/** Every image this wedding could render, signed in one round trip. */
async function loadImageUrls(weddingId: string): Promise<Map<string, string>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_assets")
    .select("id, storage_path")
    .eq("wedding_id", weddingId)
    .in("kind", ["hero", "story", "party", "stay", "gallery"]);

  const rows = (data ?? []) as Pick<SiteAssetRow, "id" | "storage_path">[];
  const signed = await signPaths(rows.map((row) => row.storage_path));

  const urls = new Map<string, string>();
  for (const row of rows) {
    const url = signed.get(row.storage_path);
    if (url) urls.set(row.id, url);
  }
  return urls;
}

export async function buildRenderContext(
  wedding: RenderContext["wedding"],
  personal: PersonalContext | null,
): Promise<RenderContext> {
  const [theme, events, travel, gallery, boards, galleryBlock, imageUrls] = await Promise.all([
    loadTheme(wedding.id),
    publicEvents(wedding.id),
    getPublicTravel(wedding.id),
    getPublicGallery(wedding.id),
    listPublishedBoards(wedding.id, personal ? "rsvp" : "public_site"),
    getGallerySettings(wedding.id),
    loadImageUrls(wedding.id),
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
    imageUrls,
    extras,
    personal,
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
  rsvp: RsvpContext | null,
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
