"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeQuestion, reorderQuestion, saveQuestion } from "@/server/actions/questions";
import type { QuestionScope, QuestionType, RsvpQuestionRow } from "@/lib/types/database";

/**
 * The question builder.
 *
 * Questions are few and long-lived, so this is a list with an inline editor
 * rather than a separate page per question — the thing the planner is
 * actually doing is comparing what the form asks, not editing one question in
 * isolation.
 */

const TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  boolean: "Yes / no",
  single_select: "Choose one",
  multi_select: "Choose any",
  number: "Number",
};

const SCOPE_LABELS: Record<QuestionScope, string> = {
  guest: "Once per guest",
  household: "Once per household",
};

const SELECT_TYPES: QuestionType[] = ["single_select", "multi_select"];

type Draft = {
  label: string;
  help_text: string;
  type: QuestionType;
  scope: QuestionScope;
  required: boolean;
  active: boolean;
  options: string;
};

function toDraft(question?: RsvpQuestionRow): Draft {
  return {
    label: question?.label ?? "",
    help_text: question?.help_text ?? "",
    type: question?.type ?? "short_text",
    scope: question?.scope ?? "guest",
    required: question?.required ?? false,
    active: question?.active ?? true,
    options: Array.isArray(question?.options)
      ? (question.options as unknown[]).map(String).join("\n")
      : "",
  };
}

export function QuestionsEditor({ questions }: { questions: RsvpQuestionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  function startNew() {
    setEditing("new");
    setDraft(toDraft());
    setErrors({});
    setMessage(null);
  }

  function startEdit(question: RsvpQuestionRow) {
    setEditing(question.id);
    setDraft(toDraft(question));
    setErrors({});
    setMessage(null);
  }

  function onSave(questionId: string | null) {
    startTransition(async () => {
      const result = await saveQuestion(questionId, { ...draft });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      setErrors({});
      setMessage("Saved");
      setEditing(null);
      router.refresh();
    });
  }

  function onRemove(question: RsvpQuestionRow) {
    const confirmed = window.confirm(
      `Remove “${question.label}”? If anyone has answered it, it is switched off instead so their answers survive.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removeQuestion(question.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.data.deactivated
          ? `Switched off — ${result.data.answers} ${
              result.data.answers === 1 ? "answer was" : "answers were"
            } kept`
          : "Removed",
      );
      router.refresh();
    });
  }

  function onMove(questionId: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await reorderQuestion(questionId, direction);
      if (!result.ok) setMessage(result.error);
      router.refresh();
    });
  }

  const form = (questionId: string | null) => (
    <div className="space-y-3 border-t border-line p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Question</span>
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="Will you need a seat on the coach from the hotel?"
          className="field"
        />
        {errors.label ? <span className="mt-1 block text-xs text-red-800">{errors.label[0]}</span> : null}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Help text</span>
        <input
          value={draft.help_text}
          onChange={(e) => setDraft({ ...draft, help_text: e.target.value })}
          placeholder="Optional — a line under the question"
          className="field"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Answer type</span>
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}
            className="field"
          >
            {(Object.keys(TYPE_LABELS) as QuestionType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Asked</span>
          <select
            value={draft.scope}
            onChange={(e) => setDraft({ ...draft, scope: e.target.value as QuestionScope })}
            className="field"
          >
            {(Object.keys(SCOPE_LABELS) as QuestionScope[]).map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABELS[scope]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {SELECT_TYPES.includes(draft.type) ? (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Options, one per line</span>
          <textarea
            rows={4}
            value={draft.options}
            onChange={(e) => setDraft({ ...draft, options: e.target.value })}
            placeholder={"Beef\nSalmon\nMushroom wellington"}
            className="field"
          />
          {errors.options ? (
            <span className="mt-1 block text-xs text-red-800">{errors.options[0]}</span>
          ) : null}
        </label>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
          />
          Must be answered
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Showing on the form
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => onSave(questionId)}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className="card p-3 text-sm">
          {message}
        </p>
      ) : null}

      <div className="card divide-y divide-line">
        {questions.length === 0 ? (
          <p className="p-5 text-sm text-muted">
            No custom questions yet. Everyone is still asked about dietary requirements and access
            needs — those are built in.
          </p>
        ) : null}

        {questions.map((question, index) => (
          <div key={question.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {question.label}
                  {question.required ? <span className="text-red-800"> *</span> : null}
                  {!question.active ? (
                    <span className="ml-2 rounded bg-line/60 px-1.5 py-0.5 text-xs text-muted">
                      off
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {TYPE_LABELS[question.type]} · {SCOPE_LABELS[question.scope]}
                  {Array.isArray(question.options) && question.options.length > 0
                    ? ` · ${(question.options as unknown[]).map(String).join(", ")}`
                    : ""}
                </p>
                {question.help_text ? (
                  <p className="mt-0.5 text-xs text-muted">{question.help_text}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  disabled={pending || index === 0}
                  onClick={() => onMove(question.id, "up")}
                  aria-label={`Move “${question.label}” up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  disabled={pending || index === questions.length - 1}
                  onClick={() => onMove(question.id, "down")}
                  aria-label={`Move “${question.label}” down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  onClick={() => startEdit(question)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => onRemove(question)}
                >
                  Remove
                </button>
              </div>
            </div>

            {editing === question.id ? form(question.id) : null}
          </div>
        ))}
      </div>

      {editing === "new" ? <div className="card">{form(null)}</div> : null}

      {editing !== "new" ? (
        <button type="button" className="btn-primary" onClick={startNew}>
          Add a question
        </button>
      ) : null}
    </div>
  );
}
