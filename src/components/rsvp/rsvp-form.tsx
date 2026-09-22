"use client";

import { useState, useTransition } from "react";
import { submitRsvp } from "@/server/actions/rsvp";
import { guestName } from "@/lib/format";
import { householdReply, replyToAll } from "@/lib/rsvp-household";
import { QuestionField, type AnswerValue } from "./question-field";
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
  { value: "maybe", label: "Maybe" },
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
}: {
  token: string;
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
}) {
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
            (rsvps.find((r) => r.guest_id === guest.id && r.event_id === event.id)?.status ??
              "pending") as RsvpStatus,
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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateGuest(guestId: string, patch: Partial<GuestState>) {
    setState((prev) => prev.map((g) => (g.guestId === guestId ? { ...g, ...patch } : g)));
    setStatus("idle");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
    });
  }

  const guestQuestions = questions.filter((q) => q.scope === "guest");
  const householdQuestions = questions.filter((q) => q.scope === "household");

  if (locked) {
    return (
      <div className="card p-5">
        <p className="text-sm">
          RSVPs have closed, so this can no longer be changed. If something has come up, please
          get in touch with the couple directly.
        </p>
      </div>
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Most replies are "all of us" one way or the other. Asking for that
          one event at a time, per person, is twelve taps for one fact. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        {(
          [
            { value: "yes", title: "Yes, we'll be there", note: "We'll save you a seat" },
            { value: "no", title: "Not able to", note: "We'll miss you" },
          ] as const
        ).map((card) => {
          const active = collective === card.value;
          return (
            <button
              key={card.value}
              type="button"
              aria-pressed={active}
              onClick={() => replyForEveryone(card.value)}
              className={`rounded border p-[26px_28px] text-left transition-colors ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white hover:border-ink"
              }`}
            >
              <span className="site-heading block text-2xl">{card.title}</span>
              <span className="site-label mt-2 block opacity-70">{card.note}</span>
            </button>
          );
        })}
      </div>

      {answering.map((guestState) => {
        const guest = guests.find((g) => g.id === guestState.guestId)!;
        return (
          <fieldset key={guest.id} className="card p-5">
            <legend className="px-1 font-serif text-lg">
              {guest.is_plus_one && !guest.last_name ? "Your guest" : guestName(guest)}
            </legend>

            {guest.is_plus_one ? (
              <label className="mt-2 block">
                <span className="mb-1 block text-sm font-medium">Their name</span>
                <input
                  value={guestState.name}
                  onChange={(e) => updateGuest(guest.id, { name: e.target.value })}
                  placeholder="So we can write their place card"
                  className="field"
                />
              </label>
            ) : null}

            <div className="mt-4 space-y-3">
              {eventsFor(guest.id).map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{event.name}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={`${guestName(guest)} — ${event.name}`}>
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
                          className={`rounded border px-3 py-1.5 text-sm ${
                            active
                              ? "border-ink bg-ink text-white"
                              : "border-line bg-white hover:bg-line/40"
                          }`}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium">Dietary requirements</span>
              <input
                value={guestState.dietary}
                onChange={(e) => updateGuest(guest.id, { dietary: e.target.value })}
                placeholder="Vegetarian, coeliac, allergies — anything the kitchen should know"
                className="field"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">Anything else we should arrange?</span>
              <input
                value={guestState.accessibility}
                onChange={(e) => updateGuest(guest.id, { accessibility: e.target.value })}
                placeholder="Step-free access, a seat near the front, a high chair…"
                className="field"
              />
            </label>

            {guestQuestions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                idPrefix={guest.id}
                value={guestState.answers[question.id]}
                onChange={(value) =>
                  updateGuest(guest.id, {
                    answers: { ...guestState.answers, [question.id]: value },
                  })
                }
              />
            ))}
          </fieldset>
        );
      })}

      {householdQuestions.length > 0 ? (
        <fieldset className="card p-5">
          <legend className="px-1 font-serif text-lg">A few last things</legend>
          {householdQuestions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              idPrefix="household"
              value={householdAnswers[question.id]}
              onChange={(value) =>
                setHouseholdAnswers((prev) => ({ ...prev, [question.id]: value }))
              }
            />
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Confirm our RSVP"}
        </button>
        {status === "saved" ? (
          <span className="text-sm text-tierA">
            Saved, thank you. Come back and change it whenever.
          </span>
        ) : null}
        {status === "error" && error ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
    </form>
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
