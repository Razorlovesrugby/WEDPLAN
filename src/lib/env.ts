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

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
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

// Referenced by their full literal names so Next.js can statically inline them.
const parsedClient = clientSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
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
