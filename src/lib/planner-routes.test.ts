import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COUPLE_ONLY_ROUTES, COUPLE_ONLY_SUBROUTES, PLANNER_NAV_HREFS, PLANNER_ROUTES } from "./planner-routes";

const PLANNER_DIR = join(process.cwd(), "src/app/(planner)");
const dirs = readdirSync(PLANNER_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("every planner route is decided", () => {
  it("is in exactly one of PLANNER_ROUTES and COUPLE_ONLY_ROUTES", () => {
    const planner = new Set<string>(PLANNER_ROUTES);
    const couple = new Set<string>(COUPLE_ONLY_ROUTES);
    for (const dir of dirs) {
      const decided = Number(planner.has(dir)) + Number(couple.has(dir));
      expect(decided, `${dir}: add it to PLANNER_ROUTES or COUPLE_ONLY_ROUTES (src/lib/planner-routes.ts)`).toBe(1);
    }
  });

  it("names no directory that doesn't exist", () => {
    for (const name of [...PLANNER_ROUTES, ...COUPLE_ONLY_ROUTES]) {
      expect(dirs, `${name} is listed but there is no such route`).toContain(name);
    }
  });
});

describe("couple-only routes are guarded", () => {
  const guarded = (path: string) => {
    const file = join(PLANNER_DIR, path, "layout.tsx");
    expect(existsSync(file), `${path} has no layout.tsx`).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(/CoupleOnly|requireCouple/.test(source), `${path}/layout.tsx must use CoupleOnly or requireCouple`).toBe(true);
  };

  it("every couple-only section has a layout that redirects a planner", () => {
    for (const dir of COUPLE_ONLY_ROUTES) guarded(dir);
  });

  it("so do the couple-only parts of an allowed section", () => {
    for (const path of COUPLE_ONLY_SUBROUTES) guarded(path);
  });
});

describe("the planner's nav", () => {
  it("links only to sections a planner may open", () => {
    const allowed = new Set<string>(PLANNER_ROUTES);
    for (const href of PLANNER_NAV_HREFS) {
      if (href === "/") continue;
      expect(allowed.has(href.slice(1)), `${href} is in the planner's nav but is not a planner route`).toBe(true);
    }
  });
});

describe("what a planner may not reach stays out of the nav", () => {
  it("has no budget, registry, site or settings link", () => {
    for (const blocked of ["/budget", "/gifts", "/site", "/settings", "/questions", "/invitations"]) {
      expect(PLANNER_NAV_HREFS.has(blocked)).toBe(false);
    }
  });
});
