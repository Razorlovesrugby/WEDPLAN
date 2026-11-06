import { requireCouple } from "@/server/queries/wedding";

/**
 * Wrap a segment's layout in this to send a planner (spec 39 part C) back to
 * the overview instead of onto a page whose data they cannot read. The
 * database is what actually keeps them out; this is so they land somewhere
 * that works. Not rendered for the couple's own viewing — they pass straight
 * through.
 */
export async function CoupleOnly({ children }: { children: React.ReactNode }) {
  await requireCouple();
  return <>{children}</>;
}
