"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  BLOCKS,
  BLOCK_ALIGNS,
  BLOCK_AUDIENCES,
  BLOCK_BACKGROUNDS,
  BLOCK_WIDTHS,
  IMAGE_SHAPES,
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
import { FieldInput } from "./field";
import { PhotoPicker, type PhotoOption } from "./photo-picker";

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

const STYLE_OPTIONS: Record<string, readonly string[]> = {
  width: BLOCK_WIDTHS,
  align: BLOCK_ALIGNS,
  shape: IMAGE_SHAPES,
};

/**
 * The four grounds a block can take.
 *
 * Buttons rather than a `<select>`, unlike the other style controls: this is
 * the one choice that changes what the block looks like from across the room,
 * and it is the one somebody tries all four of.
 */
const BACKGROUND_LABEL: Record<(typeof BLOCK_BACKGROUNDS)[number], string> = {
  paper: "Plain",
  tinted: "Tinted",
  ink: "Ink",
  photograph: "Photograph",
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

  function set(name: string, value: unknown) {
    setValues((was) => ({ ...was, [name]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveBlock(block.id, values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      setErrors({});
      setMessage("Saved to your draft");
      onDone();
    });
  }

  function style(next: Partial<BlockStyle>) {
    startTransition(async () => {
      const result = await setBlockStyle(block.id, { ...block.style, ...next });
      if (!result.ok) setMessage(result.error);
      else onDone();
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
        <div className="space-y-3">
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
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-muted">{form.repeat.key}</h3>
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
              <div className="flex flex-wrap gap-1">
                {BLOCK_BACKGROUNDS.map((option) => {
                  const current = block.style.background ?? "paper";
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={pending}
                      aria-pressed={current === option}
                      onClick={() => style({ background: option })}
                      className={`rounded border px-2.5 py-1 text-xs ${
                        current === option
                          ? "border-accent bg-[#f6f3ee] font-medium"
                          : "border-line hover:border-ink"
                      }`}
                    >
                      {BACKGROUND_LABEL[option]}
                    </button>
                  );
                })}
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

          <div className="flex flex-wrap gap-3">
            {def.styles
              .filter((key) => key !== "embed" && key !== "background" && key !== "bgImage")
              .map((key) => (
                <label key={key} className="text-sm">
                  <span className="mr-1 capitalize text-muted">{key}</span>
                  <select
                    className="field inline-block w-auto"
                    value={String((block.style as Record<string, unknown>)[key] ?? "")}
                    onChange={(event) => style({ [key]: event.target.value } as Partial<BlockStyle>)}
                  >
                    <option value="">Default</option>
                    {(STYLE_OPTIONS[key] ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>

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

      <div className="flex items-center gap-3 border-t border-line pt-3">
        <button type="button" className="btn-primary" disabled={pending} onClick={save}>
          Save
        </button>
        {message ? <span className="text-sm text-muted">{message}</span> : null}
      </div>
    </div>
  );
}
