/**
 * Event types and the switches an event carries (spec 51).
 *
 * A type only PRESETS an event's switches when the event is created; after
 * that the event's own switches are the truth and nothing reads the type to
 * decide behaviour. These are the nine built-ins of §4.2 (the migration's
 * seed is the same list) and the rules of §4.4.
 */

export type EventFeatures = {
  asks_rsvp: boolean;
  has_seating: boolean;
  guest_facing: boolean;
  is_main: boolean;
};

export type BuiltinEventType = EventFeatures & { key: string; name: string };

export const BUILTIN_EVENT_TYPES: readonly BuiltinEventType[] = [
  { key: "ceremony", name: "Ceremony", asks_rsvp: true, has_seating: false, guest_facing: true, is_main: true },
  { key: "reception", name: "Reception", asks_rsvp: true, has_seating: true, guest_facing: true, is_main: true },
  {
    key: "ceremony_reception",
    name: "Ceremony & reception",
    asks_rsvp: true,
    has_seating: true,
    guest_facing: true,
    is_main: true,
  },
  {
    key: "rehearsal_dinner",
    name: "Rehearsal dinner",
    asks_rsvp: true,
    has_seating: true,
    guest_facing: true,
    is_main: false,
  },
  { key: "welcome_drinks", name: "Welcome drinks", asks_rsvp: true, has_seating: false, guest_facing: true, is_main: false },
  { key: "after_party", name: "After party", asks_rsvp: false, has_seating: false, guest_facing: true, is_main: false },
  {
    key: "recovery_brunch",
    name: "Recovery brunch",
    asks_rsvp: true,
    has_seating: false,
    guest_facing: true,
    is_main: false,
  },
  {
    key: "getting_ready",
    name: "Getting ready / photos",
    asks_rsvp: false,
    has_seating: false,
    guest_facing: false,
    is_main: false,
  },
  { key: "other", name: "Other", asks_rsvp: true, has_seating: false, guest_facing: true, is_main: false },
];

export const EVENT_TYPE_NAME_MAX = 40;

/** What a new custom type starts from: Other's defaults. */
export const OTHER_DEFAULTS: EventFeatures = {
  asks_rsvp: true,
  has_seating: false,
  guest_facing: true,
  is_main: false,
};

/** Case and spacing ignored, as the unique index on event_types does. */
export function normaliseTypeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function typeNameKey(name: string): string {
  return normaliseTypeName(name).toLowerCase();
}

/** True when a name is free among the wedding's types (optionally ignoring one). */
export function typeNameAvailable(name: string, existing: { id: string; name: string }[], exceptId?: string): boolean {
  const key = typeNameKey(name);
  return !existing.some((t) => t.id !== exceptId && typeNameKey(t.name) === key);
}

/**
 * Make a set of switches consistent, by the rules of §4.4:
 * - not guest-facing: cannot ask for replies or be the main event;
 * - a main event must ask for replies.
 *
 * `is_public` is included for events (an event that isn't guest-facing is not
 * on the public site either); pass nothing for a type's defaults.
 */
export function normaliseFeatures<T extends EventFeatures & { is_public?: boolean }>(input: T): T {
  const out = { ...input };
  if (!out.guest_facing) {
    out.asks_rsvp = false;
    out.is_main = false;
    if ("is_public" in out) out.is_public = false;
  }
  if (out.is_main) out.asks_rsvp = true;
  return out;
}

/** Why a switch is disabled given the others, for the form (§5). Null = free. */
export function disabledReason(
  field: "asks_rsvp" | "is_public" | "is_main",
  f: EventFeatures,
): string | null {
  if (!f.guest_facing) {
    if (field === "asks_rsvp") return "A just-us event can't ask for replies";
    if (field === "is_public") return "A just-us event isn't on the public site";
    if (field === "is_main") return "A just-us event can't be the main event";
  }
  if (field === "asks_rsvp" && f.is_main) return "A main event asks for replies";
  return null;
}

/** The "No RSVP" / "Just us" note on the events list, or null. */
export function featureNote(e: Pick<EventFeatures, "asks_rsvp" | "guest_facing">): string | null {
  if (!e.guest_facing) return "Just us";
  if (!e.asks_rsvp) return "No RSVP";
  return null;
}
