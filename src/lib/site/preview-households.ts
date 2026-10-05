/**
 * Who the editor's preview can be shown as, best first (spec 28 §9.4).
 *
 * The preview opens on a household, and which one decides what the planner
 * designs against: previewing as a household invited to a single event shows a
 * one-event page and hides the weekend layout entirely. So the household
 * invited to the most events comes first, and the rest follow in name order.
 *
 * "Most events" counts the invitation's own events, not the per-guest
 * exceptions on top (spec 22) — it picks a sensible default, nothing more, and
 * the picker still offers everyone.
 */
export type PreviewHousehold = { id: string; name: string; eventCount: number };

export function previewHouseholds(
  households: { id: string; display_name: string }[],
  invitations: { household_id: string; invitation_events: { event_id: string }[] | null }[],
): PreviewHousehold[] {
  const counts = new Map<string, number>();
  for (const invitation of invitations) {
    const own = new Set((invitation.invitation_events ?? []).map((row) => row.event_id)).size;
    counts.set(invitation.household_id, Math.max(counts.get(invitation.household_id) ?? 0, own));
  }

  return households
    .map((household) => ({
      id: household.id,
      name: household.display_name,
      eventCount: counts.get(household.id) ?? 0,
    }))
    .sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name));
}
