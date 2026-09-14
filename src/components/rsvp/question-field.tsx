"use client";

import type { RsvpQuestionRow } from "@/lib/types/database";

/**
 * One custom question, rendered as the control its type asks for.
 *
 * Until now every type rendered as a text input, so a "choose one" question
 * with three options was a box the guest typed into — which produced
 * "mushroom", "Mushroom wellington" and "veggie option pls" for one question,
 * and left the caterer to reconcile them.
 *
 * Shared between the per-guest and per-household sections rather than written
 * twice: the two had already drifted, with long_text and boolean handled on
 * the household side only.
 *
 * An answer is a string, except for multi_select which is an array. The
 * column is jsonb, so the array is stored as an array rather than a joined
 * string nobody can query back out.
 */

export type AnswerValue = string | string[];

/** The options as the builder stored them: a jsonb array of strings. */
export function questionOptions(question: RsvpQuestionRow): string[] {
  return Array.isArray(question.options)
    ? (question.options as unknown[]).map(String).filter((option) => option !== "")
    : [];
}

export function QuestionField({
  question,
  value,
  onChange,
  idPrefix,
}: {
  question: RsvpQuestionRow;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** Namespaces radio groups so one guest's choice does not move another's. */
  idPrefix: string;
}) {
  const options = questionOptions(question);
  const text = typeof value === "string" ? value : "";
  const selected = Array.isArray(value) ? value : [];

  const label = (
    <span className="mb-1 block text-sm font-medium">
      {question.label}
      {question.required ? <span aria-hidden> *</span> : null}
    </span>
  );

  const help = question.help_text ? (
    <span className="mt-1 block text-xs text-muted">{question.help_text}</span>
  ) : null;

  // Radios and checkboxes cannot sit inside a single <label> wrapping the
  // whole group — each input needs its own. So those two render a fieldset,
  // and everything else keeps the label wrapper used across the form.
  if (question.type === "single_select" && options.length > 0) {
    return (
      <fieldset className="mt-3 block">
        <legend className="mb-1 block text-sm font-medium">
          {question.label}
          {question.required ? <span aria-hidden> *</span> : null}
        </legend>
        <div className="space-y-1">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${idPrefix}-${question.id}`}
                value={option}
                checked={text === option}
                required={question.required}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
          {/* Without this there is no way back to "no answer" once one is
              picked, and a required question is the only kind where that
              should be impossible. */}
          {!question.required ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="radio"
                name={`${idPrefix}-${question.id}`}
                value=""
                checked={text === ""}
                onChange={() => onChange("")}
              />
              No preference
            </label>
          ) : null}
        </div>
        {help}
      </fieldset>
    );
  }

  if (question.type === "multi_select" && options.length > 0) {
    return (
      <fieldset className="mt-3 block">
        <legend className="mb-1 block text-sm font-medium">
          {question.label}
          {question.required ? <span aria-hidden> *</span> : null}
        </legend>
        <div className="space-y-1">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? // Rebuilt from the option list rather than appended,
                        // so the saved order matches the order on screen.
                        options.filter((o) => o === option || selected.includes(o))
                      : selected.filter((o) => o !== option),
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
        {help}
      </fieldset>
    );
  }

  if (question.type === "long_text") {
    return (
      <label className="mt-3 block">
        {label}
        <textarea
          rows={3}
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className="field"
        />
        {help}
      </label>
    );
  }

  if (question.type === "boolean") {
    return (
      <label className="mt-3 block">
        {label}
        <select
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className="field"
        >
          <option value="">Not sure yet</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {help}
      </label>
    );
  }

  if (question.type === "number") {
    return (
      <label className="mt-3 block">
        {label}
        <input
          type="number"
          inputMode="numeric"
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className="field"
        />
        {help}
      </label>
    );
  }

  // short_text, and any select type whose options were never filled in —
  // a text box still collects the answer rather than rendering nothing.
  return (
    <label className="mt-3 block">
      {label}
      <input
        required={question.required}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className="field"
      />
      {help}
    </label>
  );
}
