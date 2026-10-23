import "server-only";
import { BlockedAddressError, once, parseHttpsUrl } from "./fetch-image";

/**
 * Fetching a web PAGE a signed-in planner pasted (spec 36 §5.3), for the
 * registry's "paste a link" autofill.
 *
 * It reuses every guard in `fetch-image.ts` — https only, the address check
 * inside the socket's own DNS lookup (so rebinding can't slip past), no
 * cookies, redirects followed by hand and re-validated — by calling the same
 * `once()`; only the Accept header and the user-agent differ. The body is
 * capped, and a response that isn't HTML is refused.
 *
 * It is a convenience that is allowed to fail: many shops refuse non-browser
 * clients, and the caller falls back to typing the item in.
 */

const MAX_PAGE_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type FetchPageResult = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };

export async function fetchPage(rawUrl: string): Promise<FetchPageResult> {
  let url = parseHttpsUrl(rawUrl);
  if (!url) return { ok: false, reason: "Autofill needs a secure (https://) address." };

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let attempt;
    try {
      attempt = await once(url, MAX_PAGE_BYTES, TIMEOUT_MS, {
        accept: "text/html,application/xhtml+xml",
        userAgent: "wedplan-registry/1.0 (link preview)",
      });
    } catch (error) {
      if (error instanceof BlockedAddressError) return { ok: false, reason: "That address isn't one this server will visit." };
      const message = error instanceof Error ? error.message : "";
      if (message === "TOO_LARGE") return { ok: false, reason: "That page is too large to read." };
      if (message === "TIMEOUT") return { ok: false, reason: "That page took too long to load." };
      return { ok: false, reason: "That page couldn't be reached." };
    }

    if (attempt.location) {
      const next = parseHttpsUrl(new URL(attempt.location, url).toString());
      if (!next) return { ok: false, reason: "That page redirected somewhere this won't follow." };
      url = next;
      continue;
    }

    if (attempt.status !== 200 || !attempt.body) {
      return { ok: false, reason: `That page returned ${attempt.status || "no response"}.` };
    }
    const header = attempt.headers["content-type"];
    const type = (Array.isArray(header) ? header[0] : header)?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type !== "text/html" && type !== "application/xhtml+xml") {
      return { ok: false, reason: "That address isn't a web page." };
    }
    return { ok: true, html: attempt.body.toString("utf8"), finalUrl: url.toString() };
  }
  return { ok: false, reason: "That page redirected too many times." };
}
