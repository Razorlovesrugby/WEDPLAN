"use client";

import { useState, useTransition } from "react";
import { saveSeatingSettings } from "@/server/actions/seating-workspace";
import { DEFAULT_SETTINGS, parseSettings, type PlanSettings } from "@/lib/seating/plan-settings";
import { FIXTURE_DEFAULTS } from "@/lib/seating/geometry";
import { LIBRARY } from "@/lib/seating/library";
import { useSeating } from "./seating-state";
import { useNavMode } from "./canvas-prefs";

const FIXTURE_KINDS = LIBRARY.filter((t) => t.item.type === "fixture").map((t) => ({ kind: (t.item as { kind: string }).kind, label: t.label }));

/**
 * Plan settings (spec 57 Part I): the thresholds that were the app's own
 * guesses, each starting at its default and changeable per plan. Leaving a
 * box empty puts its default back.
 */
export function SettingsPanel({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const { eventId, settings, setError, refresh } = useSeating();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => toFields(settings));
  const [saved, setSaved] = useState(false);
  const [navMode, setNavMode] = useNavMode();
  const set = (key: keyof ReturnType<typeof toFields>, value: string) => {
    setDraft({ ...draft, [key]: value });
    setSaved(false);
  };
  const num = (v: string | undefined): number | undefined => (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : undefined);

  const build = (): PlanSettings =>
    parseSettings({
      walkway: { comfortable: num(draft.comfortable), tight: num(draft.tight) },
      tightForShared: { longWidthCm: num(draft.longWidth), roundCm: num(draft.roundAcross) },
      tallCm: num(draft.tall),
      longTableCm: num(draft.longTable),
      defaultSizes: Object.fromEntries(
        FIXTURE_KINDS.flatMap(({ kind }) => {
          const w = num(draft[`w:${kind}`] ?? "");
          const d = num(draft[`d:${kind}`] ?? "");
          return w !== undefined && d !== undefined && (w !== FIXTURE_DEFAULTS[kind]!.width || d !== FIXTURE_DEFAULTS[kind]!.depth) ? [[kind, { width: w, depth: d }]] : [];
        }),
      ),
    });

  return (
    <details open={defaultOpen} className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">Plan settings</summary>
      <fieldset className="mt-3 space-y-1.5">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Moving around the plan, on this device</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="nav-mode" className="mt-1" checked={navMode === "trackpad"} onChange={() => setNavMode("trackpad")} />
          <span>
            <strong>Trackpad</strong> <span className="text-muted">(the usual): two-finger scroll or the wheel pans; pinch or ⌘/Ctrl + scroll zooms.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="nav-mode" className="mt-1" checked={navMode === "mouse"} onChange={() => setNavMode("mouse")} />
          <span>
            <strong>Mouse</strong> <span className="text-muted">: the wheel zooms about the pointer; Shift + wheel pans sideways, ⌘/Ctrl + wheel up and down.</span>
          </span>
        </label>
        <p className="text-xs text-muted">Never guessed from your device: it stays as you set it. Right-click the plan, or use the zoom box, to switch quickly.</p>
      </fieldset>
      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const next = build();
          startTransition(async () => {
            const r = await saveSeatingSettings(eventId, next);
            if (!r.ok) setError(r.error);
            else {
              setDraft(toFields(next));
              setSaved(true);
            }
            refresh();
          });
        }}
      >
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Walkways between tables</legend>
          <Field label="Comfortable from (cm)" value={draft.comfortable ?? ""} placeholder={String(DEFAULT_SETTINGS.walkway.comfortable)} onChange={(v) => set("comfortable", v)} />
          <Field label="Tight from (cm)" value={draft.tight ?? ""} placeholder={String(DEFAULT_SETTINGS.walkway.tight)} onChange={(v) => set("tight", v)} />
          <p className="text-xs text-muted sm:col-span-2">Anything narrower than “tight” is too tight. The Measure tool and the space-around-tables rings use these.</p>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Shared dishes</legend>
          <Field label="Long or banquet table narrower than (cm)" value={draft.longWidth ?? ""} placeholder={String(DEFAULT_SETTINGS.tightForShared.longWidthCm)} onChange={(v) => set("longWidth", v)} />
          <Field label="Round table under (cm across)" value={draft.roundAcross ?? ""} placeholder={String(DEFAULT_SETTINGS.tightForShared.roundCm)} onChange={(v) => set("roundAcross", v)} />
          <Field label="Tall centrepiece over (cm)" value={draft.tall ?? ""} placeholder={String(DEFAULT_SETTINGS.tallCm)} onChange={(v) => set("tall", v)} />
          <Field label="Two of each dish from a long table of (cm)" value={draft.longTable ?? ""} placeholder="not set" onChange={(v) => set("longTable", v)} />
        </fieldset>

        <details>
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted">Default sizes of library items</summary>
          <div className="mt-2 grid grid-cols-[1fr,5rem,5rem] items-center gap-x-2 gap-y-1">
            <span className="text-xs text-muted">Item</span>
            <span className="text-xs text-muted">Width (cm)</span>
            <span className="text-xs text-muted">Depth (cm)</span>
            {FIXTURE_KINDS.map(({ kind, label }) => (
              <div key={kind} className="contents">
                <span>{label}</span>
                <input className="field py-0.5" inputMode="numeric" aria-label={`${label} width`} value={draft[`w:${kind}`] ?? ""} placeholder={String(FIXTURE_DEFAULTS[kind]!.width)} onChange={(e) => set(`w:${kind}`, e.target.value)} />
                <input className="field py-0.5" inputMode="numeric" aria-label={`${label} depth`} value={draft[`d:${kind}`] ?? ""} placeholder={String(FIXTURE_DEFAULTS[kind]!.depth)} onChange={(e) => set(`d:${kind}`, e.target.value)} />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Set both sides to change one; an item placed already keeps its size.</p>
        </details>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            Save settings
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              setDraft(toFields(DEFAULT_SETTINGS));
              setSaved(false);
            }}
          >
            Back to the defaults
          </button>
          {saved ? <span className="text-muted" role="status">Saved</span> : null}
        </div>
      </form>
    </details>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input className="field w-full" inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** The form's text boxes for a set of settings. A value that is still the default is left empty, so the box shows it as a placeholder. */
function toFields(s: PlanSettings): Record<string, string> {
  const d = DEFAULT_SETTINGS;
  const f: Record<string, string> = {
    comfortable: s.walkway.comfortable === d.walkway.comfortable ? "" : String(s.walkway.comfortable),
    tight: s.walkway.tight === d.walkway.tight ? "" : String(s.walkway.tight),
    longWidth: s.tightForShared.longWidthCm === d.tightForShared.longWidthCm ? "" : String(s.tightForShared.longWidthCm),
    roundAcross: s.tightForShared.roundCm === d.tightForShared.roundCm ? "" : String(s.tightForShared.roundCm),
    tall: s.tallCm === d.tallCm ? "" : String(s.tallCm),
    longTable: s.longTableCm === null ? "" : String(s.longTableCm),
  };
  for (const [kind, size] of Object.entries(s.defaultSizes)) {
    f[`w:${kind}`] = String(size.width);
    f[`d:${kind}`] = String(size.depth);
  }
  return f;
}
