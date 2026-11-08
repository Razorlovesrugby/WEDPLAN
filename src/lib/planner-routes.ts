/**
 * Which planner screens a planner login may open (spec 39 part C). Pure data,
 * so the nav and a test read the same list.
 *
 * The database is what actually keeps a planner out of data (RLS, 0044); this
 * list is so they land on screens that work. A route directory under
 * `src/app/(planner)` must appear in exactly one of the two sets below --
 * `planner-routes.test.ts` fails otherwise, so a new section cannot quietly
 * default to either.
 */

/** Top-level directories a planner may open. */
export const PLANNER_ROUTES = [
  "board",
  "calendar",
  "events",
  "guests",
  "households",
  "lists",
  "menu",
  "moodboards",
  "run-sheet",
  "seating",
  "timeline",
  "vendors",
] as const;

/** Top-level directories only the couple may open; each has a layout wrapping its pages in <CoupleOnly>. */
export const COUPLE_ONLY_ROUTES = [
  "budget",
  "gallery",
  "gifts",
  "invitations",
  "questions",
  "settings",
  "setup",
  "site",
  "travel",
] as const;

/** Sub-sections of an allowed route that are still couple-only: path under (planner), each with its own layout. */
export const COUPLE_ONLY_SUBROUTES = ["guests/rank", "guests/import"] as const;

/** The nav entries a planner sees (by href). */
export const PLANNER_NAV_HREFS: ReadonlySet<string> = new Set([
  "/",
  "/guests",
  "/vendors",
  "/events",
  "/lists",
  "/moodboards",
]);
