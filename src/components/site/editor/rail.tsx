"use client";

import { useState, useTransition } from "react";
import { saveTheme } from "@/server/actions/site";
import {
  MOTION_EFFECTS,
  MOTION_EFFECT_COPY,
  MOTION_LEVELS,
  MOTION_LEVEL_COPY,
  activeEffects,
  serialiseMotion,
  setLevel,
  toggleEffect,
  type MotionEffect,
  type MotionLevel,
  type MotionSettings,
  type SiteLayout,
} from "@/lib/site/motion";
import {
  PALETTES,
  PALETTE_IDS,
  isDarkTokens,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  TYPOGRAPHY,
  TYPOGRAPHY_IDS,
  type PaletteId,
  type SiteTheme,
  type ThemePresetId,
  type TypographyId, isEditorialFamily } from "@/lib/theme/presets";

/**
 * The look half of the builder's rail (spec 24): theme, palette, typography.
 *
 * This is what `/site/theme` used to be, folded into the rail beside a live
 * preview — which is the whole point of the redesign. Choosing a palette from
 * a page that does not show you the page was always the wrong shape.
 *
 * **Custom hex is deliberately gone.** `PALETTES` are six contrast-checked
 * swatches and every one of them passes `validatePalette` on all four text
 * pairs; a colour picker is the one control in this builder that can produce
 * a page a guest cannot read in a car park. `resolveTheme` and
 * `validatePalette` are untouched, so a wedding that already saved a custom
 * palette keeps rendering it — it simply cannot be edited here any more, and
 * this says so rather than silently overwriting it.
 *
 * Every control saves on change. There is no Save button in a rail whose
 * whole job is to show you the result next to it.
 */
export function LookSections({ theme, onSaved }: { theme: SiteTheme; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Local echo so a click lands immediately rather than after the round trip.
  const [preset, setPreset] = useState<ThemePresetId>(theme.preset);
  const [palette, setPalette] = useState<PaletteId | "custom">(theme.palette);
  const [typography, setTypography] = useState<TypographyId>(theme.typography);
  const [motion, setMotion] = useState<MotionSettings>(theme.motion);
  const [layout, setLayout] = useState<SiteLayout>(theme.layout);

  function save(
    next: Partial<{
      preset: ThemePresetId;
      palette: PaletteId;
      typography: TypographyId;
      motion: MotionSettings;
      layout: SiteLayout;
    }>,
  ) {
    const merged = { preset, palette, typography, motion, layout, ...next };
    setPreset(merged.preset);
    if (merged.palette !== "custom") setPalette(merged.palette);
    setTypography(merged.typography);
    setMotion(merged.motion);
    setLayout(merged.layout);

    startTransition(async () => {
      const result = await saveTheme({
        preset: merged.preset,
        palette: merged.palette,
        hero_style: theme.heroStyle,
        monogram: theme.monogram,
        typography: merged.typography,
        motion: serialiseMotion(merged.motion),
        layout: {
          chapter_rail: merged.layout.chapterRail,
          section_numbers: merged.layout.sectionNumbers,
          reply_bar: merged.layout.replyBar,
          reply_by_date: merged.layout.replyByDate,
        },
      });
      setError(result.ok ? null : result.error);
      if (result.ok) onSaved();
    });
  }

  return (
    <>
      <Section title="Theme">
        <div className="space-y-1.5">
          {THEME_PRESET_IDS.map((id) => {
            const def = THEME_PRESETS[id];
            const selected = preset === id;
            return (
              <button
                key={id}
                type="button"
                // Greyed rather than hidden, which is the existing builder's
                // reasoning about the palette too: "why can't I pick that" is
                // answerable, "where did it go" is not.
                disabled={!def.available || pending}
                onClick={() =>
                  // Evening is a dark theme: choosing it from a light palette
                  // would be choosing a theme that does not look like itself.
                  // Midnight is its home ground; the palette can be changed
                  // straight after, and choosing it never overrides a dark one.
                  save(
                    id === "evening" && palette !== "custom" && !isDarkTokens(PALETTES[palette].tokens)
                      ? { preset: id, palette: "midnight" }
                      : { preset: id },
                  )
                }
                className={`block w-full rounded-md border p-3 text-left ${
                  selected ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
                } ${def.available ? "" : "cursor-not-allowed opacity-45"}`}
              >
                <span className="text-sm font-medium">{def.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {def.available ? def.description : `${def.description} — not built yet.`}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Palette" blurb="Every one of these passes the contrast check.">
        <div className="grid grid-cols-2 gap-2">
          {PALETTE_IDS.map((id) => {
            const tokens = PALETTES[id].tokens;
            const selected = palette === id;
            return (
              <button
                key={id}
                type="button"
                disabled={pending}
                onClick={() => save({ palette: id })}
                className={`rounded-md border p-2.5 text-left ${
                  selected ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
                }`}
              >
                <span className="flex gap-1" aria-hidden="true">
                  {[tokens.paper, tokens.ink, tokens.accent].map((hex) => (
                    <span
                      key={hex}
                      className="h-5 w-5 rounded-sm border border-line"
                      style={{ background: hex }}
                    />
                  ))}
                </span>
                <span className="mt-1.5 block text-xs">{PALETTES[id].label}</span>
              </button>
            );
          })}
        </div>

        {palette === "custom" ? (
          <p className="mt-2 text-xs text-muted">
            This wedding has a custom palette saved from an earlier version. It still renders;
            picking one above replaces it, and there is no way back to it afterwards.
          </p>
        ) : null}
      </Section>

      <Section title="Typography">
        <div className="space-y-1.5">
          {TYPOGRAPHY_IDS.map((id) => {
            const selected = typography === id;
            return (
              <button
                key={id}
                type="button"
                disabled={pending}
                onClick={() => save({ typography: id })}
                className={`block w-full rounded-md border p-3 text-left ${
                  selected ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
                }`}
              >
                {/* Set in the app's own serif, so the choice previews itself
                    as far as it can from outside the site's font scope. */}
                <span className="block font-serif text-base">{TYPOGRAPHY[id].label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {TYPOGRAPHY[id].description}
                </span>
              </button>
            );
          })}
          {!isEditorialFamily(preset) ? (
            <p className="text-xs text-muted">
              The Script theme sets its own two faces — this choice applies to Editorial.
            </p>
          ) : null}
        </div>
      </Section>

      <Section
        title="Motion"
        blurb="How much should it move when guests scroll? It never moves for anyone whose device is set to reduce motion."
      >
        <div className="space-y-1.5">
          {MOTION_LEVELS.map((level: MotionLevel) => {
            const selected = motion.level === level;
            return (
              <button
                key={level}
                type="button"
                disabled={pending}
                aria-pressed={selected}
                onClick={() => save({ motion: setLevel(motion, level) })}
                className={`block w-full rounded-md border p-3 text-left ${
                  selected ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
                }`}
              >
                <span className="text-sm font-medium">{MOTION_LEVEL_COPY[level].label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {MOTION_LEVEL_COPY[level].description}
                </span>
              </button>
            );
          })}
        </div>

        {/* The three levels are the control; these are the escape hatch for
            somebody who wants Gentle without one particular thing. */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted">Customise</summary>
          <ul className="mt-2 space-y-2">
            {MOTION_EFFECTS.map((effect: MotionEffect) => (
              <li key={effect}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={pending || motion.level === "still"}
                    checked={activeEffects(motion).includes(effect)}
                    onChange={() => save({ motion: toggleEffect(motion, effect) })}
                  />
                  <span>
                    {MOTION_EFFECT_COPY[effect].label}
                    <span className="block text-xs text-muted">{MOTION_EFFECT_COPY[effect].help}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {motion.level === "still" ? (
            <p className="mt-2 text-xs text-muted">Still turns every one of these off.</p>
          ) : null}
        </details>
      </Section>

      <Section title="Page">
        <ul className="space-y-2">
          <li>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={pending}
                checked={layout.chapterRail}
                onChange={(event) =>
                  save({ layout: { ...layout, chapterRail: event.target.checked } })
                }
              />
              <span>
                Chapter list down the side
                <span className="block text-xs text-muted">
                  Wide screens, Editorial theme only.
                </span>
              </span>
            </label>
          </li>
          <li>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={pending}
                checked={layout.sectionNumbers}
                onChange={(event) =>
                  save({ layout: { ...layout, sectionNumbers: event.target.checked } })
                }
              />
              <span>
                Numbers above headings
                <span className="block text-xs text-muted">04 · Attire — off leaves the heading alone.</span>
              </span>
            </label>
          </li>
          <li>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={pending}
                checked={layout.replyBar}
                onChange={(event) => save({ layout: { ...layout, replyBar: event.target.checked } })}
              />
              <span>
                Reply bar on phones
                <span className="block text-xs text-muted">
                  A strip along the bottom, once the cover has gone, that says where their reply is.
                </span>
              </span>
            </label>
          </li>
          <li>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                disabled={pending || !layout.replyBar}
                checked={layout.replyByDate}
                onChange={(event) => save({ layout: { ...layout, replyByDate: event.target.checked } })}
              />
              <span>
                Say when to reply by
                <span className="block text-xs text-muted">&ldquo;Your reply · by 1 May&rdquo;, in the bar.</span>
              </span>
            </label>
          </li>
        </ul>
      </Section>

      {error ? (
        <p className="px-5 pb-3 text-xs text-[#a33a3a]" role="status">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** One rail section: a label, an optional line under it, then the controls. */
export function Section({
  title,
  blurb,
  action,
  children,
}: {
  title: string;
  blurb?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#f0ece5] p-5 last:border-b-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</h2>
        {action}
      </div>
      {blurb ? <p className="mb-2.5 text-xs text-muted">{blurb}</p> : null}
      {children}
    </section>
  );
}
