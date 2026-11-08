import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, activeHref, activeTabId, navGroupsFor, tabsFor } from "./nav-groups";
import { DESIGN_TABS, GUESTS_TABS, REGISTRY_TABS, TASKS_TABS } from "./nav-tabs";
import { PLANNER_NAV_HREFS } from "./planner-routes";

const PLANNER_DIR = join(process.cwd(), "src/app/(planner)");

/** Every planner page as a URL path, with dynamic segments filled in. */
function pageRoutes(dir = PLANNER_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageRoutes(path);
    if (entry.name !== "page.tsx") return [];
    const segments = relative(PLANNER_DIR, dir).split(sep).filter(Boolean);
    return [`/${segments.map((segment) => (segment.startsWith("[") ? "x" : segment)).join("/")}`];
  });
}

/** Pages deliberately outside the sidebar: the no-wedding-yet screen and the phone's group pages. */
const OUTSIDE_THE_SIDEBAR = new Set(["/setup", "/menu"]);

const hrefs = (groups: ReturnType<typeof navGroupsFor>) => groups.flatMap((group) => group.entries.map((e) => e.href));

describe("every planner page has a place in the sidebar", () => {
  const routes = pageRoutes();

  it("finds the pages", () => {
    expect(routes).toContain("/");
    expect(routes).toContain("/guests/x");
  });

  it("lights exactly one sidebar entry for every page", () => {
    for (const route of routes) {
      if ([...OUTSIDE_THE_SIDEBAR].some((outside) => route === outside || route.startsWith(`${outside}/`))) continue;
      expect(activeHref(route), `${route} isn't under any entry in src/lib/nav-groups.ts`).not.toBeNull();
    }
  });

  it("never lets two entries claim the same prefix, so the longest match is always one entry", () => {
    const prefixes = NAV_GROUPS.flatMap((group) => group.entries.flatMap((entry) => entry.matchPrefixes));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("only links to pages that exist", () => {
    for (const href of hrefs(navGroupsFor("couple"))) expect(routes, href).toContain(href);
  });
});

describe("which entry a path lights", () => {
  it.each([
    ["/", "/"],
    ["/calendar", "/lists"],
    ["/lists/x", "/lists"],
    ["/households/x", "/guests"],
    ["/guests/rank", "/guests"],
    ["/seating", "/events"],
    ["/events/x/run-sheet", "/events"],
    ["/questions", "/site"],
    ["/invitations/save-the-date", "/site"],
    ["/invitations", "/invitations"],
    ["/travel", "/site"],
    ["/site/attire", "/site"],
    ["/site/questions", "/site/questions"],
    ["/gifts/claims", "/gifts"],
    ["/gifts/settings", "/gifts"],
    ["/settings/activity", "/settings"],
  ])("%s → %s", (path, expected) => {
    expect(activeHref(path)).toBe(expected);
  });

  it("doesn't treat a prefix of a word as a match", () => {
    expect(activeHref("/sitemap")).toBeNull();
  });
});

describe("the planner's sidebar", () => {
  it("is exactly the planner's allowed entries", () => {
    expect(new Set(hrefs(navGroupsFor("planner")))).toEqual(new Set(PLANNER_NAV_HREFS));
  });

  it("drops a group left with nothing in it", () => {
    const ids = navGroupsFor("planner").map((group) => group.id);
    expect(ids).not.toContain("guests");
    expect(ids).not.toContain("settings");
  });
});

describe("the phone tab bar", () => {
  it.each(["couple", "planner"] as const)("lists the same places as the sidebar (%s)", (viewer) => {
    const fromTabs = tabsFor(viewer).flatMap((tab) => tab.groups.flatMap((group) => group.entries.map((e) => e.href)));
    expect(fromTabs.sort()).toEqual(hrefs(navGroupsFor(viewer)).sort());
  });

  it("has the five tabs from spec 41 Q4", () => {
    expect(tabsFor("couple").map((tab) => tab.label)).toEqual(["Today", "Planning", "Guests", "For guests", "More"]);
  });

  it.each([
    ["/", "home"],
    ["/budget", "planning"],
    ["/households/x", "people"],
    ["/site/questions", "guests"],
    ["/events", "more"],
    ["/settings", "more"],
    ["/menu", null],
  ])("%s lights %s", (path, tab) => {
    expect(activeTabId(path, "couple")).toBe(tab);
  });
});

describe("section views", () => {
  const routes = pageRoutes();
  it.each([
    ["guests", GUESTS_TABS],
    ["tasks", TASKS_TABS],
    ["design", DESIGN_TABS],
    ["registry", REGISTRY_TABS],
  ] as const)("every %s view is a real page", (_name, tabs) => {
    for (const tab of tabs) {
      expect(routes, tab.href).toContain(tab.href);
      for (const prefix of tab.matchPrefixes ?? []) expect(routes, prefix).toContain(prefix);
    }
  });
});

describe("every Design tab uses the shared Design frame (spec 42 §5.3)", () => {
  // Registry links out to the registry's own Page & address screen, which stays under Registry (Q8).
  const LINKS_OUT = new Set(["/gifts/settings"]);
  const routes = DESIGN_TABS.flatMap((tab) => [tab.href, ...(tab.matchPrefixes ?? [])]).filter(
    (href) => !LINKS_OUT.has(href) && href !== "/site/history",
  );
  it.each(routes)("%s", (href) => {
    const file = join(PLANNER_DIR, href, "page.tsx");
    expect(readFileSync(file, "utf8"), `${href} must render inside <DesignFrame>`).toMatch(/<DesignFrame[\s>]/);
  });
});
