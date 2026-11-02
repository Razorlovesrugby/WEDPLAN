"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveRegistrySettings, saveRegistryShipping } from "@/server/actions/registry";
import { setSitePhotoFocalPoint } from "@/server/actions/site-photos";
import {
  REGISTRY_PAIRINGS,
  REGISTRY_PAIRING_IDS,
  REGISTRY_PALETTES,
  REGISTRY_PALETTE_IDS,
  resolvePairing,
  resolvePalette,
} from "@/lib/registry/look";
import type { RegistrySettingsRow, RegistryShippingRow } from "@/lib/types/database";
import {
  CONTRIBUTE_LABELS,
  CONTRIBUTE_POSITIONS,
  contributeHint,
  resolveContributePosition,
} from "@/lib/registry/contribute";
import { PreviewFrame, type PreviewDevice } from "@/components/preview-frame";
import { Field, Toggle } from "./field";
import { ImageField } from "./image-field";

/** What the couple have set up under Site → A gift, so this screen can say when there is nothing to show. */
export type GiftSetup = { fundCount: number; hasBank: boolean; hasOnlineLink: boolean };

export type ImageOption = {
  id: string;
  kind: string;
  alt: string | null;
  focal: { x: number; y: number } | null;
};

/**
 * Everything about the page that isn't an item (spec 36 §4, §5): on/off, the
 * words, the pictures, the look, and — in a card of its own, saved separately —
 * where the gifts go.
 */
export function SettingsForm({
  settings,
  shipping,
  images,
  giftSetup,
  previewHref,
}: {
  settings: RegistrySettingsRow;
  shipping: RegistryShippingRow | null;
  images: ImageOption[];
  giftSetup: GiftSetup;
  /** `/registry/<slug>?preview=1` — the planner-only view of the real public page. */
  previewHref: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,26rem)]">
      <div className="space-y-4">
        <PageCard
          settings={settings}
          images={images}
          giftSetup={giftSetup}
          onDirty={setDirty}
          // A save reloads the frame in place; it is never remounted, so no `key`.
          onSaved={() => frame.current?.contentWindow?.location.reload()}
        />
        <AddressCard shipping={shipping} />
      </div>
      <PreviewPane previewHref={previewHref} frame={frame} dirty={dirty} />
    </div>
  );
}

function PreviewPane({
  previewHref,
  frame,
  dirty,
}: {
  previewHref: string;
  frame: React.RefObject<HTMLIFrameElement | null>;
  dirty: boolean;
}) {
  const [device, setDevice] = useState<PreviewDevice>("phone");

  return (
    <aside className="card p-0 lg:sticky lg:top-4" aria-label="Preview">
      <div className="flex items-center gap-2 px-4 py-3">
        {(["phone", "desktop"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={device === option}
            className={`btn px-2.5 py-1 text-xs capitalize ${device === option ? "border-accent bg-[#f6f3ee]" : ""}`}
            onClick={() => setDevice(option)}
          >
            {option}
          </button>
        ))}
        <Link href={previewHref} target="_blank" className="ml-auto text-xs text-muted underline">
          Open in a tab
        </Link>
      </div>
      <p role="status" className="px-4 pb-3 text-xs text-muted">
        {dirty ? "You have unsaved changes — press Save the page to see them here." : "Showing what you last saved. Nothing pressed here is saved."}
      </p>
      <PreviewFrame device={device} iframeRef={frame} src={previewHref} />
    </aside>
  );
}

function PageCard({
  settings,
  images,
  giftSetup,
  onDirty,
  onSaved,
}: {
  settings: RegistrySettingsRow;
  images: ImageOption[];
  giftSetup: GiftSetup;
  onDirty: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [s, setS] = useState(() => ({
    enabled: settings.enabled,
    open: settings.open,
    title: settings.title ?? "",
    intro: settings.intro ?? "",
    hero_asset_id: settings.hero_asset_id,
    thanks_text: settings.thanks_text ?? "",
    thanks_asset_id: settings.thanks_asset_id,
    no_gifts_line: settings.no_gifts_line ?? "",
    show_prices: settings.show_prices,
    show_taken: settings.show_taken,
    contribute_position: resolveContributePosition(settings.contribute_position) as string,
    contribute_heading: settings.contribute_heading ?? "",
    contribute_text: settings.contribute_text ?? "",
    contribute_button_only: settings.contribute_button_only,
    disclosure_on: settings.disclosure_on,
    disclosure_text: settings.disclosure_text ?? "",
    palette: resolvePalette(settings.palette).id as string,
    type_pairing: resolvePairing(settings.type_pairing) as string,
  }));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [saved, setSaved] = useState(s);

  const set = <K extends keyof typeof s>(key: K, value: (typeof s)[K]) => {
    const next = { ...s, [key]: value };
    setS(next);
    setStatus(null);
    onDirty(JSON.stringify(next) !== JSON.stringify(saved));
  };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveRegistrySettings(s);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.error);
        return;
      }
      setErrors({});
      setStatus("Saved");
      setSaved(s);
      onDirty(false);
      router.refresh();
      onSaved();
    });
  }

  const contributePosition = resolveContributePosition(s.contribute_position);
  const contributeNote = contributeHint({
    position: contributePosition,
    heading: s.contribute_heading,
    text: s.contribute_text,
    buttonOnly: s.contribute_button_only,
    fundCount: giftSetup.fundCount,
    hasBank: giftSetup.hasBank,
    hasOnlineLink: giftSetup.hasOnlineLink,
  });

  const hero = images.find((i) => i.id === s.hero_asset_id) ?? null;
  const [focal, setFocal] = useState(hero?.focal ?? null);

  function pickFocal(point: { x: number; y: number }) {
    if (!s.hero_asset_id) return;
    setFocal(point);
    void setSitePhotoFocalPoint(s.hero_asset_id, point);
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-4">
      <section className="space-y-3">
        <h2 className="font-serif text-lg">The page</h2>
        <Toggle
          checked={s.enabled}
          onChange={(v) => set("enabled", v)}
          label="The registry is on"
          hint="Off means the link shows “This link isn’t active”. Nothing is deleted."
        />
        <Toggle
          checked={s.open}
          onChange={(v) => set("open", v)}
          label="Open to new gifts"
          hint="Turn this off after the wedding to keep the page up with a thank-you, but stop new claims."
        />
        <Field label="Heading (optional)" errors={errors["title"]} hint="Defaults to your names.">
          <input className="field" value={s.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="A line under it" errors={errors["intro"]} hint="e.g. “Your being there is the gift. If you’d like to give something too —”">
          <textarea className="field min-h-20" value={s.intro} maxLength={600} onChange={(e) => set("intro", e.target.value)} />
        </Field>
        <Field label="A line for people who can't come, or don't want to buy (optional)" errors={errors["no_gifts_line"]} hint="e.g. “A card is plenty.” Shown in a quiet note.">
          <input className="field" value={s.no_gifts_line} maxLength={300} onChange={(e) => set("no_gifts_line", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg">Pictures</h2>
        <ImageField label="Top-of-page photograph" value={s.hero_asset_id} onChange={(id) => { set("hero_asset_id", id); setFocal(null); }} helper="A wide photograph works best." />
        {hero ? (
          <div>
            <p className="mb-1 text-xs text-muted">Click the face, or whatever must stay in frame when it is cropped.</p>
            <button
              type="button"
              className="relative block w-full max-w-md cursor-crosshair overflow-hidden rounded border border-line"
              aria-label="Choose what stays in frame"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                pickFocal({
                  x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
                  y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
                });
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address */}
              <img src={`/api/photo/${hero.id}?w=960`} alt="" className="block max-h-56 w-full object-contain" />
              {focal ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                  style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
                />
              ) : null}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg">Saying thank you</h2>
        <p className="text-sm text-muted">Shown near the top of the page, and again to anyone who says they&rsquo;ll buy something.</p>
        <Field label="Your words" errors={errors["thanks_text"]}>
          <textarea className="field min-h-28" value={s.thanks_text} maxLength={1500} onChange={(e) => set("thanks_text", e.target.value)} />
        </Field>
        <ImageField label="A photograph to go with it (optional)" value={s.thanks_asset_id} onChange={(id) => set("thanks_asset_id", id)} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg">What visitors see</h2>
        <Toggle checked={s.show_prices} onChange={(v) => set("show_prices", v)} label="Show prices" hint="Also adds a price filter." />
        <Toggle checked={s.show_taken} onChange={(v) => set("show_taken", v)} label="Keep claimed items on the page, marked “Someone's got this one”" hint="Off: a claimed item simply disappears. Neither shows who." />
        <Toggle checked={s.disclosure_on} onChange={(v) => set("disclosure_on", v)} label="Say some links may earn you a commission" />
        {s.disclosure_on ? (
          <Field label="Wording" errors={errors["disclosure_text"]} hint="Leave blank for the standard line.">
            <input className="field" value={s.disclosure_text} maxLength={300} onChange={(e) => set("disclosure_text", e.target.value)} />
          </Field>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg">Contribute</h2>
        <p className="text-sm text-muted">
          For guests who&rsquo;d rather give than buy: your gift funds and a Contribute button with your bank
          details, the same as on your wedding site. Uses what you set up under{" "}
          <Link href="/site/gifts" className="underline">Site → A gift</Link>. Nothing is taken here and nobody is recorded.
        </p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Contribute button</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {CONTRIBUTE_POSITIONS.map((id) => (
              <label
                key={id}
                className={`cursor-pointer rounded border p-2 text-sm ${contributePosition === id ? "border-ink ring-1 ring-ink" : "border-line"}`}
              >
                <input type="radio" name="contribute_position" className="sr-only" checked={contributePosition === id} onChange={() => set("contribute_position", id)} />
                {CONTRIBUTE_LABELS[id]}
              </label>
            ))}
          </div>
          {errors["contribute_position"] ? <span className="mt-1 block text-sm text-red-700">{errors["contribute_position"].join(" ")}</span> : null}
        </fieldset>
        {contributePosition !== "off" ? (
          <>
            <p className="rounded border border-line px-3 py-2 text-sm">
              <strong className="font-medium">Anyone with the registry link can see these details.</strong> Unlike your
              wedding site, this address isn&rsquo;t private to one household. The page is kept out of search engines.
            </p>
            {contributeNote ? (
              <p role="status" className="text-sm text-muted">
                {contributeNote}{" "}
                <Link href="/site/gifts" className="underline">Open Site → A gift</Link>
              </p>
            ) : null}
            <Toggle
              checked={s.contribute_button_only}
              onChange={(v) => set("contribute_button_only", v)}
              label="Show just the button — don't list the funds"
            />
            <Field label="Heading (optional)" errors={errors["contribute_heading"]} hint={contributePosition === "above" ? "Defaults to “Prefer to contribute?”" : "Defaults to “Or give towards something bigger”"}>
              <input className="field" value={s.contribute_heading} maxLength={120} onChange={(e) => set("contribute_heading", e.target.value)} />
            </Field>
            <Field label="A line under it (optional)" errors={errors["contribute_text"]} hint="e.g. “No gift needed — but if you’d like to help with the honeymoon…”">
              <textarea className="field min-h-16" value={s.contribute_text} maxLength={600} onChange={(e) => set("contribute_text", e.target.value)} />
            </Field>
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg">The look</h2>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Colours</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGISTRY_PALETTE_IDS.map((id) => {
              const { label, tokens } = REGISTRY_PALETTES[id];
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-sm ${s.palette === id ? "border-ink ring-1 ring-ink" : "border-line"}`}
                >
                  <input type="radio" name="palette" className="sr-only" checked={s.palette === id} onChange={() => set("palette", id)} />
                  <span className="flex overflow-hidden rounded border border-line" aria-hidden="true">
                    {[tokens.paper, tokens.accent, tokens.ink].map((c) => <span key={c} className="h-6 w-4" style={{ background: c }} />)}
                  </span>
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Lettering</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {REGISTRY_PAIRING_IDS.map((id) => (
              <label
                key={id}
                className={`cursor-pointer rounded border p-2 text-sm ${s.type_pairing === id ? "border-ink ring-1 ring-ink" : "border-line"}`}
              >
                <input type="radio" name="pairing" className="sr-only" checked={s.type_pairing === id} onChange={() => set("type_pairing", id)} />
                <span className="block font-medium">{REGISTRY_PAIRINGS[id].label}</span>
                <span className="block text-xs text-muted">{REGISTRY_PAIRINGS[id].blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save the page"}</button>
        {status ? <span role="status" className="text-sm text-muted">{status}</span> : null}
      </div>
    </form>
  );
}

function AddressCard({ shipping }: { shipping: RegistryShippingRow | null }) {
  const router = useRouter();
  const [a, setA] = useState({
    recipient_name: shipping?.recipient_name ?? "",
    line1: shipping?.line1 ?? "",
    line2: shipping?.line2 ?? "",
    city: shipping?.city ?? "",
    region: shipping?.region ?? "",
    postcode: shipping?.postcode ?? "",
    country: shipping?.country ?? "New Zealand",
    courier_note: shipping?.courier_note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof a, value: string) => {
    setA((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveRegistryShipping(a);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.error);
        return;
      }
      setErrors({});
      setStatus("Saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div>
        <h2 className="font-serif text-lg">Where gifts should go</h2>
        <p className="mt-0.5 text-sm text-muted">
          <strong className="font-medium text-ink">This is not on the page.</strong> It is shown only to someone who has just said they&rsquo;ll buy something &mdash; so a stranger with the link never sees your address.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name on the parcel" errors={errors["recipient_name"]}><input className="field" value={a.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} /></Field>
        <Field label="Street address" errors={errors["line1"]}><input className="field" value={a.line1} onChange={(e) => set("line1", e.target.value)} /></Field>
        <Field label="Unit / building (optional)" errors={errors["line2"]}><input className="field" value={a.line2} onChange={(e) => set("line2", e.target.value)} /></Field>
        <Field label="Suburb / city" errors={errors["city"]}><input className="field" value={a.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Region (optional)" errors={errors["region"]}><input className="field" value={a.region} onChange={(e) => set("region", e.target.value)} /></Field>
        <Field label="Postcode" errors={errors["postcode"]}><input className="field" inputMode="numeric" value={a.postcode} onChange={(e) => set("postcode", e.target.value)} /></Field>
        <Field label="Country" errors={errors["country"]}><input className="field" value={a.country} onChange={(e) => set("country", e.target.value)} /></Field>
      </div>
      <Field label="A note for the courier (optional)" hint="e.g. “Leave at the gate”." errors={errors["courier_note"]}>
        <input className="field" value={a.courier_note} maxLength={300} onChange={(e) => set("courier_note", e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save the address"}</button>
        {status ? <span role="status" className="text-sm text-muted">{status}</span> : null}
      </div>
    </form>
  );
}
