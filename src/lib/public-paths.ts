/**
 * Which paths a stranger may reach without a session.
 *
 * Pulled out of the middleware and given its own tests because getting this
 * list wrong fails in two directions and neither is obvious from the code:
 *
 *   Too short, and a public feature silently stops working. A moodboard share
 *   link that redirects the photographer to a login screen looks like a
 *   broken link, not like a missing entry in an array — and the extension's
 *   POST to /api/clip would follow the redirect and get HTML back.
 *
 *   Too long, and a planner screen is readable by anyone who guesses the URL.
 *
 * Every entry here is a surface that scopes ITSELF, because middleware is no
 * longer doing it: an invitation token resolved to one household, a share
 * token resolved to one board, a clip token resolved to one wedding, a bearer
 * CRON_SECRET, or a page that is genuinely public (/w, /privacy).
 */
export const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/auth",
  "/rsvp",
  "/w",
  "/m",
  "/privacy",
  "/api/cron",
  "/api/clip",
  "/api/health",
  // Everything under /api/public is deliberately reachable without a session
  // and scopes itself. A dedicated prefix rather than listing each route:
  // "/api/events" would have made every future route under it public too,
  // which is exactly the second failure mode described above.
  "/api/public",
] as const;

/**
 * Prefix match on whole segments. "/w" must match "/w" and "/w/anything" but
 * never "/weddings" — a substring match here would expose a planner route
 * whose name happened to start with a public one.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
