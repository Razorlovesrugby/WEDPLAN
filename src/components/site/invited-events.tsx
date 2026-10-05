import { stagger } from "./stagger";
import { formatDate, formatTime } from "@/lib/format";
import { invitedForLine, listNames } from "@/lib/invites";
import { Label } from "./section";
import { DressCodeTag, EditorialEventRow, ShuttleLines } from "./event-inline";
import { EventNote } from "./event-note";
import type { DressCode } from "@/lib/site/dress-codes";
import type { CoachRun } from "@/server/queries/travel";
import type { ThemePresetId } from "@/lib/theme/presets";
import { isEditorialFamily } from "@/lib/theme/presets";

/**
 * The events this household is invited to, with who each one is for
 * (spec 22 §6).
 *
 * Two rules this component exists to hold:
 *
 *   An event nobody here is invited to is not rendered at all. The caller has
 *   already narrowed the list; this never receives one.
 *
 *   An event only some of them are invited to says who it IS for, and never
 *   who it is not. "For Chidi and Ada", full stop — this page is as likely to
 *   be scrolled by the child as by the parent, and a line naming the party
 *   they are not at is one the couple cannot take back.
 */
export function InvitedEvents({
  events,
  members,
  invitedByEvent,
  timeZone,
  dressCodes = [],
  coachByEvent,
  preset = "script",
  look = "list",
}: {
  events: {
    id: string;
    name: string;
    starts_at: string | null;
    venue: string | null;
    address: string | null;
    dress_code_id?: string | null;
    /** The couple's note for guests invited to this event (spec 21 §5.4). */
    guest_note?: string | null;
  }[];
  members: { id: string; name: string }[];
  /** Guest ids invited to each event id. */
  invitedByEvent: Map<string, Set<string>>;
  timeZone: string;
  /**
   * Spec 25 §6, on the personalised page too. The shared site and a
   * household's own page must agree about an event — the same component draws
   * both, so the shuttle cannot quietly stop appearing on one of them.
   */
  dressCodes?: DressCode[];
  coachByEvent?: Map<string, CoachRun[]>;
  /**
   * Editorial lays a row out as three columns — time, event, dress code —
   * where Script stacks them. That is a different markup tree rather than a
   * restyled one, so it is a branch here and not a rule in `globals.css`.
   */
  preset?: ThemePresetId;
  /** `list`, `timeline` or `cards` — the block's Look (spec 27 E1). */
  look?: string;
}) {
  const editorial = isEditorialFamily(preset);

  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const day = event.starts_at ? formatDate(event.starts_at, timeZone) : "To be confirmed";
    const existing = byDay.get(day);
    if (existing) existing.push(event);
    else byDay.set(day, [event]);
  }

  return (
    <div className="space-y-10" data-look={look}>
      {[...byDay.entries()].map(([day, dayEvents]) => (
        <div key={day}>
          <h3 className="site-h3 text-center text-[0.78rem] uppercase tracking-[0.18em] text-muted">
            {day}
          </h3>
          <ul className={editorial ? "site-stagger mt-5" : "site-stagger mt-5 space-y-6"}>
            {dayEvents.map((event, index) => {
              const invited = invitedByEvent.get(event.id) ?? new Set<string>();
              const forLine = invitedForLine(members, invited);
              const time = event.starts_at ? <Label>{formatTime(event.starts_at, timeZone)}</Label> : null;
              const where = (
                <>
                  {event.venue ? (
                    <p className="site-event-detail mt-1 text-[1.0625rem] text-ink">{event.venue}</p>
                  ) : null}
                  {event.address ? (
                    <p className="site-event-detail text-[0.95rem] text-muted">{event.address}</p>
                  ) : null}
                </>
              );
              // The planner's note for this event: parking, timings, what happens
              // when. It lives here, under its own venue, so a guest never has to
              // match an event to a second list further down (spec 28 §5.3).
              const note = event.guest_note?.trim() ? <EventNote text={event.guest_note.trim()} /> : null;
              const shuttle = (
                <ShuttleLines runs={coachByEvent?.get(event.id) ?? []} timeZone={timeZone} />
              );
              const who = forLine ? (
                <p className="mt-2 text-[0.95rem] text-muted">{forLine}</p>
              ) : null;

              if (editorial) {
                return (
                  <EditorialEventRow
                    key={event.id}
                    index={index}
                    time={time}
                    name={event.name}
                    aside={<DressCodeTag event={event} codes={dressCodes} />}
                  >
                    {where}
                    {note}
                    {shuttle}
                    {who}
                  </EditorialEventRow>
                );
              }

              return (
                <li
                  key={event.id}
                  style={stagger(index)}
                  className="border-t border-line pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-xl text-ink">{event.name}</p>
                    {time}
                  </div>
                  {where}
                  {note}
                  {who}
                  {shuttle}
                  <DressCodeTag event={event} codes={dressCodes} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Chidi and Ada", for the line above a narrowed RSVP form. */
export function invitedNames(members: { id: string; name: string }[], invited: Set<string>): string {
  return listNames(members.filter((member) => invited.has(member.id)).map((member) => member.name));
}
