"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveTheme } from "@/server/actions/site";
import { validatePalette, isHexColor } from "@/lib/theme/contrast";
import {
  HERO_STYLES,
  PALETTES,
  PALETTE_IDS,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  themeTokens,
  type HeroStyle,
  type PaletteId,
  type SiteTheme,
  type ThemePresetId,
} from "@/lib/theme/presets";

/**
 * `/site/theme` (spec 14 §5, §13).
 *
 * The contrast check runs live here as well as on save. On save it is the
 * gate; here it is the explanation — a planner who picks a pale grey wants to
 * know *now* that it will fail, and why, rather than after pressing a button.
 * The server still re-checks, because this is a client component and nothing
 * it says is trustworthy.
 */

const HERO_LABELS: Record<HeroStyle, string> = {
  framed: "Framed photo, names underneath",
  full: "Photo fills the screen, names over it",
  type: "No photo — names and monogram only",
};

export function ThemeEditor({ theme, siteHref }: { theme: SiteTheme; siteHref: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [preset, setPreset] = useState<ThemePresetId>(theme.preset);
  const [palette, setPalette] = useState<PaletteId | "custom">(theme.palette);
  const [heroStyle, setHeroStyle] = useState<HeroStyle>(theme.heroStyle);
  const [monogram, setMonogram] = useState(theme.monogram);
  const [custom, setCustom] = useState(() => theme.customTokens ?? themeTokens(theme));

  const validation = useMemo(
    () => (palette === "custom" ? validatePalette(custom) : validatePalette(PALETTES[palette].tokens)),
    [palette, custom],
  );

  const customIsHex = Object.values(custom).every(isHexColor);
  const blocked = palette === "custom" && (!customIsHex || !validation.ok);

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await saveTheme({
        preset,
        palette,
        hero_style: heroStyle,
        monogram,
        // Carried through untouched. The pairing is chosen in the builder's
        // rail, and this screen saves the whole theme in one write — omitting
        // it would silently reset somebody's typography every time they came
        // here to change the hero style.
        typography: theme.typography,
        custom_ink: custom.ink,
        custom_paper: custom.paper,
        custom_muted: custom.muted,
        custom_line: custom.line,
        custom_accent: custom.accent,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Theme saved");
      router.refresh();
    });

  const preview = palette === "custom" ? custom : PALETTES[palette].tokens;

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}

      <section className="card p-4">
        <h2 className="font-medium">Theme</h2>
        <div className="mt-3 space-y-2">
          {THEME_PRESET_IDS.map((id) => (
            <label key={id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="preset"
                value={id}
                checked={preset === id}
                disabled={!THEME_PRESETS[id].available}
                onChange={() => setPreset(id)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{THEME_PRESETS[id].label}</span>
                {!THEME_PRESETS[id].available ? (
                  <span className="ml-2 text-xs text-muted">not built yet</span>
                ) : null}
                <span className="block text-xs text-muted">{THEME_PRESETS[id].description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-medium">Colours</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PALETTE_IDS.map((id) => (
            <label key={id} className="flex items-center gap-2 rounded border border-line p-2 text-sm">
              <input
                type="radio"
                name="palette"
                checked={palette === id}
                onChange={() => setPalette(id)}
              />
              <Swatch tokens={PALETTES[id].tokens} />
              <span>{PALETTES[id].label}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 rounded border border-line p-2 text-sm">
            <input
              type="radio"
              name="palette"
              checked={palette === "custom"}
              onChange={() => setPalette("custom")}
            />
            <Swatch tokens={custom} />
            <span>Custom</span>
          </label>
        </div>

        {palette === "custom" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["ink", "paper", "muted", "line", "accent"] as const).map((token) => (
              <div key={token}>
                <label htmlFor={`token-${token}`} className="block text-sm font-medium capitalize">
                  {token}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`token-${token}`}
                    className="field"
                    value={custom[token]}
                    onChange={(event) =>
                      setCustom((current) => ({ ...current, [token]: event.target.value }))
                    }
                    aria-invalid={!isHexColor(custom[token])}
                  />
                  <span
                    className="h-8 w-8 shrink-0 rounded border border-line"
                    style={{ background: isHexColor(custom[token]) ? custom[token] : "transparent" }}
                    aria-hidden="true"
                  />
                </div>
                {!isHexColor(custom[token]) ? (
                  <p className="mt-1 text-xs text-tierB">Needs to be a hex value like #7a5c3c</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <h3 className="text-sm font-medium">Readability</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {validation.checks.map((check) => (
              <li key={check.pair} className="flex flex-wrap items-baseline gap-2">
                <span className={check.passes || check.advisory ? "text-muted" : "text-tierB"}>
                  {check.passes ? "✓" : check.advisory ? "·" : "✗"} {check.pair}
                </span>
                <span className="text-muted">
                  {check.ratio}:1
                  {check.advisory
                    ? " — decorative, not checked"
                    : ` (needs ${check.required}:1 — ${check.note})`}
                </span>
              </li>
            ))}
          </ul>
          {blocked ? (
            <p className="mt-2 text-xs text-tierB">
              This palette won&rsquo;t save until the text contrast passes. Someone will be reading
              this on a phone, outdoors.
            </p>
          ) : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-medium">The top of the page</h2>
        <div className="mt-3 space-y-2">
          {HERO_STYLES.map((style) => (
            <label key={style} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="hero"
                checked={heroStyle === style}
                onChange={() => setHeroStyle(style)}
                className="mt-1"
              />
              <span>{HERO_LABELS[style]}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          With no photo set, the site falls back to names-only whichever of these is chosen.
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={monogram}
            onChange={(event) => setMonogram(event.target.checked)}
            className="mt-1"
          />
          <span>
            Show a monogram
            <span className="block text-xs text-muted">
              Your two initials, drawn from the wedding&rsquo;s name.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending || blocked} onClick={submit}>
          Save theme
        </button>
        <a className="text-sm text-muted underline" href={siteHref} target="_blank" rel="noreferrer">
          See the site →
        </a>
      </div>

      <PreviewStrip tokens={preview} />
    </div>
  );
}

function Swatch({ tokens }: { tokens: Record<string, string> }) {
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {["paper", "ink", "accent"].map((token) => (
        <span
          key={token}
          className="h-5 w-3 border border-line"
          style={{ background: isHexColor(tokens[token] ?? "") ? tokens[token] : "transparent" }}
        />
      ))}
    </span>
  );
}

/**
 * A rough idea of the result, not a real preview.
 *
 * The genuine article needs the site's fonts, which are loaded only on the
 * public site. Saying so is better than implying this is what it looks like.
 */
function PreviewStrip({ tokens }: { tokens: Record<string, string> }) {
  return (
    <section>
      <h2 className="text-sm font-medium">Roughly</h2>
      <p className="mb-2 text-xs text-muted">
        Colours only — the real fonts load on the site itself.
      </p>
      <div
        className="rounded border p-6 text-center"
        style={{ background: tokens["paper"], borderColor: tokens["line"] }}
      >
        <p className="text-2xl" style={{ color: tokens["ink"] }}>
          Alex &amp; Sam
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em]" style={{ color: tokens["muted"] }}>
          Saturday 12 June 2027
        </p>
        <span
          className="mt-4 inline-block rounded-sm px-3 py-1.5 text-xs uppercase tracking-[0.12em]"
          style={{ background: tokens["accent"], color: tokens["paper"] }}
        >
          RSVP
        </span>
      </div>
    </section>
  );
}
