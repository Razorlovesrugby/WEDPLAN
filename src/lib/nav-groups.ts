import { PLANNER_NAV_HREFS } from "./planner-routes";

/**
 * The app's one list of places (spec 41). The laptop sidebar, the phone tab
 * bar and the phone's group pages (`/menu`) all read this, so they cannot list
 * different things. URLs are unchanged from before spec 41: this regroups the
 * links, it doesn't move any route.
 *
 * `matchPrefixes` are the routes an entry stays lit for. When two entries
 * claim the same path the longest prefix wins, which is how `/site/questions`
 * lights Inbox rather than Website.
 */
export type NavEntry = {
  href: string;
  label: string;
  matchPrefixes: readonly string[];
};

export type NavGroup = {
  /** Used in `/menu?group=<id>` and as the tab bar's key. */
  id: "home" | "planning" | "people" | "day" | "guests" | "settings";
  /** Null for the ungrouped entries at the top and bottom of the sidebar. */
  label: string | null;
  entries: readonly NavEntry[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "home",
    label: null,
    entries: [{ href: "/", label: "Today", matchPrefixes: ["/"] }],
  },
  {
    id: "planning",
    label: "Planning",
    entries: [
      { href: "/lists", label: "Tasks", matchPrefixes: ["/lists", "/calendar", "/board", "/timeline"] },
      { href: "/budget", label: "Budget", matchPrefixes: ["/budget"] },
      { href: "/vendors", label: "Vendors", matchPrefixes: ["/vendors"] },
      { href: "/moodboards", label: "Moodboards", matchPrefixes: ["/moodboards"] },
    ],
  },
  {
    id: "people",
    label: "People",
    entries: [{ href: "/guests", label: "Guest list", matchPrefixes: ["/guests", "/households"] }],
  },
  {
    id: "day",
    label: "The day",
    // Seating stays here, reached through each event (spec 41 Q3).
    entries: [
      { href: "/events", label: "Events & run sheet", matchPrefixes: ["/events", "/run-sheet", "/seating"] },
    ],
  },
  {
    id: "guests",
    label: "For guests",
    entries: [
      // Design and Invitations are different jobs (spec 42 §2): making what
      // guests see, and deciding who gets it. The invitation IS the website —
      // one page per household — so there is no separate "Website" entry.
      // Save the date and RSVP questions keep their URLs under other sections;
      // the longest prefix wins, so they light Design.
      {
        href: "/site",
        label: "Design",
        matchPrefixes: ["/site", "/travel", "/gallery", "/invitations/save-the-date", "/questions"],
      },
      { href: "/invitations", label: "Invitations", matchPrefixes: ["/invitations"] },
      // The route is /gifts, not /registry: /registry/<slug> is the PUBLIC page (spec 36 §5).
      { href: "/gifts", label: "Registry", matchPrefixes: ["/gifts"] },
      // Everything guests send in (spec 43). The guest-questions screen it grew
      // out of stays lit here too.
      { href: "/inbox", label: "Inbox", matchPrefixes: ["/inbox", "/site/questions"] },
    ],
  },
  {
    id: "settings",
    label: null,
    entries: [{ href: "/settings", label: "Settings", matchPrefixes: ["/settings"] }],
  },
];

export type Viewer = "couple" | "planner";

/** The groups a viewer sees: a planner only gets the entries it may open, and a group left empty is dropped. */
export function navGroupsFor(viewer: Viewer): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => viewer === "couple" || PLANNER_NAV_HREFS.has(entry.href)),
  })).filter((group) => group.entries.length > 0);
}

function matchLength(pathname: string, prefix: string): number {
  if (prefix === "/") return pathname === "/" ? 1 : 0;
  return pathname === prefix || pathname.startsWith(`${prefix}/`) ? prefix.length : 0;
}

/** The href of the entry a path belongs to (longest matching prefix), or null. */
export function activeHref(pathname: string, groups: readonly NavGroup[] = NAV_GROUPS): string | null {
  let best: { href: string; length: number } | null = null;
  for (const group of groups) {
    for (const entry of group.entries) {
      for (const prefix of entry.matchPrefixes) {
        const length = matchLength(pathname, prefix);
        if (length > 0 && (best === null || length > best.length)) best = { href: entry.href, length };
      }
    }
  }
  return best?.href ?? null;
}

/** The group a path belongs to, for lighting the phone tab bar. */
export function activeGroupId(pathname: string, groups: readonly NavGroup[] = NAV_GROUPS): NavGroup["id"] | null {
  const href = activeHref(pathname, groups);
  if (href === null) return null;
  return groups.find((group) => group.entries.some((entry) => entry.href === href))?.id ?? null;
}

/**
 * The phone's tab bar (spec 48, replacing spec 41 §4.2's group tabs). Each tab
 * goes straight to one place, as in an iOS app; "More" opens a sheet (or, with
 * no JavaScript, `/menu`) listing every other place, grouped as in the sidebar.
 */
export const PHONE_TABS = [
  { id: "home", label: "Today", href: "/" },
  { id: "tasks", label: "Tasks", href: "/lists" },
  { id: "guests", label: "Guests", href: "/guests" },
  { id: "site", label: "Website", href: "/site" },
] as const satisfies readonly { id: string; label: string; href: string }[];

export type TabId = (typeof PHONE_TABS)[number]["id"] | "more";

/** The direct tabs a viewer sees: a planner only gets the places it may open. */
export function tabsFor(viewer: Viewer) {
  const allowed = new Set(hrefsFor(viewer));
  return PHONE_TABS.filter((tab) => allowed.has(tab.href));
}

/** Everything not on a direct tab, grouped as in the sidebar: what "More" lists. */
export function moreGroupsFor(viewer: Viewer): NavGroup[] {
  const onTabs = new Set<string>(tabsFor(viewer).map((tab) => tab.href));
  return navGroupsFor(viewer)
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => !onTabs.has(entry.href)) }))
    .filter((group) => group.entries.length > 0);
}

/** Which tab a path lights: its own tab, else More (a place More lists), else none. */
export function activeTabId(pathname: string, viewer: Viewer): TabId | null {
  if (pathname === "/menu") return "more";
  const href = activeHref(pathname, navGroupsFor(viewer));
  if (href === null) return null;
  return tabsFor(viewer).find((tab) => tab.href === href)?.id ?? "more";
}

function hrefsFor(viewer: Viewer): string[] {
  return navGroupsFor(viewer).flatMap((group) => group.entries.map((entry) => entry.href));
}
