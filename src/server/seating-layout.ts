import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Which layout (and which space of it) a seating action works on. Every
 * designer write names the layout it is looking at; a missing one means the
 * event's live layout, which is made on demand, exactly as before drafts.
 */

export type LayoutRef = { id: string; isLive: boolean; lockedAt: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The layout to act on, or an error message. A deleted layout is never one. */
export async function resolveLayout(
  weddingId: string,
  eventId: string,
  layoutId?: string | null,
): Promise<{ ok: true; layout: LayoutRef } | { ok: false; error: string }> {
  const supabase = await createClient();
  if (layoutId) {
    if (!UUID.test(layoutId)) return { ok: false, error: "That layout doesn't exist" };
    const { data, error } = await supabase
      .from("seating_layouts")
      .select("id, is_live, locked_at")
      .eq("id", layoutId)
      .eq("wedding_id", weddingId)
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "That layout doesn't exist any more" };
    return { ok: true, layout: { id: data.id, isLive: data.is_live, lockedAt: data.locked_at } };
  }
  const made = await supabase.rpc("seating_live_layout", { p_event_id: eventId });
  if (made.error) return { ok: false, error: made.error.message };
  const { data, error } = await supabase
    .from("seating_layouts")
    .select("id, is_live, locked_at")
    .eq("id", made.data)
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That layout doesn't exist any more" };
  return { ok: true, layout: { id: data.id, isLive: data.is_live, lockedAt: data.locked_at } };
}

/**
 * The space an action works on: the one named if it lies in this layout,
 * otherwise the layout's first. `data` is null when the layout has no space
 * (or the one named isn't in it).
 */
export async function resolveSpace(weddingId: string, layoutId: string, spaceId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("seating_spaces")
    .select("id, name, room_width_cm, room_depth_cm, background_path, background_w_px, background_h_px, calibrated, drawing")
    .eq("wedding_id", weddingId)
    .eq("layout_id", layoutId);
  if (spaceId) {
    if (!UUID.test(spaceId)) return { data: null, error: null };
    query = query.eq("id", spaceId);
  }
  const { data, error } = await query.order("sort_order").order("created_at").limit(1).maybeSingle();
  return { data, error };
}

/** A layout's first space. */
export function firstSpaceOf(weddingId: string, layoutId: string) {
  return resolveSpace(weddingId, layoutId, null);
}

/**
 * Whether the room of the layout this row belongs to is locked (spec 57 Part
 * D). Name one thing it holds: a table, a fixture or a space; or the layout
 * itself. A row that isn't there is not locked (the write will say so).
 */
export async function roomIsLocked(
  weddingId: string,
  ref: { layoutId?: string; tableId?: string; fixtureId?: string; spaceId?: string },
): Promise<{ locked: boolean; error: string | null }> {
  const supabase = await createClient();
  let layoutId = ref.layoutId ?? null;
  if (!layoutId) {
    const [table, id] = ref.tableId ? ["seating_tables", ref.tableId] : ref.fixtureId ? ["seating_fixtures", ref.fixtureId] : ref.spaceId ? ["seating_spaces", ref.spaceId] : [null, null];
    if (!table || !id || !UUID.test(id)) return { locked: false, error: null };
    const { data, error } = await supabase.from(table as "seating_tables").select("layout_id").eq("id", id).eq("wedding_id", weddingId).maybeSingle();
    if (error) return { locked: false, error: error.message };
    layoutId = data?.layout_id ?? null;
  }
  if (!layoutId) return { locked: false, error: null };
  const { data, error } = await supabase.from("seating_layouts").select("locked_at").eq("id", layoutId).eq("wedding_id", weddingId).maybeSingle();
  if (error) return { locked: false, error: error.message };
  return { locked: Boolean(data?.locked_at), error: null };
}

/**
 * Lock item (spec 60 A.3): is this table or fixture held still? Apart from the room's lock. A row that isn't there is
 * not held (the write will say so).
 */
export async function itemIsHeld(
  weddingId: string,
  ref: { tableId?: string; fixtureId?: string },
): Promise<{ held: boolean; error: string | null }> {
  const id = ref.tableId ?? ref.fixtureId;
  if (!id || !UUID.test(id)) return { held: false, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(ref.tableId ? "seating_tables" : "seating_fixtures")
    .select("locked")
    .eq("id", id)
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) return { held: false, error: error.message };
  return { held: Boolean(data?.locked), error: null };
}
