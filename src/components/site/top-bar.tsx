import type { SiteBlock } from "@/lib/site/blocks";
import { navRsvpLabel, replyMembersFromContext, summariseReply } from "@/lib/site/reply-state";
import type { RenderContext } from "@/server/queries/site-render";
import { NavMark } from "./monogram";
import { SiteNav } from "./site-nav";

/**
 * The top bar, decided once for every page that draws it (spec 28 §5.2).
 *
 * A household's own page and the editor's preview both call this, so what the
 * planner sees while editing is the bar a guest gets. Off with the rail's
 * "Bar at the top" switch — then there is no bar at all and nothing else moves.
 *
 * The button is drawn only when the page has a reply section to point at.
 */
export function SiteTopBar({ ctx, blocks }: { ctx: RenderContext; blocks: SiteBlock[] }) {
  if (!ctx.theme.layout.topNav) return null;

  const hasReplySection = blocks.some((block) => block.type === "rsvp");
  const rsvp = ctx.personal?.rsvp;
  const rsvpLabel = hasReplySection
    ? rsvp
      ? navRsvpLabel(summariseReply(replyMembersFromContext(rsvp)))
      : "RSVP"
    : null;

  return <SiteNav mark={<NavMark name={ctx.wedding.name} />} rsvpLabel={rsvpLabel} />;
}
