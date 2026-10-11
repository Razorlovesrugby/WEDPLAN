"use client";

import { useState } from "react";
import type { BlockStyle } from "@/lib/site/blocks";
import { isHexColor } from "@/lib/theme/contrast";
import { siteTokens, type SiteTheme } from "@/lib/theme/presets";
import {
  FONT_CHOICES,
  FONT_IDS,
  TEXT_SWATCHES,
  blockGround,
  ratioAgainst,
  resolveBlockText,
  type FontId,
} from "@/lib/theme/text-style";

/**
 * One block's own text colour and font (spec 31).
 *
 * Only live while the site's "same text style in every section" switch is off —
 * while it is on the block's values are ignored, so offering the pickers would
 * be offering a control that does nothing. The checks run against **this
 * block's own background**, which is why the same swatch can be available here
 * and disabled on the next block down. Over a photograph nothing can be
 * checked, so every swatch is available and the panel says so (Q4).
 */
export function BlockTextStyle({
  style,
  theme,
  pending,
  onStyle,
}: {
  style: BlockStyle;
  theme: SiteTheme;
  pending: boolean;
  onStyle: (next: Partial<BlockStyle>) => void;
}) {
  const hasOwn = Boolean(style.textColour || style.mutedColour || style.bodyFont);
  const [custom, setCustom] = useState(hasOwn);
  const [hex, setHex] = useState<{ text?: string; muted?: string }>({});

  if (theme.textStyle.matchAll) {
    return (
      <p className="text-xs text-muted">
        Text colour and font follow the whole site. To set them for this section alone, turn off
        &ldquo;Same text style in every section&rdquo; under Text colour &amp; font.
      </p>
    );
  }

  const tokens = siteTokens(theme);
  const ground = blockGround(style.background, tokens);
  const photo = style.background === "photograph";
  const current = resolveBlockText(
    { background: style.background, textColour: style.textColour, mutedColour: style.mutedColour },
    tokens,
  );

  function passes(value: string): boolean {
    if (ground === null) return true;
    const ratio = ratioAgainst(value, ground);
    return ratio !== null && ratio >= 4.5;
  }

  function swatches(kind: "text" | "muted") {
    const key = kind === "text" ? "textColour" : "mutedColour";
    const stored = style[key];
    const list = TEXT_SWATCHES[kind === "text" ? "ink" : "muted"];
    const typed = hex[kind] ?? stored ?? "";
    const typedOk = isHexColor(typed);
    return (
      <div className="space-y-1.5">
        <span className="block text-xs text-muted">{kind === "text" ? "Text colour" : "Secondary text"}</span>
        <div className="flex flex-wrap gap-1.5">
          {list.map((swatch) => {
            const ok = passes(swatch.hex);
            const ratio = ground ? ratioAgainst(swatch.hex, ground) : null;
            return (
              <button
                key={swatch.hex}
                type="button"
                disabled={pending || !ok}
                aria-pressed={stored?.toLowerCase() === swatch.hex}
                title={ok ? swatch.label : `${swatch.label} — too faint here (${ratio}:1, needs 4.5:1)`}
                onClick={() => onStyle({ [key]: swatch.hex })}
                className={`h-6 w-6 rounded-full border ${
                  stored?.toLowerCase() === swatch.hex ? "ring-2 ring-accent ring-offset-1" : ""
                } ${ok ? "" : "opacity-30"}`}
                style={{ background: swatch.hex }}
              >
                <span className="sr-only">{swatch.label}</span>
              </button>
            );
          })}
        </div>
        <input
          className="field w-28 font-mono text-xs"
          placeholder="#2b2724"
          aria-label={`${kind === "text" ? "Text colour" : "Secondary text"} as a hex colour`}
          value={typed}
          onChange={(event) => setHex({ ...hex, [kind]: event.target.value })}
          onBlur={() => {
            if (typed === (stored ?? "")) return;
            if (typed === "") return onStyle({ [key]: undefined });
            if (typedOk && passes(typed)) onStyle({ [key]: typed });
          }}
        />
        {typed !== "" && !typedOk ? <p className="text-xs text-red-700">Use a hex colour like #2b2724.</p> : null}
        {typedOk && !passes(typed) ? (
          <p className="text-xs text-red-700">
            Too faint on this background ({ratioAgainst(typed, ground as string)}:1, needs 4.5:1).
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          disabled={pending}
          checked={!custom}
          onChange={(event) => {
            if (event.target.checked) {
              setCustom(false);
              if (hasOwn) onStyle({ textColour: undefined, mutedColour: undefined, bodyFont: undefined });
            } else setCustom(true);
          }}
        />
        <span>Use the site&rsquo;s text style</span>
      </label>

      {custom ? (
        <div className="space-y-3 rounded-md border border-line p-2.5">
          {swatches("text")}
          {!photo ? swatches("muted") : null}
          <div className="space-y-1.5">
            <span className="block text-xs text-muted">Body font</span>
            <div className="flex flex-wrap gap-1.5">
              {([undefined, ...FONT_IDS] as Array<FontId | undefined>).map((id) => (
                <button
                  key={id ?? "site"}
                  type="button"
                  disabled={pending}
                  aria-pressed={style.bodyFont === id}
                  onClick={() => onStyle({ bodyFont: id })}
                  className={`rounded border px-2 py-1 text-xs ${
                    style.bodyFont === id ? "border-accent bg-[#f6f3ee] font-medium" : "border-line hover:border-ink"
                  }`}
                >
                  {id ? FONT_CHOICES[id].label : "Site default"}
                </button>
              ))}
            </div>
          </div>
          {photo ? (
            <p className="text-xs text-muted">
              We can&rsquo;t check this against your picture. Look at it on a phone; a soft text
              shadow, a darkened photo or a panel will help if it&rsquo;s hard to read.
            </p>
          ) : null}
          {current.problems.length > 0 ? (
            <p className="text-xs text-red-700">
              Not being used: {current.problems.join(" ")} The site&rsquo;s colour shows instead.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
