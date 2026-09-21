import { Label } from "./section";
import { DressCodeTag, ShuttleLines } from "./event-inline";
import { FindInvitation } from "./find-invitation";
import type { DressCode } from "@/lib/site/dress-codes";
import type { CoachRun } from "@/server/queries/travel";
import { faqItems, groupByTag, rows, splitFaq, text } from "@/lib/site/sections";
import { formatDate, formatTime } from "@/lib/format";

/** Paragraphs from a textarea. Blank lines separate, single newlines do not. */
export function Prose({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-[1.0625rem] leading-relaxed text-ink">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export type PublicEvent = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  /** The dress code this event wears (spec 25 §4), rendered as a tag on it. */
  dress_code_id?: string | null;
};

/** Per-event extras live in the schedule payload keyed by event id (spec §6). */
function eventExtras(payload: unknown, eventId: string) {
  const perEvent = rows(payload, "events").find((row) => row["id"] === eventId) ?? null;
  return {
    dressCode: text(perEvent, "dress_code"),
    detail: text(perEvent, "detail"),
    mapUrl: text(perEvent, "map_url"),
    hideTime: perEvent?.["hide_time"] === true,
  };
}

/**
 * The schedule, grouped by day.
 *
 * Day headings are centred, the events beneath them are not: centred data is
 * unreadable, and a time next to a venue next to a dress code is data.
 */
export function Schedule({
  events,
  payload,
  timeZone,
  invitedEventIds,
  dressCodes = [],
  coachByEvent,
}: {
  events: PublicEvent[];
  payload: unknown;
  timeZone: string;
  /** Null when we do not know who is reading — then nothing is marked. */
  invitedEventIds: Set<string> | null;
  /** Spec 25 §6 — the tag goes on the event, not in a section of its own. */
  dressCodes?: DressCode[];
  coachByEvent?: Map<string, CoachRun[]>;
}) {
  const days = new Map<string, PublicEvent[]>();
  for (const event of events) {
    const day = event.starts_at ? formatDate(event.starts_at, timeZone) : "To be confirmed";
    const existing = days.get(day);
    if (existing) existing.push(event);
    else days.set(day, [event]);
  }

  return (
    <div className="space-y-10">
      {[...days.entries()].map(([day, dayEvents]) => (
        <div key={day}>
          <h3 className="text-center text-[0.78rem] uppercase tracking-[0.18em] text-muted">
            {day}
          </h3>
          <ul className="mt-5 space-y-6">
            {dayEvents.map((event) => {
              const extras = eventExtras(payload, event.id);
              // Events the household is not invited to stay listed and are
              // marked, rather than hidden. Hiding them produces the worse
              // conversation: somebody mentions the dinner and a guest who was
              // not invited discovers it was concealed.
              const notInvited = invitedEventIds !== null && !invitedEventIds.has(event.id);
              return (
                <li key={event.id} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-xl text-ink">{event.name}</p>
                    {event.starts_at && !extras.hideTime ? (
                      <Label>{formatTime(event.starts_at, timeZone)}</Label>
                    ) : null}
                  </div>
                  {event.venue ? <p className="mt-1 text-[1.0625rem] text-ink">{event.venue}</p> : null}
                  {event.address ? <p className="text-[0.95rem] text-muted">{event.address}</p> : null}
                  {/* The shuttle that gets them here, then what to wear when
                      they arrive — both answered where the question is asked
                      rather than two sections away (spec 25 §6). */}
                  <ShuttleLines runs={coachByEvent?.get(event.id) ?? []} timeZone={timeZone} />
                  <DressCodeTag event={event} codes={dressCodes} fallback={extras.dressCode} />
                  {extras.detail ? (
                    <p className="mt-2 whitespace-pre-line text-[0.95rem] text-muted">{extras.detail}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {extras.mapUrl ? (
                      <a
                        className="text-[0.9rem] text-accent underline underline-offset-2"
                        href={extras.mapUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Map
                      </a>
                    ) : null}
                    {event.starts_at ? (
                      <a
                        className="text-[0.9rem] text-accent underline underline-offset-2"
                        href={`/api/public/events/${event.id}/ics`}
                      >
                        Add to calendar
                      </a>
                    ) : null}
                  </div>
                  {notInvited ? (
                    <p className="mt-2 text-[0.85rem] italic text-muted">
                      Invitation only — this one isn&rsquo;t on your invitation.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A question and its answer. Native <details> so it works without JavaScript. */
function FaqRow({ q, a, open }: { q: string; a: string; open: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-4">
      <summary className="cursor-pointer list-none text-[1.0625rem] text-ink marker:content-none">
        <span className="flex items-start justify-between gap-4">
          <span>{q}</span>
          <span className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-45" aria-hidden="true">
            +
          </span>
        </span>
      </summary>
      {a ? <div className="mt-3 whitespace-pre-line text-[1rem] leading-relaxed text-muted">{a}</div> : null}
    </details>
  );
}

/** Six open, the rest grouped and collapsed — Aisle's pattern, copied (§10). */
export function Faq({ payload }: { payload: unknown }) {
  const items = faqItems(payload);
  const { featured, rest } = splitFaq(items);
  const groups = groupByTag(rest);

  return (
    <div>
      <div>
        {featured.map((item) => (
          <FaqRow key={item.q} q={item.q} a={item.a} open />
        ))}
      </div>
      {groups.map((group) => (
        <div key={group.tag ?? "other"} className="mt-8">
          {group.tag ? (
            <h3 className="mb-1 text-center text-[0.78rem] uppercase tracking-[0.18em] text-muted">
              {group.tag}
            </h3>
          ) : null}
          {group.items.map((item) => (
            <FaqRow key={item.q} q={item.q} a={item.a} open={false} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Party({ payload }: { payload: unknown }) {
  const members = rows(payload, "members");
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {members.map((member, index) => {
        const name = text(member, "name");
        if (!name) return null;
        return (
          <li key={index}>
            <p className="text-lg text-ink">{name}</p>
            {text(member, "role") ? <Label>{text(member, "role")}</Label> : null}
            {text(member, "blurb") ? (
              <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{text(member, "blurb")}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ThingsToDo({ payload }: { payload: unknown }) {
  const items = rows(payload, "items");
  return (
    <ul className="space-y-6">
      {items.map((item, index) => {
        const title = text(item, "title");
        if (!title) return null;
        const link = text(item, "link");
        return (
          <li key={index} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
            <p className="text-lg text-ink">{title}</p>
            {text(item, "body") ? (
              <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted">{text(item, "body")}</p>
            ) : null}
            {link ? (
              <a
                className="mt-1.5 inline-block text-[0.9rem] text-accent underline underline-offset-2"
                href={link}
                rel="noreferrer noopener"
                target="_blank"
              >
                More
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function Story({ payload }: { payload: unknown }) {
  const body = text(payload, "body");
  const milestones = rows(payload, "milestones");
  return (
    <div className="space-y-8">
      {body ? <Prose body={body} /> : null}
      {milestones.length > 0 ? (
        <ol className="space-y-6">
          {milestones.map((milestone, index) => {
            const title = text(milestone, "title");
            if (!title) return null;
            return (
              <li key={index} className="border-l border-line pl-5">
                {text(milestone, "date") ? <Label>{text(milestone, "date")}</Label> : null}
                <p className="text-lg text-ink">{title}</p>
                {text(milestone, "body") ? (
                  <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">
                    {text(milestone, "body")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * The RSVP pointer (§3). The form itself is at /rsvp/[token] — this section is
 * a signpost, and for a guest who has lost their link, the way back to it.
 */
export function RsvpPointer({ payload }: { payload: unknown }) {
  const intro =
    text(payload, "intro") ??
    "Your invitation has a link that's personal to your household — it's how we know who's replying.";
  const closes = text(payload, "closes_label");

  return (
    <div className="text-center">
      <p className="mx-auto max-w-prose text-[1.0625rem] leading-relaxed text-ink">{intro}</p>
      {closes ? <p className="mt-3 text-[0.95rem] text-muted">{closes}</p> : null}
      <FindInvitation />
    </div>
  );
}
