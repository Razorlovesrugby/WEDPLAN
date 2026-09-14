import type { CookieOptions } from "@supabase/ssr";

/**
 * The shape @supabase/ssr hands to `setAll`. Declared here rather than
 * inlined at both call sites so the two clients cannot drift apart.
 */
export type CookieToSet = { name: string; value: string; options?: CookieOptions };
