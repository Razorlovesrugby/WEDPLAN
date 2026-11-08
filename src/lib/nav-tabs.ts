/**
 * Each section's views, shown as a segmented control (`SubTabs`, spec 41
 * §4.3). Shared by every page under a section so the list can't drift between
 * them. `matchPrefixes` lights a tab for routes that aren't under its own href.
 */
export type SubTab = { href: string; label: string; matchPrefixes?: readonly string[] };

export const GUESTS_TABS: readonly SubTab[] = [
  { href: "/guests", label: "Households" },
  { href: "/guests/rank", label: "Ranking" },
];

export const TASKS_TABS: readonly SubTab[] = [
  { href: "/lists", label: "List" },
  { href: "/calendar", label: "Calendar" },
  { href: "/board", label: "Board" },
  { href: "/timeline", label: "Timeline" },
];

/** Spec 41: Invitations left the Guests hub for "For guests", and RSVP questions joined it. */
export const INVITATIONS_TABS: readonly SubTab[] = [
  { href: "/invitations", label: "Invitations" },
  { href: "/invitations/save-the-date", label: "Save the date" },
  { href: "/questions", label: "RSVP questions" },
];

/** Spec 41 §4.5: so Travel and Photos are reachable without first adding their block. */
export const WEBSITE_TABS: readonly SubTab[] = [
  { href: "/site", label: "Page", matchPrefixes: ["/site/history"] },
  { href: "/site/theme", label: "Theme" },
  { href: "/travel", label: "Travel" },
  { href: "/gallery", label: "Photos" },
  {
    href: "/site/extras",
    label: "Extras",
    matchPrefixes: ["/site/attire", "/site/gifts", "/site/songs", "/site/guestbook"],
  },
];

export const REGISTRY_TABS: readonly SubTab[] = [
  { href: "/gifts", label: "Items" },
  { href: "/gifts/claims", label: "Claims" },
  { href: "/gifts/settings", label: "Page & address" },
];
