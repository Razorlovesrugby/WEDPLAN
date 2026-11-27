"use client";

import { useId } from "react";
import { DIETARY_TAGS, OTHER_TEXT_MAX, type DietaryNeed } from "@/lib/dietary";
import type { DietaryTag } from "@/lib/types/database";

/**
 * The standard dietary tags as toggles, each marked an allergy or a
 * preference, with a short text for Other (spec 57 Part H). Controlled: the
 * caller owns the list. The free-text note beside it is a separate field.
 */
export function DietaryNeedsEditor({
  value,
  onChange,
  disabled = false,
  label = "Dietary needs",
  legendClass = "mb-1 text-sm font-medium",
  inputClass = "field",
  help,
}: {
  value: DietaryNeed[];
  onChange: (next: DietaryNeed[]) => void;
  disabled?: boolean;
  label?: string;
  /** The RSVP form passes the site's own label and input classes. */
  legendClass?: string;
  inputClass?: string;
  help?: string;
}) {
  const id = useId();
  const byTag = new Map(value.map((n) => [n.tag, n]));

  const toggle = (tag: DietaryTag) => {
    if (byTag.has(tag)) onChange(value.filter((n) => n.tag !== tag));
    // Other starts with no words yet; parseDietaryNeeds drops it until it has some.
    else onChange([...value, { tag, isAllergy: false, otherText: tag === "other" ? "" : null }]);
  };
  const patch = (tag: DietaryTag, change: Partial<DietaryNeed>) => onChange(value.map((n) => (n.tag === tag ? { ...n, ...change } : n)));

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className={legendClass}>{label}</legend>
      {help ? <p className="text-sm text-muted">{help}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {DIETARY_TAGS.map(({ tag, label: text }) => {
          const on = byTag.has(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag)}
              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-white" : "border-line text-muted hover:bg-line/50"}`}
            >
              {text}
            </button>
          );
        })}
      </div>

      {value.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {value.map((n) => {
            const name = DIETARY_TAGS.find((t) => t.tag === n.tag)!.label;
            return (
              <li key={n.tag} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 font-medium">{name}</span>
                <span role="radiogroup" aria-label={`${name}: allergy or preference`} className="inline-flex overflow-hidden rounded border border-line">
                  {([false, true] as const).map((allergy) => (
                    <button
                      key={String(allergy)}
                      type="button"
                      role="radio"
                      aria-checked={n.isAllergy === allergy}
                      onClick={() => patch(n.tag, { isAllergy: allergy })}
                      className={`px-2.5 py-0.5 ${n.isAllergy === allergy ? (allergy ? "bg-red-700 text-white" : "bg-ink text-white") : "text-muted hover:bg-line/50"}`}
                    >
                      {allergy ? "Allergy" : "Preference"}
                    </button>
                  ))}
                </span>
                {n.tag === "other" ? (
                  <input
                    className={`${inputClass} min-w-[10rem] flex-1 py-0.5`}
                    aria-label="What else"
                    placeholder="What else? e.g. no mushrooms"
                    maxLength={OTHER_TEXT_MAX}
                    value={n.otherText ?? ""}
                    onChange={(e) => patch("other", { otherText: e.target.value })}
                    id={`${id}-other`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}
