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
      { href: "/invitations", label: "Invitations", matchPrefixes: ["/invitations", "/questions"] },
      { href: "/site", label: "Website", matchPrefixes: ["/site", "/travel", "/gallery"] },
      // The route is /gifts, not /registry: /registry/<slug> is the PUBLIC page (spec 36 §5).
      { href: "/gifts", label: "Registry", matchPrefixes: ["/gifts"] },
      // Spec 43 makes this a real inbox. Until then it is the guest questions inbox.
      { href: "/site/questions", label: "Inbox", matchPrefixes: ["/site/questions"] },
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
 * The phone's five tabs (spec 41 §4.2). Today links straight to `/`; the rest
 * open `/menu?group=…`, a plain page listing that group's entries. "More"
 * holds The day and Settings.
 */
export const TAB_BAR = [
  { id: "home", label: "Today", groups: ["home"] },
  { id: "planning", label: "Planning", groups: ["planning"] },
  { id: "people", label: "Guests", groups: ["people"] },
  { id: "guests", label: "For guests", groups: ["guests"] },
  { id: "more", label: "More", groups: ["day", "settings"] },
] as const satisfies readonly { id: string; label: string; groups: readonly NavGroup["id"][] }[];

export type TabId = (typeof TAB_BAR)[number]["id"];

export function isTabId(value: string | undefined): value is TabId {
  return TAB_BAR.some((tab) => tab.id === value);
}

/** The tabs a viewer sees, each with the groups it holds (planner-filtered; empty tabs dropped). */
export function tabsFor(viewer: Viewer) {
  const groups = navGroupsFor(viewer);
  return TAB_BAR.map((tab) => ({
    id: tab.id as TabId,
    label: tab.label,
    groups: groups.filter((group) => (tab.groups as readonly string[]).includes(group.id)),
  })).filter((tab) => tab.groups.length > 0);
}

/** Which tab a path lights. */
export function activeTabId(pathname: string, viewer: Viewer): TabId | null {
  if (pathname === "/menu") return null;
  const group = activeGroupId(pathname, navGroupsFor(viewer));
  if (group === null) return null;
  return tabsFor(viewer).find((tab) => tab.groups.some((g) => g.id === group))?.id ?? null;
}
