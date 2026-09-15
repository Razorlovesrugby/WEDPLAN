import { z } from "zod";

/**
 * Environment access, validated once at the edge of the process.
 *
 * Split deliberately into two objects. `clientEnv` holds only NEXT_PUBLIC_*
 * values, which Next.js inlines into the browser bundle. `serverEnv()` holds
 * the secrets and is a function rather than a constant so that merely
 * importing this module from a client component cannot pull a service role
 * key into the bundle — the call would fail at build time instead.
 */

/**
 * What went in, quoted, so the failure names the offending value instead of
 * leaving somebody to guess which of three variables it meant. These are
 * public values — the anon key and the site URL both ship to the browser —
 * so echoing them leaks nothing.
 */
function received(raw: string | undefined): string {
  return raw === undefined || raw.trim() === ""
    ? "it is not set"
    : `received ${JSON.stringify(raw)}`;
}

/**
 * One message for every way the site URL can be wrong, because the previous
 * one ("Invalid url") said nothing about which value or what shape it wanted,
 * and a build log is the only place anyone will read it.
 */
const SITE_URL_HELP =
  "must be the site's own origin, e.g. https://wedplan.vercel.app — " +
  `${received(process.env.NEXT_PUBLIC_SITE_URL)}. A bare hostname like ` +
  "wedplan.vercel.app is fine and gets https:// added. Set it in the Vercel " +
  "project under Settings → Environment Variables, for every environment " +
  "you deploy.";

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url(`must be the project URL from Supabase → Settings → API — ${received(process.env.NEXT_PUBLIC_SUPABASE_URL)}`),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z
    .string({ required_error: SITE_URL_HELP })
    .url(SITE_URL_HELP)
    // zod's .url() accepts any scheme, and this value ends up in magic-link
    // redirects, emailed RSVP links and printed QR codes, so it has to be one
    // a browser will actually follow.
    //
    // Tested as a string rather than with `new URL().protocol`: a refinement
    // still runs when .url() has already failed, so constructing a URL here
    // throws a raw "TypeError: Invalid URL" and buries the readable message
    // underneath a stack trace. A regex cannot throw.
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "must start with http:// or https://",
    }),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INVITE_TOKEN_PEPPER: z.string().min(32, "generate with: openssl rand -hex 32"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

function explain(error: z.ZodError, scope: string): never {
  const missing = error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid ${scope} environment:\n${missing}\n\nSee .env.example.`);
}

/**
 * The site's own origin, which has to be an absolute URL.
 *
 * `NEXT_PUBLIC_SITE_URL` is typed into a dashboard by a human, and every
 * dashboard that hands you a domain — Vercel's included — displays it as a
 * bare host: `wedplan.vercel.app`, no scheme. Pasting that produced a build
 * failure reading only "NEXT_PUBLIC_SITE_URL: Invalid url", which does not
 * say what was wrong with it or what it wanted instead.
 *
 * So a bare host is completed rather than rejected. That is not guesswork:
 * there is exactly one sensible scheme for a public wedding site, and it is
 * the one a browser would have used anyway. Localhost is the exception,
 * because nobody serves a dev box over TLS.
 *
 * Returns undefined for a blank value so the caller can fall through to the
 * next source rather than treating "" as a configured answer.
 */
export function normaliseOrigin(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (value === "") return undefined;

  // A bare host, optionally with a port, and nothing else. Only this shape is
  // completed — anything more complicated is handed to the validator exactly
  // as it arrived, so a genuinely broken value ("http://", "our site") is
  // still reported rather than patched into a URL that parses but is wrong.
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(value)) return value;

  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
  return `${local ? "http" : "https"}://${value}`;
}

/**
 * Where the site url comes from, in order of how much it should be trusted.
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — set deliberately, so it always wins. On a
 *    custom domain this is the only one that is right.
 * 2. `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` — the project's stable
 *    production domain, which Vercel exposes automatically.
 * 3. `NEXT_PUBLIC_VERCEL_URL` — this specific deployment. Last, because it
 *    changes with every push, and these URLs are emailed to guests and
 *    printed into QR codes: a link tied to one deployment is a link that
 *    stops working.
 *
 * All three are read by their full literal names. Next.js inlines
 * `process.env.NEXT_PUBLIC_*` only when it can see the name as written, and
 * `absoluteUrl` is called from a client component (the login form), so a
 * dynamic lookup here would compile to undefined in the browser.
 */
const siteUrl =
  normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
  normaliseOrigin(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ??
  normaliseOrigin(process.env.NEXT_PUBLIC_VERCEL_URL);

// Referenced by their full literal names so Next.js can statically inline them.
const parsedClient = clientSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: siteUrl,
});

export const clientEnv = parsedClient.success
  ? parsedClient.data
  : explain(parsedClient.error, "client");

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() was called in the browser — this is a server-only module.");
  }
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) explain(parsed.error, "server");
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** Absolute URL for a path, for links that leave the app (email, QR codes). */
export function absoluteUrl(path: string): string {
  const base = clientEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
