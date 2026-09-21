/**
 * Dress codes as records (spec 25 §4).
 *
 * A code is a named thing — "Formal summer" — with labelled guidance under it
 * and, optionally, a moodboard. An event points at one, and that single
 * relationship is what lets the same record render in two places:
 *
 *   on the schedule   as a tag inside the event, where somebody reading about
 *                     the Welcome Dinner is already looking
 *   in the attire     in full, listing the events it covers
 *
 * **The event list is a reverse lookup, never a typed field.** That is the
 * point. A typed list is a second copy of the truth, and a second copy is one
 * that disagrees the first time somebody changes an event's code and forgets
 * to come back here.
 *
 * Nothing in this file talks to the database: it is given rows and returns
 * what to draw, which is what makes it testable and what keeps the rule in one
 * place rather than in each of the two renderers.
 */

export type DressCode = {
  id: string;
  name: string;
  board_id: string | null;
  sort_order: number;
};

export type DressCodeNote = {
  id: string;
  dress_code_id: string;
  label: string;
  body: string | null;
  board_id: string | null;
  sort_order: number;
};

/** The labels a new code is pre-filled with (spec 25 Answered, question 1). */
export const DEFAULT_NOTE_LABELS = ["For her", "For him"] as const;

export type ResolvedDressCode = DressCode & {
  notes: DressCodeNote[];
  /** The events wearing it, in the order the schedule shows them. */
  events: { id: string; name: string }[];
};

type EventLike = { id: string; name: string; dress_code_id?: string | null };

/**
 * Every code, with its notes and the events that point at it.
 *
 * Codes with no events are kept: a planner adding "Black tie" before assigning
 * it to anything should see it in the editor rather than watch it vanish. The
 * *renderer* decides whether an unassigned code is worth a guest's attention.
 */
export function resolveDressCodes(
  codes: DressCode[],
  notes: DressCodeNote[],
  events: EventLike[],
): ResolvedDressCode[] {
  const notesByCode = new Map<string, DressCodeNote[]>();
  for (const note of notes) {
    const list = notesByCode.get(note.dress_code_id);
    if (list) list.push(note);
    else notesByCode.set(note.dress_code_id, [note]);
  }

  const eventsByCode = new Map<string, { id: string; name: string }[]>();
  for (const event of events) {
    if (!event.dress_code_id) continue;
    const list = eventsByCode.get(event.dress_code_id);
    if (list) list.push({ id: event.id, name: event.name });
    else eventsByCode.set(event.dress_code_id, [{ id: event.id, name: event.name }]);
  }

  const byOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
    a.sort_order - b.sort_order;

  return [...codes].sort(byOrder).map((code) => ({
    ...code,
    notes: (notesByCode.get(code.id) ?? []).slice().sort(byOrder),
    events: eventsByCode.get(code.id) ?? [],
  }));
}

/**
 * The code an event wears, or null. Used for the tag on the schedule.
 *
 * Takes only the pointer, not a whole event: the tag renderer has an id and a
 * `dress_code_id` and should not have to invent a name to ask this question.
 */
export function eventDressCode(
  event: { dress_code_id?: string | null },
  codes: DressCode[],
): DressCode | null {
  if (!event.dress_code_id) return null;
  return codes.find((code) => code.id === event.dress_code_id) ?? null;
}

/**
 * "For Welcome Dinner, Farewell Brunch" — the line under a code's name.
 *
 * Returns null rather than an empty string when a code covers nothing, so the
 * renderer can leave the line out entirely instead of drawing an orphaned
 * "For".
 */
export function coverageLabel(code: ResolvedDressCode): string | null {
  if (code.events.length === 0) return null;
  return code.events.map((event) => event.name).join(", ");
}

/**
 * The codes worth showing a guest, given the events that guest can see.
 *
 * On a household's page the schedule is already filtered to their events
 * (spec 22), and a code covering only the brunch they are not invited to is
 * noise at best and a disclosure at worst — it names an event they were not
 * told about. A code covering nothing visible is dropped; a code covering
 * nothing at all is kept, because it is the planner's own general guidance.
 */
export function visibleDressCodes(
  codes: ResolvedDressCode[],
  visibleEventIds: Set<string> | null,
): ResolvedDressCode[] {
  if (!visibleEventIds) return codes;
  return codes.flatMap((code) => {
    if (code.events.length === 0) return [code];
    const events = code.events.filter((event) => visibleEventIds.has(event.id));
    return events.length > 0 ? [{ ...code, events }] : [];
  });
}
