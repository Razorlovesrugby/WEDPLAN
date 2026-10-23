"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRsvp } from "@/server/actions/rsvp";
import { guestName } from "@/lib/format";
import {
  guestFacingStatus,
  householdReply,
  isNotComing,
  replyToAll,
  unansweredChips,
} from "@/lib/rsvp-household";
import { replyConfirmation, summariseReply } from "@/lib/site/reply-state";
import { withViewTransition } from "@/lib/view-transition";
import { PREVIEW_NOT_SENT } from "@/lib/site/preview-guard";
import { WeekendCalendar } from "@/components/site/weekend-calendar";
import { QuestionField, type AnswerValue } from "./question-field";
import { rsvpOffAttribute, type RsvpFeature } from "@/lib/site/rsvp-features";
import type {
  EventRow,
  GuestRow,
  RsvpAnswerRow,
  RsvpQuestionRow,
  RsvpRow,
  RsvpStatus,
} from "@/lib/types/database";

type GuestState = {
  guestId: string;
  name: string;
  dietary: string;
  accessibility: string;
  responses: Record<string, RsvpStatus>;
  answers: Record<string, AnswerValue>;
};

const CHOICES: { value: RsvpStatus; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function RsvpForm({
  token,
  guests,
  events,
  questions,
  rsvps,
  answers,
  locked,
  invites,
  weekend,
  replyBy,
  eventWhen,
  look = "inline",
  off = [],
}: {
  /**
   * The household's credential. **Null only in the editor's preview** (spec 28
   * §4.3): the form then works in every way except that "Send" says nothing
   * was sent and calls no action.
   */
  token: string | null;
  guests: GuestRow[];
  events: EventRow[];
  questions: RsvpQuestionRow[];
  rsvps: RsvpRow[];
  answers: RsvpAnswerRow[];
  locked: boolean;
  /**
   * Who is invited to what, within this household (spec 22 §6). A household
   * where the kids are not at the evening do gets a form that offers the
   * evening do to their parents and to nobody else.
   */
  invites: { guest_id: string; event_id: string }[];
  /** What the confirmation needs to offer their weekend as a calendar file. */
  weekend?: {
    timeZone: string;
    weddingName: string;
    weddingSlug: string;
    addressSegment: string | null;
    /** The preview's own calendar file; absent on a live page. */
    icsHref?: string;
  };
  /**
   * "Sat 13 Mar, 15:00" per event id, formatted on the server. Not formatted
   * here: Node's and the browser's Intl disagree on punctuation, and a client
   * component that formats a date hydrates with a mismatch.
   */
  eventWhen?: Record<string, string>;
  /** "1 May", or null when there is no lock date or the planner switched it off. */
  replyBy?: string | null;
  /** `inline` (the form as it always was) or `card` — the block's Look (spec 27 E1). */
  look?: string;
  /**
   * The block's switched-off features (spec 35, `rsvp-features.ts`). Each one
   * off puts back what the form did before that change. Empty: all on.
   */
  off?: readonly RsvpFeature[];
}) {
  const on = (feature: RsvpFeature) => !off.includes(feature);
  const offAttr = rsvpOffAttribute(off);
  const router = useRouter();
  // Once they have sent it, the form gives way to a card that says back what
  // they said (spec 27 §7). Both live in this component, so "Change my reply"
  // is a state change and not a navigation.
  const [view, setView] = useState<"form" | "done">("form");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Hand focus to the confirmation, so a screen reader announces it and a
    // keyboard user is not left on a button that has just disappeared.
    if (view === "done") headingRef.current?.focus();
  }, [view]);

  // One lookup rather than a filter per guest per event.
  const invitedPairs = new Set(invites.map((row) => `${row.guest_id}:${row.event_id}`));
  const eventsFor = (guestId: string) =>
    events.filter((event) => invitedPairs.has(`${guestId}:${event.id}`));
  const [state, setState] = useState<GuestState[]>(() =>
    guests.map((guest) => ({
      guestId: guest.id,
      name: guest.is_plus_one ? guestName(guest) : "",
      dietary: guest.dietary ?? "",
      accessibility: guest.accessibility ?? "",
      responses: Object.fromEntries(
        events
          .filter((event) => invites.some((i) => i.guest_id === guest.id && i.event_id === event.id))
          .map((event) => [
            event.id,
            guestFacingStatus(
              (rsvps.find((r) => r.guest_id === guest.id && r.event_id === event.id)?.status ??
                "pending") as RsvpStatus,
            ),
          ]),
      ),
      answers: Object.fromEntries(
        questions
          .filter((q) => q.scope === "guest")
          .map((q) => [
            q.id,
            toAnswerValue(
              answers.find((a) => a.question_id === q.id && a.guest_id === guest.id)?.value,
            ),
          ]),
      ),
    })),
  );

  const [householdAnswers, setHouseholdAnswers] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(
      questions
        .filter((q) => q.scope === "household")
        .map((q) => [
          q.id,
          toAnswerValue(answers.find((a) => a.question_id === q.id && a.household_id !== null)?.value),
        ]),
    ),
  );

  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  // Set by a send that stopped on an unanswered required chip question; from
  // then on each one says so until it is answered (spec 35 §6 item 7).
  const [showMissing, setShowMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateGuest(guestId: string, patch: Partial<GuestState>) {
    setState((prev) => prev.map((g) => (g.guestId === guestId ? { ...g, ...patch } : g)));
    setStatus("idle");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The browser has already checked the text boxes; the chips are ours.
    const firstMissing = missingKeys()[0];
    if (firstMissing) {
      setShowMissing(true);
      const group = event.currentTarget.querySelector<HTMLElement>(
        `[data-question="${firstMissing}"]`,
      );
      group?.scrollIntoView({ block: "center", behavior: "smooth" });
      group?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      return;
    }

    // No token, nothing to send with (the preview). Show the confirmation a
    // guest would get — it is part of what the planner is designing — and say
    // plainly that it was not real.
    if (token === null) {
      withViewTransition(() => {
        setStatus("saved");
        setView("done");
      });
      return;
    }

    startTransition(async () => {
      const result = await submitRsvp({
        token,
        guests: state.map((guest) => ({
          guestId: guest.guestId,
          name: guest.name || undefined,
          dietary: guest.dietary,
          accessibility: guest.accessibility,
          responses: Object.entries(guest.responses).map(([eventId, statusValue]) => ({
            eventId,
            status: statusValue,
          })),
          answers: guest.answers,
        })),
        householdAnswers,
      });

      if (result.ok) {
        setError(null);
        // A view transition where the browser has them: the form morphs into
        // the confirmation. Without, it simply swaps.
        withViewTransition(() => {
          setStatus("saved");
          setView("done");
        });
        // The page's reply bar says what they answered; make it re-read.
        router.refresh();
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  }

  const guestQuestions = questions.filter((q) => q.scope === "guest");
  const householdQuestions = questions.filter((q) => q.scope === "household");

  /**
   * Every required chip question nobody has answered, as the `data-question`
   * key its fieldset carries — `<guest id>-<question id>`, or
   * `household-<question id>`. Somebody who isn't coming is not asked, so
   * is not counted.
   */
  function missingKeys(): string[] {
    // Off, or without chips: the browser checks `required` itself, as before.
    if (!on("own_required_check") || !on("chips")) return [];
    const forGuests = state
      .filter((guest) => Object.keys(guest.responses).length > 0 && !skipped(guest.responses))
      .flatMap((guest) =>
        unansweredChips(guestQuestions, guest.answers).map((id) => `${guest.guestId}-${id}`),
      );
    const forHousehold = unansweredChips(householdQuestions, householdAnswers).map(
      (id) => `household-${id}`,
    );
    return [...forGuests, ...forHousehold];
  }
  const missing = new Set(showMissing ? missingKeys() : []);

  /** Not asked the rest: has said no to everything, and the switch is on. */
  function skipped(responses: Record<string, RsvpStatus>): boolean {
    return on("skip_not_coming") && isNotComing(responses);
  }

  const wording = on("new_wording");
  // What every field label looks like: the site's letterspaced label over a
  // ruled line, or the plain label over a box it had before.
  const fieldLabel = on("ruled_fields")
    ? "site-label mb-1 block text-muted"
    : "mb-1 block text-sm font-medium";
  const fieldClass = on("ruled_fields") ? "site-rsvp-input" : "field";
  const error_ = on("readable_text") ? "site-rsvp-error text-sm" : "text-sm text-red-700";

  if (locked) {
    return (
      on("soft_panels") ? (
        <div className="site-rsvp-sheet p-6 text-center sm:p-8" {...offAttr} data-own-ground="">
          <span className="site-label text-muted">Replies are closed</span>
          <p className="mt-3 text-[1.0625rem] leading-relaxed">
            RSVPs have closed, so this can no longer be changed. If something has come up, please
            get in touch with the couple directly.
          </p>
        </div>
      ) : (
        <div className="card p-5" {...offAttr} data-own-ground="">
          <p className="text-sm">
            RSVPs have closed, so this can no longer be changed. If something has come up, please
            get in touch with the couple directly.
          </p>
        </div>
      )
    );
  }

  /**
   * The form offers each person exactly the events they are invited to — and
   * a person invited to nothing does not appear at all (spec 22 §6, rule 3).
   *
   * Without this they rendered as a name with no questions under it and a
   * dietary box, which reads as "we forgot to invite you to anything" on a
   * page the whole household scrolls together. `resolve.ts` deliberately
   * returns every guest in the household, because the card and the greeting
   * need them; narrowing is this form's job.
   */
  const answering = state.filter((guest) => Object.keys(guest.responses).length > 0);

  if (answering.length === 0) {
    return (
      <p className="text-center text-[1.0625rem] text-muted">
        There&rsquo;s nothing to reply to yet — your invitation doesn&rsquo;t cover any events so
        far. Do get in touch with the couple if that looks wrong.
      </p>
    );
  }

  const collective = householdReply(answering.map((guest) => guest.responses));

  /**
   * One card click answers for everybody.
   *
   * It writes straight into the per-person rows rather than into a flag of
   * its own, so what the couple receives is the same shape whichever way the
   * guest answered, and a household that then changes one row is simply a
   * household whose cards are no longer lit.
   */
  function replyForEveryone(status: RsvpStatus) {
    setState((prev) => prev.map((guest) => ({ ...guest, responses: replyToAll(guest.responses, status) })));
    setStatus("idle");
  }

  if (view === "done") {
    const summary = summariseReply(
      answering.map((guestState) => {
        const guest = guests.find((g) => g.id === guestState.guestId)!;
        return {
          name: guest.preferred_name?.trim() || guest.first_name,
          responses: Object.values(guestState.responses),
        };
      }),
    );
    const { heading, lines } = replyConfirmation(summary);

    return (
      <div
        className={`site-rsvp-panel relative overflow-hidden text-center ${
          on("soft_panels") ? "site-rsvp-sheet p-8 sm:p-12" : "card p-8"
        }`}
        role="status"
        {...offAttr}
        data-own-ground=""
      >
        {/* A little celebration for a yes. Pure CSS, decorative, and only
            under the motion effect `reply_petals` (globals.css). */}
        {summary.coming.length > 0 ? <Petals /> : null}
        <svg
          className="site-check mx-auto h-14 w-14 text-accent"
          viewBox="0 0 56 56"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M17 29.5l7.5 7.5L40 21"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="site-heading mt-5 text-3xl leading-tight outline-none"
        >
          {heading}
        </h3>
        {lines.length > 0 ? (
          <ul className="mt-4 space-y-1 text-[1.0625rem] text-muted">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          {replyBy
            ? `You can change this until ${replyBy}.`
            : "Come back and change it whenever you need to."}
        </p>

        {/* Somebody who said yes is somebody who wants the weekend in their
            calendar, and this is the moment they are most likely to add it. */}
        {summary.coming.length > 0 && weekend ? (
          <WeekendCalendar
            events={events}
            timeZone={weekend.timeZone}
            weddingName={weekend.weddingName}
            weddingSlug={weekend.weddingSlug}
            addressSegment={weekend.addressSegment}
            icsHref={weekend.icsHref}
          />
        ) : null}

        {token === null ? (
          <p className="mt-4 text-sm font-medium text-muted">{PREVIEW_NOT_SENT}</p>
        ) : null}

        <button
          type="button"
          className={
            on("soft_panels")
              ? "mt-8 text-sm text-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-accent"
              : "mt-6 text-sm text-muted underline underline-offset-2"
          }
          onClick={() =>
            withViewTransition(() => {
              setStatus("idle");
              setView("form");
            })
          }
        >
          Change my reply
        </button>
      </div>
    );
  }

  // The Card look: one bordered card that says how far along they are. Same
  // fields, same actions — only the frame and the progress line differ.
  const answeredPeople = answering.filter((guestState) =>
    Object.values(guestState.responses).every((value) => value !== "pending"),
  ).length;
  const card = look === "card";
  const personCards = on("person_cards");

  return (
    <form
      onSubmit={onSubmit}
      data-look={look}
      {...offAttr}
      // Over a photograph, keeps the theme's ink rather than the forced cream.
      data-own-ground=""
      className={`site-rsvp-panel space-y-6 ${
        card
          ? on("soft_panels")
            ? "site-rsvp-sheet p-5 sm:p-8"
            : "site-rsvp-card border border-line p-5 sm:p-8"
          : ""
      }`}
    >
      {card ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="site-label text-muted">Your reply</span>
            <span className="text-sm text-muted" aria-live="polite">
              {answeredPeople} of {answering.length} answered
            </span>
          </div>
          {/* A line that fills as each person is answered for. It carries no
              information the sentence above does not, so it is hidden from
              assistive tech rather than read out twice. */}
          <div
            aria-hidden="true"
            className={
              on("soft_panels")
                ? "mt-3 h-[3px] w-full overflow-hidden rounded-full bg-line"
                : "mt-2 h-px w-full bg-line"
            }
          >
            <div
              className={
                on("soft_panels")
                  ? "h-full rounded-full bg-accent transition-[width] duration-[400ms] ease-out"
                  : "h-px bg-accent transition-[width] duration-[400ms]"
              }
              style={{ width: `${answering.length === 0 ? 0 : (answeredPeople / answering.length) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Most replies are "all of us" one way or the other. Asking for that
          one event at a time, per person, is twelve taps for one fact. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {(
          [
            {
              value: "yes",
              title: wording && answering.length === 1 ? "Yes, I'll be there" : "Yes, we'll be there",
              note: "We'll save you a seat",
            },
            { value: "no", title: wording ? "Sadly, can't make it" : "Not able to", note: "We'll miss you" },
          ] as const
        ).map((choice) => {
          const active = collective === choice.value;
          if (!on("answer_cards")) {
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() => replyForEveryone(choice.value)}
                className={`rounded border p-[26px_28px] text-left transition-colors ${
                  active ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-ink"
                }`}
              >
                <span className="site-heading block text-2xl">{choice.title}</span>
                <span className="site-label mt-2 block opacity-70">{choice.note}</span>
              </button>
            );
          }
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={active}
              data-reply={choice.value}
              onClick={() => replyForEveryone(choice.value)}
              className="site-rsvp-choice group flex items-center gap-4 p-5 text-left sm:p-6"
            >
              <span className="site-rsvp-choice-mark" aria-hidden="true">
                {choice.value === "yes" ? <HeartIcon /> : <WaveIcon />}
              </span>
              <span className="min-w-0">
                <span className="site-heading block text-2xl leading-tight">{choice.title}</span>
                <span className="site-label mt-1.5 block opacity-70">{choice.note}</span>
              </span>
            </button>
          );
        })}
      </div>

      {on("divider") ? (
        <p className="site-rsvp-divider site-label text-muted" aria-hidden="true">
          or answer one by one
        </p>
      ) : null}

      {answering.map((guestState, index) => {
        const guest = guests.find((g) => g.id === guestState.guestId)!;
        const title = guest.is_plus_one && !guest.last_name ? "Your guest" : guestName(guest);
        return (
          <fieldset
            key={guest.id}
            className={
              personCards ? "site-rsvp-sheet site-rsvp-guest p-5 sm:p-7" : "site-rsvp-guest card p-5"
            }
            style={{ ["--i" as string]: index }}
          >
            {personCards ? (
              <>
                <legend className="sr-only">{title}</legend>
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="site-rsvp-initial">{initialOf(guestState.name || title)}</span>
                  <span className="site-heading text-2xl leading-tight">{guestState.name || title}</span>
                </div>
              </>
            ) : (
              <legend className="px-1 font-serif text-lg">{title}</legend>
            )}

            {guest.is_plus_one ? (
              <label className={`${personCards ? "mt-5" : "mt-2"} block`}>
                <span className={fieldLabel}>Their name</span>
                <input
                  value={guestState.name}
                  onChange={(e) => updateGuest(guest.id, { name: e.target.value })}
                  placeholder="So we can write their place card"
                  className={fieldClass}
                />
              </label>
            ) : null}

            <ul
              className={
                personCards ? "mt-5 divide-y divide-line border-y border-line" : "mt-4 space-y-3"
              }
            >
              {eventsFor(guest.id).map((event) => (
                <li
                  key={event.id}
                  className={
                    personCards
                      ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5"
                      : "flex flex-wrap items-center justify-between gap-2"
                  }
                >
                  <span className="min-w-0">
                    <span className={personCards ? "block text-[1.0625rem]" : "block text-sm"}>
                      {event.name}
                    </span>
                    {on("event_times") && eventWhen?.[event.id] ? (
                      <span className="site-label mt-0.5 block text-muted">{eventWhen[event.id]}</span>
                    ) : null}
                  </span>
                  <div
                    className={on("pill_toggles") ? "site-rsvp-toggle" : "flex gap-1"}
                    role="radiogroup"
                    aria-label={`${guestName(guest)} — ${event.name}`}
                    data-value={guestState.responses[event.id]}
                  >
                    {CHOICES.map((choice) => {
                      const active = guestState.responses[event.id] === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() =>
                            updateGuest(guest.id, {
                              responses: { ...guestState.responses, [event.id]: choice.value },
                            })
                          }
                          className={
                            on("pill_toggles")
                              ? undefined
                              : `rounded border px-3 py-1.5 text-sm ${
                                  active
                                    ? "border-ink bg-ink text-white"
                                    : "border-line bg-white hover:bg-line/40"
                                }`
                          }
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>

            {/* Somebody who has said no to everything is not asked for a meal
                or dietary needs (spec 35 Q2). The fields unmount, so nothing
                hidden can block the send, but what they typed stays in state
                and comes back if they switch an event to yes. */}
            {skipped(guestState.responses) ? (
              <p className="pt-4 text-[0.95rem] italic text-muted">
                Not coming, so there&rsquo;s nothing more to ask. Switch an event to Yes to
                change that.
              </p>
            ) : (
              <div className={personCards ? "space-y-5 pt-5" : "space-y-3 pt-4"}>
                <label className="block">
                  <span className={fieldLabel}>Dietary requirements</span>
                  <input
                    value={guestState.dietary}
                    onChange={(e) => updateGuest(guest.id, { dietary: e.target.value })}
                    placeholder="Vegetarian, coeliac, allergies — anything the kitchen should know"
                    className={fieldClass}
                  />
                </label>

                <label className="block">
                  <span className={fieldLabel}>Anything else we should arrange?</span>
                  <input
                    value={guestState.accessibility}
                    onChange={(e) => updateGuest(guest.id, { accessibility: e.target.value })}
                    placeholder="Step-free access, a seat near the front, a high chair…"
                    className={fieldClass}
                  />
                </label>

                {guestQuestions.map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    idPrefix={guest.id}
                    chips={on("chips")}
                    ruled={on("ruled_fields")}
                    ownCheck={on("own_required_check")}
                    missing={missing.has(`${guest.id}-${question.id}`)}
                    value={guestState.answers[question.id]}
                    onChange={(value) =>
                      updateGuest(guest.id, {
                        answers: { ...guestState.answers, [question.id]: value },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
        );
      })}

      {householdQuestions.length > 0 ? (
        <fieldset className={personCards ? "site-rsvp-sheet p-5 sm:p-7" : "card p-5"}>
          {personCards ? (
            <>
              <legend className="sr-only">A few last things</legend>
              <span className="site-heading block text-2xl leading-tight" aria-hidden="true">
                A few last things
              </span>
            </>
          ) : (
            <legend className="px-1 font-serif text-lg">A few last things</legend>
          )}
          <div className={personCards ? "space-y-5 pt-5" : "space-y-3 pt-1"}>
            {householdQuestions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                idPrefix="household"
                chips={on("chips")}
                ruled={on("ruled_fields")}
                ownCheck={on("own_required_check")}
                missing={missing.has(`household-${question.id}`)}
                value={householdAnswers[question.id]}
                onChange={(value) =>
                  setHouseholdAnswers((prev) => ({ ...prev, [question.id]: value }))
                }
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <div
        className={
          on("pill_button")
            ? "flex flex-col items-center gap-3 pt-2 text-center"
            : "flex flex-wrap items-center gap-3"
        }
      >
        <button
          type="submit"
          className={on("pill_button") ? "site-rsvp-submit" : "btn-primary"}
          disabled={pending}
        >
          <span>
            {wording
              ? pending
                ? "Sending…"
                : answering.length > 1
                  ? "Send our reply"
                  : "Send my reply"
              : pending
                ? "Saving…"
                : "Confirm our RSVP"}
          </span>
          {pending || !on("pill_button") ? null : (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true" focusable="false">
              <path d="M4 10h11m-4-4.5L15.5 10 11 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        {missing.size > 0 ? (
          <span className="site-rsvp-missing text-sm" role="alert">
            {missing.size === 1
              ? "One question still needs an answer."
              : `${missing.size} questions still need an answer.`}
          </span>
        ) : null}
        {status === "error" && error ? (
          <span className={error_} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "·";
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" focusable="false">
      <path
        d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" focusable="false">
      <path
        d="M4 12c2-3 4-3 6 0s4 3 6 0 4-3 4-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Twelve petals that fall once behind the confirmation. Decorative only. */
function Petals() {
  return (
    <span className="site-petals" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ ["--p" as string]: i }} />
      ))}
    </span>
  );
}

/**
 * A stored answer back into form state.
 *
 * jsonb round-trips as whatever was written: a string for most types, an
 * array for multi_select. Anything else (a number, a null) becomes an empty
 * string rather than rendering "null" into the box the guest is looking at.
 */
function toAnswerValue(value: unknown): AnswerValue {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
