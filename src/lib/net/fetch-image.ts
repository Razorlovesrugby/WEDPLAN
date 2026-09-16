import "server-only";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateAddress } from "./is-private-address";
import { ACCEPTED_IMAGE_TYPES, MAX_SOURCE_BYTES, isAcceptedImageType, type AcceptedImageType } from "@/lib/moodboards";

/**
 * Fetching an image from a URL somebody else chose.
 *
 * Two callers, both unavoidable: the Chrome extension's clip endpoint when
 * the extension could not decode the image itself, and the Pinterest import
 * when the browser cannot read the CDN because of CORS. Both mean "here is a
 * URL, go and fetch it from your server", which is the textbook SSRF shape —
 * from inside a hosting provider's network that can reach cloud metadata
 * endpoints and internal services a browser never could.
 *
 * So this module is the only place in the app that fetches a URL it was
 * handed, and it is deliberately small enough to read in one sitting.
 *
 * THE DESIGN DECISION WORTH KNOWING: the address check runs inside the DNS
 * lookup that the socket itself uses, not as a pre-flight resolve. A
 * pre-flight lookup leaves a window — resolve, validate, then the stack
 * resolves *again* when it connects, and a hostile DNS server can answer
 * differently the second time (rebinding). Supplying our own `lookup` closes
 * that window, because the address this function approves is by definition
 * the address the socket gets.
 *
 * This is also why it is node:https rather than fetch(): global fetch offers
 * no seam to pass a lookup through without adding a dependency on undici.
 * Redirects are therefore followed by hand, which is no loss — each one has
 * to be re-validated anyway.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;

export type FetchedImage = {
  bytes: Buffer;
  contentType: AcceptedImageType;
  /** After redirects. What should be recorded as the source. */
  finalUrl: string;
};

export type FetchImageResult = { ok: true; image: FetchedImage } | { ok: false; reason: string };

class BlockedAddressError extends Error {
  constructor(readonly address: string) {
    super(`Refusing to connect to ${address}`);
    this.name = "BlockedAddressError";
  }
}

/**
 * dns.lookup, with every answer checked before it can be connected to. An
 * error here aborts the socket, which is the behaviour we want: no fallback,
 * no "try the next address".
 */
const guardedLookup: LookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void => {
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err, address);
      return;
    }

    if (Array.isArray(address)) {
      const blocked = address.find((entry) => isPrivateAddress(entry.address));
      if (blocked) {
        callback(new BlockedAddressError(blocked.address), []);
        return;
      }
      callback(null, address);
      return;
    }

    if (isPrivateAddress(address)) {
      callback(new BlockedAddressError(address), address, family);
      return;
    }
    callback(null, address, family);
  });
};

function parseHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // https only. Not http (downgradeable, and no reason to allow it), and
  // certainly not file:, data: or blob:.
  if (url.protocol !== "https:") return null;

  // A URL whose host is already an IP literal NEVER REACHES guardedLookup:
  // net.connect checks isIP() and skips the lookup entirely when it is one.
  // So https://127.0.0.1/x and https://[::1]/x would walk straight past the
  // only check in this file. They are caught here instead.
  const host = url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  if (isIP(host) !== 0 && isPrivateAddress(host)) return null;

  return url;
}

type Attempt = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | null;
  location: string | null;
};

function once(url: URL, maxBytes: number, timeoutMs: number): Promise<Attempt> {
  return new Promise<Attempt>((resolve, reject) => {
    const options: RequestOptions = {
      method: "GET",
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      lookup: guardedLookup,
      headers: {
        // No cookies, no Authorization, no forwarded credentials of any kind.
        accept: ACCEPTED_IMAGE_TYPES.join(","),
        "user-agent": "wedplan-moodboards/1.0",
        "accept-encoding": "identity",
      },
      timeout: timeoutMs,
    };

    const req = httpsRequest(options, (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;

      // Don't download the body of a redirect.
      if (status >= 300 && status < 400 && location) {
        res.resume();
        resolve({ status, headers: res.headers, body: null, location });
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        // The cap is enforced on bytes actually received. A declared
        // Content-Length is a claim, not a limit.
        if (total > maxBytes) {
          res.destroy();
          req.destroy();
          reject(new Error("TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({ status, headers: res.headers, body: Buffer.concat(chunks), location: null });
      });
      res.on("error", reject);
    });

    req.on("timeout", () => {
      req.destroy(new Error("TIMEOUT"));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Returns the bytes, or a reason that is safe to show someone. Never throws
 * for an expected failure — same posture as ActionResult.
 */
export async function fetchImage(
  rawUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<FetchImageResult> {
  const maxBytes = options?.maxBytes ?? MAX_SOURCE_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let url = parseHttpsUrl(rawUrl);
  if (!url) return { ok: false, reason: "That needs to be an https:// image address." };

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let attempt: Attempt;
    try {
      attempt = await once(url, maxBytes, timeoutMs);
    } catch (error) {
      if (error instanceof BlockedAddressError) {
        return { ok: false, reason: "That address isn't one this server will fetch from." };
      }
      const message = error instanceof Error ? error.message : "";
      if (message === "TOO_LARGE") return { ok: false, reason: "That image is too large." };
      if (message === "TIMEOUT") return { ok: false, reason: "That image took too long to load." };
      return { ok: false, reason: "That image couldn't be fetched." };
    }

    if (attempt.location) {
      // Resolved against the current URL, then put through the same checks
      // from the top — scheme included, since a redirect to http: or to a
      // private host is exactly how this defence gets walked around.
      const next = parseHttpsUrl(new URL(attempt.location, url).toString());
      if (!next) return { ok: false, reason: "That image redirected somewhere this won't follow." };
      url = next;
      continue;
    }

    if (attempt.status !== 200 || !attempt.body) {
      return { ok: false, reason: `That image returned ${attempt.status || "no response"}.` };
    }

    // The response decides what this is, not the URL's extension. A ".jpg"
    // that serves text/html is not an image.
    const header = attempt.headers["content-type"];
    const declared = (Array.isArray(header) ? header[0] : header)?.split(";")[0]?.trim().toLowerCase();
    if (!isAcceptedImageType(declared)) {
      return { ok: false, reason: "That address didn't return an image." };
    }

    return {
      ok: true,
      image: { bytes: attempt.body, contentType: declared, finalUrl: url.toString() },
    };
  }

  return { ok: false, reason: "That image redirected too many times." };
}
