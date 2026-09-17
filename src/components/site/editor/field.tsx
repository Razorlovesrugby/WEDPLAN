"use client";

import type { Field } from "@/lib/site/editor-fields";

/** One input, rendered from its spec. */
export function FieldInput({
  field,
  value,
  onChange,
  errors,
  idPrefix,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  errors?: string[];
  idPrefix: string;
}) {
  const id = `${idPrefix}-${field.name}`;
  const described = field.help || errors?.length ? `${id}-help` : undefined;

  if (field.kind === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={described}
          />
          <span>{field.label}</span>
        </label>
        {field.help ? (
          <p id={described} className="ml-6 mt-1 text-xs text-muted">
            {field.help}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
      </label>
      {field.kind === "textarea" ? (
        <textarea
          id={id}
          className="field mt-1"
          rows={field.rows ?? 4}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={described}
          aria-invalid={errors?.length ? true : undefined}
        />
      ) : field.kind === "select" ? (
        <select
          id={id}
          className="field mt-1"
          value={typeof value === "string" ? value : (field.options?.[0]?.value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={described}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind === "email" ? "email" : "text"}
          className="field mt-1"
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={described}
          aria-invalid={errors?.length ? true : undefined}
        />
      )}
      {field.help || errors?.length ? (
        <p id={described} className={`mt-1 text-xs ${errors?.length ? "text-tierB" : "text-muted"}`}>
          {errors?.length ? errors.join(" ") : field.help}
        </p>
      ) : null}
    </div>
  );
}
