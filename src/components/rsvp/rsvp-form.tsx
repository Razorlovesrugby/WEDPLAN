"use client";

import { useState, useTransition } from "react";
import { submitRsvp } from "@/server/actions/rsvp";
import { guestName } from "@/lib/format";
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
  answers: Record<string, string>;
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
}: {
  token: string;
  guests: GuestRow[];
  events: EventRow[];
  questions: RsvpQuestionRow[];
  rsvps: RsvpRow[];
  answers: RsvpAnswerRow[];
  locked: boolean;
}) {
  const [state, setState] = useState<GuestState[]>(() =>
    guests.map((guest) => ({
      guestId: guest.id,
      name: guest.is_plus_one ? guestName(guest) : "",
      dietary: guest.dietary ?? "",
      accessibility: guest.accessibility ?? "",
      responses: Object.fromEntries(
        events.map((event) => [
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
            String(
              answers.find((a) => a.question_id === q.id && a.guest_id === guest.id)?.value ?? "",
            ),
          ]),
      ),
    })),
  );

  const [householdAnswers, setHouseholdAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions
        .filter((q) => q.scope === "household")
        .map((q) => [
          q.id,
          String(answers.find((a) => a.question_id === q.id && a.household_id !== null)?.value ?? ""),
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {state.map((guestState) => {
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
              {events.map((event) => (
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
              <label key={question.id} className="mt-3 block">
                <span className="mb-1 block text-sm font-medium">
                  {question.label}
                  {question.required ? <span aria-hidden> *</span> : null}
                </span>
                <input
                  required={question.required}
                  value={guestState.answers[question.id] ?? ""}
                  onChange={(e) =>
                    updateGuest(guest.id, {
                      answers: { ...guestState.answers, [question.id]: e.target.value },
                    })
                  }
                  className="field"
                />
                {question.help_text ? (
                  <span className="mt-1 block text-xs text-muted">{question.help_text}</span>
                ) : null}
              </label>
            ))}
          </fieldset>
        );
      })}

      {householdQuestions.length > 0 ? (
        <fieldset className="card p-5">
          <legend className="px-1 font-serif text-lg">A few last things</legend>
          {householdQuestions.map((question) => (
            <label key={question.id} className="mt-3 block">
              <span className="mb-1 block text-sm font-medium">
                {question.label}
                {question.required ? <span aria-hidden> *</span> : null}
              </span>
              {question.type === "long_text" ? (
                <textarea
                  rows={3}
                  required={question.required}
                  value={householdAnswers[question.id] ?? ""}
                  onChange={(e) =>
                    setHouseholdAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                  }
                  className="field"
                />
              ) : question.type === "boolean" ? (
                <select
                  value={householdAnswers[question.id] ?? ""}
                  onChange={(e) =>
                    setHouseholdAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                  }
                  className="field"
                >
                  <option value="">Not sure yet</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : (
                <input
                  required={question.required}
                  value={householdAnswers[question.id] ?? ""}
                  onChange={(e) =>
                    setHouseholdAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                  }
                  className="field"
                />
              )}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Send our answers"}
        </button>
        {status === "saved" ? (
          <span className="text-sm text-tierA">
            Saved, thank you. You can come back and change this any time.
          </span>
        ) : null}
        {status === "error" && error ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}
