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
  missing = false,
  chips = true,
  ruled = true,
  ownCheck = true,
}: {
  question: RsvpQuestionRow;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** Namespaces radio groups so one guest's choice does not move another's. */
  idPrefix: string;
  /**
   * A required chip question left unanswered at send time (spec 35 §6 item
   * 7). The form decides; this only says so beside the question.
   */
  missing?: boolean;
  /** Spec 35 switches. Off: native radios, tick boxes and a yes/no dropdown. */
  chips?: boolean;
  /** Off: boxed fields with plain labels. */
  ruled?: boolean;
  /** Off: chips carry `required` and the browser checks them, as before. */
  ownCheck?: boolean;
}) {
  const options = questionOptions(question);
  const text = typeof value === "string" ? value : "";
  const selected = Array.isArray(value) ? value : [];
  const fieldClass = ruled ? "site-rsvp-input" : "field";
  // The browser's `required` on a chip only when the form is not checking.
  const chipRequired = ownCheck ? undefined : question.required;

  if (!chips) {
    return (
      <ClassicChoice
        question={question}
        options={options}
        text={text}
        selected={selected}
        onChange={onChange}
        idPrefix={idPrefix}
        ruled={ruled}
      />
    );
  }

  const label = (
    <span className={ruled ? "site-label mb-1 block text-muted" : "mb-1 block text-sm font-medium"}>
      {question.label}
      {question.required ? <span aria-hidden> *</span> : null}
    </span>
  );

  const legend = (
    <legend className={ruled ? "site-label mb-2 block text-muted" : "mb-1 block text-sm font-medium"}>
      {question.label}
      {question.required ? (
        <>
          <span aria-hidden> *</span>
          {/* The chips carry no `required` (see below), so say it in words. */}
          {ownCheck ? <span className="sr-only"> (required)</span> : null}
        </>
      ) : null}
    </legend>
  );

  const groupId = `${idPrefix}-${question.id}`;
  const missingNote = missing ? (
    <span id={`${groupId}-missing`} className="site-rsvp-missing mt-2 block text-sm">
      {question.type === "multi_select" ? "Please pick at least one." : "Please pick one."}
    </span>
  ) : null;

  const help = question.help_text ? (
    <span className="mt-1.5 block text-sm italic text-muted">{question.help_text}</span>
  ) : null;

  // Radios and checkboxes cannot sit inside a single <label> wrapping the
  // whole group — each input needs its own. So the choice types render a
  // fieldset of chips: a real input, visually hidden, under a label that
  // looks like a button. Keyboard and screen readers keep working because the
  // input is still there. `required` is NOT set on them: the browser's bubble
  // would point at a hidden 1 px box, so the form checks these itself
  // (`unansweredChips`) and passes `missing` back down.
  if (question.type === "single_select" && options.length > 0) {
    return (
      <fieldset className="block" data-question={groupId} aria-describedby={missing ? `${groupId}-missing` : undefined}>
        {legend}
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip
              key={option}
              type="radio"
              name={`${idPrefix}-${question.id}`}
              label={option}
              checked={text === option}
              required={chipRequired}
              onChange={() => onChange(option)}
            />
          ))}
          {/* Without this there is no way back to "no answer" once one is
              picked, and a required question is the only kind where that
              should be impossible. */}
          {!question.required ? (
            <Chip
              type="radio"
              name={`${idPrefix}-${question.id}`}
              label="No preference"
              quiet
              checked={text === ""}
              onChange={() => onChange("")}
            />
          ) : null}
        </div>
        {help}
        {missingNote}
      </fieldset>
    );
  }

  if (question.type === "multi_select" && options.length > 0) {
    return (
      <fieldset className="block" data-question={groupId} aria-describedby={missing ? `${groupId}-missing` : undefined}>
        {legend}
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip
              key={option}
              type="checkbox"
              label={option}
              checked={selected.includes(option)}
              onChange={(checked) =>
                onChange(
                  checked
                    ? // Rebuilt from the option list rather than appended,
                      // so the saved order matches the order on screen.
                      options.filter((o) => o === option || selected.includes(o))
                    : selected.filter((o) => o !== option),
                )
              }
            />
          ))}
        </div>
        {help}
        {missingNote}
      </fieldset>
    );
  }

  if (question.type === "long_text") {
    return (
      <label className="block">
        {label}
        <textarea
          rows={3}
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} resize-y`}
        />
        {help}
      </label>
    );
  }

  if (question.type === "boolean") {
    // Same three values the select stored ("yes", "no", "" for not sure), as
    // chips. A required question offers no "not sure": "" is no answer.
    return (
      <fieldset className="block" data-question={groupId} aria-describedby={missing ? `${groupId}-missing` : undefined}>
        {legend}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              ...(question.required ? [] : [{ value: "", label: "Not sure yet" }]),
            ] as const
          ).map((choice) => (
            <Chip
              key={choice.value}
              type="radio"
              name={`${idPrefix}-${question.id}`}
              label={choice.label}
              quiet={choice.value === ""}
              checked={text === choice.value}
              required={chipRequired}
              onChange={() => onChange(choice.value)}
            />
          ))}
        </div>
        {help}
        {missingNote}
      </fieldset>
    );
  }

  if (question.type === "number") {
    return (
      <label className="block">
        {label}
        <input
          type="number"
          inputMode="numeric"
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} max-w-[10rem]`}
        />
        {help}
      </label>
    );
  }

  // short_text, and any select type whose options were never filled in —
  // a text box still collects the answer rather than rendering nothing.
  return (
    <label className="block">
      {label}
      <input
        required={question.required}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
      {help}
    </label>
  );
}

/** One option as a pill. The input is real and focusable; only its box is hidden. */
function Chip({
  type,
  name,
  label,
  checked,
  required,
  quiet,
  onChange,
}: {
  type: "radio" | "checkbox";
  name?: string;
  label: string;
  checked: boolean;
  required?: boolean;
  /** "No preference" and friends: present, but not competing with real answers. */
  quiet?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`site-rsvp-chip ${quiet ? "is-quiet" : ""}`}>
      <input
        type={type}
        name={name}
        value={label}
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * The question as it was before chips (spec 35, `chips` switched off): native
 * radios, tick boxes and a yes/no dropdown, each checked by the browser's own
 * `required`. Text questions are the same in both, so this hands them back.
 */
function ClassicChoice({
  question,
  options,
  text,
  selected,
  onChange,
  idPrefix,
  ruled,
}: {
  question: RsvpQuestionRow;
  options: string[];
  text: string;
  selected: string[];
  onChange: (value: AnswerValue) => void;
  idPrefix: string;
  ruled: boolean;
}) {
  const labelClass = ruled ? "site-label mb-1 block text-muted" : "mb-1 block text-sm font-medium";
  const fieldClass = ruled ? "site-rsvp-input" : "field";
  const heading = (
    <>
      {question.label}
      {question.required ? <span aria-hidden> *</span> : null}
    </>
  );
  const help = question.help_text ? (
    <span className="mt-1 block text-xs text-muted">{question.help_text}</span>
  ) : null;

  if (question.type === "single_select" && options.length > 0) {
    return (
      <fieldset className="block">
        <legend className={labelClass}>{heading}</legend>
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
      <fieldset className="block">
        <legend className={labelClass}>{heading}</legend>
        <div className="space-y-1">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? options.filter((o) => o === option || selected.includes(o))
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

  if (question.type === "boolean") {
    return (
      <label className="block">
        <span className={labelClass}>{heading}</span>
        <select
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
        >
          <option value="">Not sure yet</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {help}
      </label>
    );
  }

  // Text, long text and number are the same with or without chips.
  return (
    <QuestionField
      question={question}
      value={text}
      onChange={onChange}
      idPrefix={idPrefix}
      ruled={ruled}
      chips
      ownCheck={false}
    />
  );
}
