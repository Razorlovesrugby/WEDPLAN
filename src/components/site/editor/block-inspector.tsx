"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  BLOCKS,
  BLOCK_AUDIENCES,
  BLOCK_BACKGROUNDS,
  type BlockStyle,
  type SiteBlock,
} from "@/lib/site/blocks";
import type { BlockForm } from "@/lib/site/block-fields";
import {
  addStarterFaq,
  saveBlock,
  setBlockAudience,
  setBlockStyle,
} from "@/server/actions/site-blocks";
import {
  BACKGROUND_LABEL,
  SHAPE_LABEL,
  STYLE_CHOICES,
  STYLE_TITLE,
  repeatHeading,
} from "@/lib/site/style-labels";
import { FieldInput } from "./field";
import { PhotoPicker, type PhotoOption } from "./photo-picker";
import { saveStatusLabel, useAutosave } from "./use-autosave";

/**
 * One block's form (spec 23 §5).
 *
 * Content, then style, then who sees it — in that order because that is the
 * order somebody thinks in, and because the last two are the ones you set
 * once and forget.
 *
 * **Style is a fixed set of choices, not CSS.** Width, background, alignment,
 * image shape, and the embed switch where there is a third party to load.
 * Colour and type come from the theme, which is where a non-designer's
 * decisions stay good.
 */

const AUDIENCE_LABEL: Record<(typeof BLOCK_AUDIENCES)[number], string> = {
  everyone: "Everyone",
  invited: "Only people with their own link",
  public_only: "Only the shared site",
};

/** Swatches for the choices that are questions about how something looks. */
const BACKGROUND_SWATCH: Record<(typeof BLOCK_BACKGROUNDS)[number], string> = {
  paper: "#ffffff",
  tinted: "#efe9df",
  ink: "#2b2723",
  photograph: "linear-gradient(135deg,#9db4c0 0%,#c9b99a 55%,#6f7d5c 100%)",
};

/** Width, height of a miniature of each photo shape, in px. */
const SHAPE_BOX: Record<keyof typeof SHAPE_LABEL, [number, number]> = {
  natural: [26, 20],
  square: [22, 22],
  portrait: [18, 24],
  wide: [30, 17],
};

export function BlockInspector({
  block,
  form,
  photos,
  onDone,
}: {
  block: SiteBlock;
  form: BlockForm;
  photos: PhotoOption[];
  onDone: () => void;
}) {
  const def = BLOCKS[block.type];
  const payload = (block.payload ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, unknown>>(payload);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const repeatRows = Array.isArray(values[form.repeat?.key ?? ""])
    ? (values[form.repeat!.key] as Record<string, unknown>[])
    : [];

  // One rule about saving: everything autosaves (spec 24 §6). There is no Save
  // button, and the status line below is how the planner knows that.
  const { status, flush } = useAutosave(values, async (next) => {
    const result = await saveBlock(block.id, next);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      return { ok: false as const, error: result.error };
    }
    setErrors({});
    onDone();
    return { ok: true as const };
  });

  function set(name: string, value: unknown) {
    setValues((was) => ({ ...was, [name]: value }));
  }

  function style(next: Partial<BlockStyle>) {
    startTransition(async () => {
      const result = await setBlockStyle(block.id, { ...block.style, ...next });
      if (!result.ok) setMessage(result.error);
      else {
        setMessage(null);
        onDone();
      }
    });
  }

  return (
    // No card of its own: this lives inside one of the builder rail's
    // sections, which already draws the box.
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">{def.label}</h2>
        <p className="mt-0.5 text-sm text-muted">{form.blurb}</p>
        {form.managedElsewhere ? (
          <p className="mt-1 text-sm">
            <Link href={form.managedElsewhere} className="text-accent underline">
              Edit the content itself →
            </Link>
          </p>
        ) : null}
      </div>

      {form.image ? (
        <PhotoPicker
          value={typeof values["image_id"] === "string" ? (values["image_id"] as string) : null}
          photos={photos}
          kind={block.type === "hero" ? "hero" : "gallery"}
          onChange={(assetId) => {
            const next = { ...values, image_id: assetId ?? undefined };
            setValues(next);
            // Saved immediately: an upload that is only in local state is a
            // photograph somebody thinks they have added and has not.
            startTransition(async () => {
              await saveBlock(block.id, next);
              onDone();
            });
          }}
        />
      ) : null}

      {form.fields.length > 0 ? (
        // `onBlur` bubbles from the inputs, so leaving any field writes now
        // rather than waiting out the debounce.
        <div className="space-y-3" onBlur={flush}>
          {form.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name]}
              errors={errors[field.name]}
              idPrefix={`block-${block.id}`}
              onChange={(value) => set(field.name, value)}
            />
          ))}
        </div>
      ) : null}

      {form.repeat ? (
        <div className="space-y-3" onBlur={flush}>
          <h3 className="text-xs uppercase tracking-wide text-muted">
            {repeatHeading(form.repeat.noun)}
          </h3>
          {repeatRows.map((row, index) => (
            <div key={index} className="space-y-2 border-l-2 border-line pl-3">
              {form.repeat!.fields.map((field) => (
                <FieldInput
                  key={field.name}
                  field={field}
                  value={row[field.name]}
                  idPrefix={`block-${block.id}-${index}`}
                  onChange={(value) => {
                    const next = [...repeatRows];
                    next[index] = { ...row, [field.name]: value };
                    set(form.repeat!.key, next);
                  }}
                />
              ))}
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                onClick={() =>
                  set(
                    form.repeat!.key,
                    repeatRows.filter((_, position) => position !== index),
                  )
                }
              >
                Remove this {form.repeat!.noun}
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => set(form.repeat!.key, [...repeatRows, {}])}
            >
              Add a {form.repeat.noun}
            </button>
            {block.type === "faq" ? (
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await addStarterFaq(block.id);
                    setMessage(
                      result.ok
                        ? result.data.added === 0
                          ? "Everything in the starter list is already here"
                          : `Added ${result.data.added} questions as drafts`
                        : result.error,
                    );
                    onDone();
                  })
                }
              >
                Add the usual questions
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---- style ---- */}
      {def.styles.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <h3 className="text-xs uppercase tracking-wide text-muted">How it looks</h3>
          {def.styles.includes("background") ? (
            <div className="space-y-2">
              <div>
                <span className="mb-1 block text-xs text-muted">Background</span>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_BACKGROUNDS.map((option) => {
                    const current = block.style.background ?? "paper";
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={pending}
                        aria-pressed={current === option}
                        onClick={() => style({ background: option })}
                        className={`flex flex-col items-center gap-1 rounded border p-1.5 text-xs ${
                          current === option
                            ? "border-accent bg-[#f6f3ee] font-medium"
                            : "border-line hover:border-ink"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="block h-6 w-10 rounded-sm border border-line"
                          style={{ background: BACKGROUND_SWATCH[option] }}
                        />
                        {BACKGROUND_LABEL[option]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {block.style.background === "photograph" ? (
                <div className="space-y-2">
                  <PhotoPicker
                    value={block.style.bgImage ?? null}
                    photos={photos}
                    kind="gallery"
                    onChange={(assetId) => style({ bgImage: assetId ?? undefined })}
                  />
                  {/* Said at the moment of choosing, because the planner is
                      looking at a photograph they already like and the scrim
                      is about to darken it. */}
                  <p className="text-xs text-muted">
                    The photograph is dimmed behind the words and the text turns pale. That
                    isn&rsquo;t a taste call — it is what keeps the block readable over a picture
                    nobody has checked the contrast of.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {(["width", "align", "shape"] as const)
            .filter((key) => def.styles.includes(key))
            .map((key) => {
              const current = (block.style as Record<string, unknown>)[key] as string | undefined;
              return (
                <div key={key}>
                  <span className="mb-1 block text-xs text-muted">{STYLE_TITLE[key]}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_CHOICES[key].map((choice) => {
                      const selected = current === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          disabled={pending}
                          aria-pressed={selected}
                          onClick={() => style({ [key]: choice.value } as Partial<BlockStyle>)}
                          className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs ${
                            selected
                              ? "border-accent bg-[#f6f3ee] font-medium"
                              : "border-line hover:border-ink"
                          }`}
                        >
                          {key === "shape" ? (
                            <span
                              aria-hidden="true"
                              className="block rounded-[1px] border border-current opacity-70"
                              style={{
                                width: SHAPE_BOX[choice.value as keyof typeof SHAPE_BOX][0] / 2,
                                height: SHAPE_BOX[choice.value as keyof typeof SHAPE_BOX][1] / 2,
                              }}
                            />
                          ) : null}
                          {choice.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          {def.styles.includes("embed") ? (
            <div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={block.style.embed === true}
                  onChange={(event) => style({ embed: event.target.checked })}
                />
                <span>Load the real thing, not a link</span>
              </label>
              {/* Said plainly, at the moment of choosing. The cost is real and
                  it is not obvious (spec 23 Q1). */}
              <p className="ml-6 mt-1 text-xs text-muted">
                {block.type === "map"
                  ? "Google sees every guest who opens the page — their address and when they looked."
                  : "Spotify sees every guest who opens the page — their address and when they looked."}{" "}
                Never loaded on a guest&rsquo;s own page, where the link itself is private.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---- audience ---- */}
      <div className="space-y-1 border-t border-line pt-3">
        <h3 className="text-xs uppercase tracking-wide text-muted">Who sees it</h3>
        <select
          className="field"
          value={block.audience}
          onChange={(event) =>
            startTransition(async () => {
              const result = await setBlockAudience(block.id, event.target.value);
              if (!result.ok) setMessage(result.error);
              else onDone();
            })
          }
        >
          {BLOCK_AUDIENCES.map((audience) => (
            <option key={audience} value={audience}>
              {AUDIENCE_LABEL[audience]}
            </option>
          ))}
        </select>
      </div>

      {/* Where the Save button was. A calm line rather than a control: the only
          way a planner can tell autosave is working is to be told. */}
      <p
        role="status"
        aria-live="polite"
        className={`border-t border-line pt-3 text-xs ${
          status.state === "error" ? "text-[#a33a3a]" : "text-muted"
        }`}
      >
        {message ?? saveStatusLabel(status) ?? "Changes save as you type"}
      </p>
    </div>
  );
}
