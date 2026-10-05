"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  BLOCKS,
  BLOCK_BACKGROUNDS,
  defaultHeading,
  isTitled,
  type BlockStyle,
  type SiteBlock,
} from "@/lib/site/blocks";
import type { BlockForm } from "@/lib/site/block-fields";
import {
  addStarterFaq,
  saveBlock,
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
import { LookGlyph } from "./look-glyph";
import { ENTRANCES, ENTRANCE_LABEL, looksFor, resolveLook } from "@/lib/site/looks";

/**
 * One block's form (spec 23 §5).
 *
 * Content, then style — in that order because that is the order somebody
 * thinks in, and because the second is the one you set once and forget.
 *
 * **Style is a fixed set of choices, not CSS.** Width, background, alignment,
 * image shape, and the embed switch where there is a third party to load.
 * Colour and type come from the theme, which is where a non-designer's
 * decisions stay good.
 */

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
  heroDefault,
  focusTitle = 0,
}: {
  block: SiteBlock;
  form: BlockForm;
  photos: PhotoOption[];
  onDone: () => void;
  /** The theme's own hero style, which a hero with no Look of its own follows. */
  heroDefault: string;
  /** Changes when the planner clicks this block's title in the preview. */
  focusTitle?: number;
}) {
  const def = BLOCKS[block.type];
  const payload = (block.payload ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, unknown>>(payload);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Clicking a block's title in the preview puts the cursor in its Title field.
  // Skipped at zero so merely opening a block does not steal focus.
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusTitle > 0) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [focusTitle]);

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

      {isTitled(block.type) ? (
        // Spec 28 §7.2. The planner's own words for the section, with today's
        // default as the placeholder so an untouched block is unchanged and they
        // can see what they are replacing. Saved in the block's payload, like
        // everything else on this form.
        <div className="space-y-3" onBlur={flush}>
          <div>
            <label htmlFor={`block-${block.id}-heading`} className="block text-sm font-medium">
              Title
            </label>
            <input
              ref={titleInput}
              id={`block-${block.id}-heading`}
              className="field mt-1"
              value={typeof values["heading"] === "string" ? (values["heading"] as string) : ""}
              disabled={values["hide_heading"] === true}
              placeholder={defaultHeading(block.type) || "A heading (optional)"}
              maxLength={200}
              onChange={(event) => set("heading", event.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              {defaultHeading(block.type)
                ? "Leave it empty to keep the original."
                : "Leave it empty for no heading."}
            </p>
          </div>
          {defaultHeading(block.type) ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={values["hide_heading"] === true}
                onChange={(event) => set("hide_heading", event.target.checked)}
              />
              <span>
                No title
                <span className="block text-xs text-muted">
                  For a section that speaks for itself. The space closes up, and it isn&rsquo;t numbered.
                </span>
              </span>
            </label>
          ) : null}
          {def.eyebrow ? (
            <div>
              <label htmlFor={`block-${block.id}-eyebrow`} className="block text-sm font-medium">
                Label
              </label>
              <input
                id={`block-${block.id}-eyebrow`}
                className="field mt-1"
                value={typeof values["eyebrow"] === "string" ? (values["eyebrow"] as string) : ""}
                placeholder={def.eyebrow}
                maxLength={60}
                onChange={(event) => set("eyebrow", event.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                The small line above the title. The number in front is worked out for you, so
                moving sections about never leaves them out of order.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {form.image ? (
        <PhotoPicker
          value={typeof values["image_id"] === "string" ? (values["image_id"] as string) : null}
          photos={photos}
          kind={block.type === "hero" ? "hero" : "gallery"}
          onFocalSaved={onDone}
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

      {/* ---- layout (spec 27 E1) ----
          A Look is a curated alternate layout, chosen from a small set; none of
          them can produce an unreadable page, which is the whole point of
          offering a choice rather than a stylesheet. */}
      {looksFor(block.type).length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <h3 className="text-xs uppercase tracking-wide text-muted">Layout</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {looksFor(block.type).map((look) => {
              const current = resolveLook(block.type, block.style.variant, heroDefault);
              const selected = current === look.id;
              return (
                <button
                  key={look.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  title={look.description}
                  onClick={() => style({ variant: look.id })}
                  className={`flex flex-col items-start gap-1 rounded border p-2 text-left ${
                    selected ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
                  }`}
                >
                  <LookGlyph type={block.type} look={look.id} />
                  <span className="text-xs font-medium">{look.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {looksFor(block.type).find(
              (look) => look.id === resolveLook(block.type, block.style.variant, heroDefault),
            )?.description}
            {block.type === "hero" && block.style.variant === undefined
              ? " Following your theme."
              : null}
          </p>
          {block.type === "hero" && block.style.variant !== undefined ? (
            <button
              type="button"
              className="text-xs underline"
              disabled={pending}
              onClick={() => style({ variant: undefined })}
            >
              Follow the theme instead
            </button>
          ) : null}
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

          {def.styles.includes("lightbox") ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={pending}
                // Absent means yes (`BlockStyle.lightbox`), so the box is
                // checked for every block that never chose.
                checked={block.style.lightbox !== false}
                onChange={(event) =>
                  // Only the off state is stored; switching it back on removes
                  // the key rather than writing `true`.
                  style({ lightbox: event.target.checked ? undefined : false })
                }
              />
              <span>
                Let guests tap a photo to enlarge it
                <span className="block text-xs text-muted">
                  Swipe or use the arrow keys to move between photographs.
                </span>
              </span>
            </label>
          ) : null}

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

      {/* ---- how it arrives (spec 27 E4) ----
          Not a motion editor: no timing, no easing, no keyframes. "This photo
          should be still" and "this one should make an entrance" are the two
          things anybody actually wants, and one choice covers both. */}
      {block.type !== "footer" ? (
        <div className="space-y-1 border-t border-line pt-3">
          <h3 className="text-xs uppercase tracking-wide text-muted">How it arrives</h3>
          <div className="flex flex-wrap gap-1.5">
            {([undefined, ...ENTRANCES] as const).map((entrance) => {
              const selected = block.style.enter === entrance;
              return (
                <button
                  key={entrance ?? "page"}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  onClick={() => style({ enter: entrance })}
                  className={`rounded border px-2.5 py-1 text-xs ${
                    selected ? "border-accent bg-[#f6f3ee] font-medium" : "border-line hover:border-ink"
                  }`}
                >
                  {entrance ? ENTRANCE_LABEL[entrance] : "Match the page"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

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
