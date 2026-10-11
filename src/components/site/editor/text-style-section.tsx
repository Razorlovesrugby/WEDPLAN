"use client";

import { useState, useTransition } from "react";
import { saveTheme, setMatchAllText } from "@/server/actions/site";
import { PALETTES, themeTokens, isEditorialFamily, type SiteTheme } from "@/lib/theme/presets";
import {
  FONT_CHOICES,
  FONT_IDS,
  TEXT_SWATCHES,
  ratioAgainst,
  textColourFailures,
  type FontId,
  type TextColours,
  type TextRole,
} from "@/lib/theme/text-style";
import { isHexColor } from "@/lib/theme/contrast";
import { Section } from "./rail";

const ROLE_COPY: Record<TextRole, { title: string; help: string }> = {
  ink: { title: "Text", help: "Headings and body. Also the colour of buttons and lines." },
  muted: { title: "Secondary text", help: "Times, captions and small print." },
  accent: { title: "Links", help: "Links and highlights." },
};

/**
 * Site-wide text colour and font, and the switch that keeps every section the
 * same (spec 31). Saves on change, like the rest of the rail.
 *
 * **The swatches that would be unreadable on this palette are disabled, not
 * hidden**, with the ratio shown — the gate is `textColourFailures`, the same
 * `validatePalette` a palette passes, so this panel and the server cannot
 * disagree. The server re-checks regardless.
 */
export function TextStyleSection({
  theme,
  blocksWithOwnStyle,
  onSaved,
}: {
  theme: SiteTheme;
  /** How many blocks carry their own colour or font — the number the confirm quotes. */
  blocksWithOwnStyle: number;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [colours, setColours] = useState<TextColours>(theme.textStyle.colours);
  const [fonts, setFonts] = useState(theme.textStyle.fonts);
  const [matchAll, setMatchAll] = useState(theme.textStyle.matchAll);
  const [hex, setHex] = useState<Partial<Record<TextRole, string>>>({});

  const tokens = themeTokens(theme);
  const editorial = isEditorialFamily(theme.preset);

  function persist(nextColours: TextColours, nextFonts: typeof fonts) {
    setColours(nextColours);
    setFonts(nextFonts);
    startTransition(async () => {
      const custom = theme.customTokens;
      const result = await saveTheme({
        preset: theme.preset,
        palette: theme.palette,
        hero_style: theme.heroStyle,
        monogram: theme.monogram,
        typography: theme.typography,
        text_colours: nextColours,
        fonts: nextFonts,
        ...(theme.palette === "custom" && custom
          ? { custom_ink: custom.ink, custom_paper: custom.paper, custom_muted: custom.muted, custom_line: custom.line, custom_accent: custom.accent }
          : {}),
      });
      setError(result.ok ? null : result.error);
      if (result.ok) onSaved();
    });
  }

  function chooseColour(role: TextRole, value: string | undefined) {
    const next = { ...colours };
    if (value) next[role] = value;
    else delete next[role];
    persist(next, fonts);
  }

  function toggleMatch(on: boolean) {
    if (on && blocksWithOwnStyle > 0) {
      const noun = blocksWithOwnStyle === 1 ? "1 section" : `${blocksWithOwnStyle} sections`;
      // Destructive and without an undo — the planner chose "clear" over "keep
      // but ignore" (spec 31 Q7), so the count goes in the question.
      if (!confirm(`Use the same text style everywhere? ${noun} with their own colour or font will go back to the site's.`)) return;
    }
    setMatchAll(on);
    startTransition(async () => {
      const result = await setMatchAllText(on);
      if (!result.ok) {
        setMatchAll(!on);
        setError(result.error);
      } else {
        setError(null);
        onSaved();
      }
    });
  }

  function roleControl(role: TextRole) {
    const current = colours[role];
    const typed = hex[role] ?? current ?? "";
    const typedOk = isHexColor(typed);
    const typedProblems = typedOk && typed !== current ? textColourFailures(tokens, { [role]: typed }) : [];
    return (
      <div key={role} className="space-y-2">
        <div>
          <p className="text-sm font-medium">{ROLE_COPY[role].title}</p>
          <p className="text-xs text-muted">{ROLE_COPY[role].help}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEXT_SWATCHES[role].map((swatch) => {
            const failures = textColourFailures(tokens, { [role]: swatch.hex });
            const ratio = ratioAgainst(swatch.hex, tokens.paper);
            const selected = current?.toLowerCase() === swatch.hex;
            return (
              <button
                key={swatch.hex}
                type="button"
                disabled={pending || failures.length > 0}
                aria-pressed={selected}
                title={
                  failures.length > 0
                    ? `${swatch.label} — too faint on this background (${ratio}:1, needs 4.5:1)`
                    : `${swatch.label} — ${ratio}:1`
                }
                onClick={() => chooseColour(role, swatch.hex)}
                className={`h-7 w-7 rounded-full border ${
                  selected ? "ring-2 ring-accent ring-offset-1" : ""
                } ${failures.length > 0 ? "opacity-30" : ""}`}
                style={{ background: swatch.hex }}
              >
                <span className="sr-only">{swatch.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            className="field w-28 font-mono text-xs"
            placeholder="#2b2724"
            value={typed}
            onChange={(event) => setHex({ ...hex, [role]: event.target.value })}
            onBlur={() => {
              if (typed === (current ?? "")) return;
              if (typed === "") return chooseColour(role, undefined);
              if (typedOk && typedProblems.length === 0) chooseColour(role, typed);
            }}
            aria-label={`${ROLE_COPY[role].title} as a hex colour`}
          />
          {current ? (
            <button type="button" className="text-xs text-muted underline" onClick={() => { setHex({ ...hex, [role]: "" }); chooseColour(role, undefined); }}>
              Reset to palette
            </button>
          ) : null}
        </div>
        {typed !== "" && !typedOk ? <p className="text-xs text-red-700">Use a hex colour like #2b2724.</p> : null}
        {typedProblems.length > 0 ? <p className="text-xs text-red-700">{typedProblems.join(" ")}</p> : null}
      </div>
    );
  }

  function fontControl(kind: "heading" | "body") {
    const current = fonts[kind];
    const options: Array<[FontId | undefined, string]> = [
      [undefined, "Theme default"],
      ...FONT_IDS.map((id): [FontId, string] => [id, FONT_CHOICES[id].label]),
    ];
    return (
      <div key={kind} className="space-y-1.5">
        <p className="text-sm font-medium">{kind === "heading" ? "Heading font" : "Body font"}</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map(([id, label]) => (
            <button
              key={label}
              type="button"
              disabled={pending}
              aria-pressed={current === id}
              onClick={() => {
                const next = { ...fonts };
                if (id) next[kind] = id;
                else delete next[kind];
                persist(colours, next);
              }}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${
                current === id ? "border-accent bg-[#f6f3ee]" : "border-line hover:border-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Section
      title="Text colour & font"
      blurb={`Also colours buttons and lines. Words over a photograph keep their own colour unless a section sets one. Palette: ${theme.palette === "custom" ? "custom" : PALETTES[theme.palette].label}.`}
    >
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          disabled={pending}
          checked={matchAll}
          onChange={(event) => toggleMatch(event.target.checked)}
        />
        <span>
          Same text style in every section
          <span className="block text-xs text-muted">
            On: every section uses the colours and font below. Off: a section can set its own from
            its settings. Turning this on resets any section that has its own.
          </span>
        </span>
      </label>

      <div className="space-y-4">
        {roleControl("ink")}
        <details>
          <summary className="cursor-pointer text-xs text-muted">More colours</summary>
          <div className="mt-3 space-y-4">
            {roleControl("muted")}
            {roleControl("accent")}
          </div>
        </details>
        <div className="space-y-3 border-t border-line pt-3">
          {fontControl("body")}
          {editorial ? (
            fontControl("heading")
          ) : (
            <p className="text-xs text-muted">The Script theme keeps its own heading face.</p>
          )}
        </div>
      </div>
    </Section>
  );
}
