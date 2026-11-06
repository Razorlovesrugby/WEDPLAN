/**
 * Self-serve onboarding, and the account/timezone/currency settings around it
 * (spec 40). Pure, so the rules a stranger's sign-up is held to are unit-tested
 * rather than living inside a "use server" action.
 */
import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Passwords (Q3: at least 8 characters, nothing else)
// ---------------------------------------------------------------------------

export const PASSWORD_MIN = 8;
/** Supabase/bcrypt read at most 72 bytes; refusing longer is kinder than truncating silently. */
export const PASSWORD_MAX = 72;

/** The one password rule, shared by /start, change password and /reset-password. Null when fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  return null;
}

const passwordField = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

// ---------------------------------------------------------------------------
// Currency (Q6: any code, a symbol only, always hundredths)
// ---------------------------------------------------------------------------

/** Shown first in every currency picker; the rest follow alphabetically. */
export const PINNED_CURRENCIES = ["NZD", "AUD", "USD", "GBP", "EUR", "CAD"] as const;

/** Every ISO 4217 code this runtime can print, pinned ones first. */
export function currencyOptions(): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  const pinned: string[] = [...PINNED_CURRENCIES];
  return [...pinned, ...all.filter((code) => !pinned.includes(code)).sort()];
}

export function isKnownCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if ((PINNED_CURRENCIES as readonly string[]).includes(code)) return true;
  if (typeof Intl.supportedValuesOf !== "function") return true; // the database check still holds
  return Intl.supportedValuesOf("currency").includes(code);
}

// ---------------------------------------------------------------------------
// Timezones (§7.1: a real picker, NZ and the browser's own zone first)
// ---------------------------------------------------------------------------

export const DEFAULT_TIME_ZONE = "Pacific/Auckland";

/** "UTC+13", "UTC−5", "UTC+5:30" — the zone's offset at `at`. */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  // "GMT+13:00" / "GMT-05:00" / "GMT"
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return "UTC";
  const [, sign, hh, mm] = match;
  if (hh === "00" && mm === "00") return "UTC";
  const hours = String(Number(hh));
  return `UTC${sign === "-" ? "−" : "+"}${hours}${mm === "00" ? "" : `:${mm}`}`;
}

/**
 * The picker's options: Pacific/Auckland, then `extraFirst` (the browser's own
 * zone, or the wedding's current one), then everything else alphabetically.
 */
export function timeZoneOptions(all: readonly string[], extraFirst: readonly (string | null | undefined)[] = []): string[] {
  const first = [DEFAULT_TIME_ZONE, ...extraFirst].filter(
    (tz, i, list): tz is string => !!tz && list.indexOf(tz) === i,
  );
  return [...first, ...all.filter((tz) => !first.includes(tz))];
}

// ---------------------------------------------------------------------------
// The /start form
// ---------------------------------------------------------------------------

/** Deliberately loose: Supabase is the real validator. This only catches typos. */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That doesn't look like an email address");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const weddingFields = {
  your_name: z.string().trim().min(1, "Tell us your name").max(80),
  partner_name: optionalText(80),
  partner_email: z
    .union([emailField, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  wedding_name: z.string().trim().min(1, "Give the wedding a name").max(120),
  wedding_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  timezone: z.string().trim().min(1, "Pick a timezone").refine(isValidTimeZone, "Pick a timezone from the list"),
  currency: z.string().trim().toUpperCase().refine(isKnownCurrency, "Pick a currency from the list"),
  capacity: z
    .union([z.coerce.number().int().min(1).max(5000), z.literal("")])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
};

/** A stranger signing up: the account fields are required. */
export const startSchema = z
  .object({
    ...weddingFields,
    email: emailField,
    password: passwordField,
    password_again: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.password_again) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password_again"], message: "The two passwords don't match" });
    }
    if (value.partner_email && value.partner_email === value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["partner_email"],
        message: "Your partner needs their own email address",
      });
    }
  });

/** Someone already signed in with no wedding (an orphaned login): no account fields. */
export const startSignedInSchema = z.object(weddingFields);

export type StartInput = z.infer<typeof startSchema>;
export type StartSignedInInput = z.infer<typeof startSignedInSchema>;

/** "Sam & Alex" from the two names, for the wedding-name field's first value. */
export function defaultWeddingName(yourName: string, partnerName: string | null | undefined): string {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
  const you = first(yourName);
  const them = partnerName ? first(partnerName) : "";
  if (you && them) return `${you} & ${them}`;
  return you ? `${you}'s wedding` : "";
}

/** The hidden field a person never sees. Anything in it means a bot filled the form. */
export const HONEYPOT_FIELD = "website";

export function isHoneypotTripped(fields: Record<string, unknown>): boolean {
  const value = fields[HONEYPOT_FIELD];
  return typeof value === "string" && value.trim() !== "";
}

/** "true", "1", "yes" (any case) turn /start on; anything else, including unset, keeps it closed. */
export function isOnboardingOpen(raw: string | undefined): boolean {
  return /^(true|1|yes|on)$/i.test((raw ?? "").trim());
}

/** Supabase's "this email already has an account", across the error shapes it has used. */
export function isEmailTaken(error: { code?: string | null; message?: string | null; status?: number | null }): boolean {
  if (error.code === "email_exists" || error.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(error.message ?? "");
}

// ---------------------------------------------------------------------------
// Throttle: sign-ups per IP
// ---------------------------------------------------------------------------

export const START_WINDOW_MINUTES = 60;
export const START_MAX_PER_WINDOW = 5;

/** Kept apart from the RSVP token throttle so sign-ups never lock a guest out of replying. */
export function startThrottleKey(ip: string): string {
  return `start:${ip}`;
}
