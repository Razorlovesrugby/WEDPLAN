import { notFound } from "next/navigation";

/**
 * There is no shared wedding page (spec 28 §7a.4).
 *
 * `/w/<slug>` used to be the public version of the invitation. The couple's
 * answer was that there is no "main site" — everything is in the invitation —
 * so every page a guest can reach is a household's own,
 * `/w/<slug>/<household>`, and this address says nothing at all. A plain 404
 * rather than a landing page: it does not even confirm the wedding exists.
 *
 * The planner's view of the page is the editor's preview, which is behind
 * their sign-in.
 */
export const dynamic = "force-dynamic";

export default function SharedPageIsGone() {
  notFound();
}
