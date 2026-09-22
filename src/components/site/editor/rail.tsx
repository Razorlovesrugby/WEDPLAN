"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTheme } from "@/server/actions/site";
import {
  PALETTES,
  PALETTE_IDS,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  TYPOGRAPHY,
  TYPOGRAPHY_IDS,
  type PaletteId,
  type SiteTheme,
  type ThemePresetId,
  type TypographyId,
} from "@/lib/theme/presets";

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
export function LookSections({ theme }: { theme: SiteTheme }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Local echo so a click lands immediately rather than after the round trip.
  const [preset, setPreset] = useState<ThemePresetId>(theme.preset);
  const [palette, setPalette] = useState<PaletteId | "custom">(theme.palette);
  const [typography, setTypography] = useState<TypographyId>(theme.typography);

  function save(next: Partial<{ preset: ThemePresetId; palette: PaletteId; typography: TypographyId }>) {
    const merged = { preset, palette, typography, ...next };
    setPreset(merged.preset);
    if (merged.palette !== "custom") setPalette(merged.palette);
    setTypography(merged.typography);

    startTransition(async () => {
      const result = await saveTheme({
        preset: merged.preset,
        palette: merged.palette,
        hero_style: theme.heroStyle,
        monogram: theme.monogram,
        typography: merged.typography,
      });
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
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
                onClick={() => save({ preset: id })}
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
          {preset !== "editorial" ? (
            <p className="text-xs text-muted">
              The Script theme sets its own two faces — this choice applies to Editorial.
            </p>
          ) : null}
        </div>
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
