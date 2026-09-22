"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveSaveTheDate } from "@/server/actions/save-the-date";
import { uploadSitePhoto } from "@/components/site/editor/upload-photo";
import {
  DEFAULT_SAVE_THE_DATE_MESSAGE,
  SAVE_THE_DATE_LAYOUTS,
  SAVE_THE_DATE_LAYOUT_LABELS,
  SAVE_THE_DATE_PHOTO_LIMIT,
  SAVE_THE_DATE_TEXT_LIMITS as LIMITS,
  calendarEventTitle,
  googleCalendarUrl,
  saveTheDateDisplay,
  writeOutDate,
  type SaveTheDateContent,
  type SaveTheDateLayout,
} from "@/lib/site/save-the-date";
import {
  PALETTES,
  PALETTE_IDS,
  themeCssVars,
  themeTokens,
  type SiteTheme,
} from "@/lib/theme/presets";
import { SaveTheDateCard, type SaveTheDateCardPhoto } from "./card";

/**
 * The save-the-date designer (`/invitations/save-the-date`).
 *
 * A rail of controls beside a live preview, the same arrangement as `/site`.
 * The preview is the real card component re-rendered from this form's state
 * on every keystroke — no iframe, no round trip — and it sizes itself with
 * container queries, so the phone frame shows what a phone will show.
 *
 * Every text field may be left blank. Blank means "use the wedding's own":
 * the placeholder shows exactly what will be printed instead, so an empty box
 * never reads as an empty card.
 */

type Draft = {
  eyebrow: string;
  headline: string;
  dateLabel: string;
  location: string;
  message: string;
  photoIds: string[] | null;
  layout: SaveTheDateLayout;
  palette: SaveTheDateContent["palette"];
  showGreeting: boolean;
  showCountdown: boolean;
  showCalendar: boolean;
};

function toDraft(content: SaveTheDateContent): Draft {
  return {
    eyebrow: content.eyebrow,
    headline: content.headline ?? "",
    dateLabel: content.dateLabel ?? "",
    location: content.location ?? "",
    message: content.message,
    photoIds: content.photoIds,
    layout: content.layout,
    palette: content.palette,
    showGreeting: content.showGreeting,
    showCountdown: content.showCountdown,
    showCalendar: content.showCalendar,
  };
}

function toContent(draft: Draft): SaveTheDateContent {
  const blank = (value: string) => (value.trim() ? value.trim() : null);
  return {
    eyebrow: blank(draft.eyebrow) ?? "Save the date",
    headline: blank(draft.headline),
    dateLabel: blank(draft.dateLabel),
    location: blank(draft.location),
    message: blank(draft.message) ?? DEFAULT_SAVE_THE_DATE_MESSAGE,
    photoIds: draft.photoIds,
    layout: draft.layout,
    palette: draft.palette,
    showGreeting: draft.showGreeting,
    showCountdown: draft.showCountdown,
    showCalendar: draft.showCalendar,
  };
}

export type SaveTheDateEditorProps = {
  initial: SaveTheDateContent;
  siteTheme: SiteTheme;
  library: SaveTheDateCardPhoto[];
  autoPhotoIds: string[];
  wedding: { name: string; slug: string; wedding_date: string | null };
  /** One household, for the greeting in the preview and "open as them". */
  sample: { name: string; path: string } | null;
  opens: { opened: number; households: number };
};

export function SaveTheDateEditor({
  initial,
  siteTheme,
  library,
  autoPhotoIds,
  wedding,
  sample,
  opens,
}: SaveTheDateEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // Leaving with unsaved changes asks first. An hour choosing photos lost to
  // a stray click on the sidebar is the failure this prevents.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const content = toContent(draft);
  const display = saveTheDateDisplay(content, wedding);
  const palette: SiteTheme =
    draft.palette === "site" ? siteTheme : { ...siteTheme, palette: draft.palette };

  const byId = useMemo(() => new Map(library.map((photo) => [photo.id, photo])), [library]);
  const photoIds = draft.photoIds ?? autoPhotoIds;
  const photos = photoIds.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });

  const google = draft.showCalendar
    ? googleCalendarUrl({
        title: calendarEventTitle(display.headline),
        weddingDate: wedding.wedding_date,
        location: display.location,
        details: display.message,
      })
    : null;

  function save() {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await saveSaveTheDate(content);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(draft);
      setNotice("Saved — it's live on every household's link.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      {/* ---------------------------------------------------------------- rail */}
      <div className="space-y-5">
        {!wedding.wedding_date ? (
          <p className="rounded border border-tierB/40 bg-tierB/10 px-3 py-2 text-sm">
            There&rsquo;s no wedding date yet, so there&rsquo;s nothing to add to a calendar.{" "}
            <Link href="/settings" className="underline">
              Set it in Settings
            </Link>{" "}
            — or write the date line below yourself (&ldquo;Autumn 2027&rdquo;).
          </p>
        ) : null}

        <Panel title="Words">
          <Field
            label="Eyebrow"
            value={draft.eyebrow}
            placeholder="Save the date"
            max={LIMITS.eyebrow}
            onChange={(value) => set("eyebrow", value)}
          />
          <Field
            label="Names"
            value={draft.headline}
            placeholder={wedding.name}
            hint="Put “&” or “and” between them and it gets its own line."
            max={LIMITS.headline}
            onChange={(value) => set("headline", value)}
          />
          <Field
            label="Date"
            value={draft.dateLabel}
            placeholder={writeOutDate(wedding.wedding_date) ?? "14 March 2027"}
            hint="Blank uses the wedding date. The calendar button always uses the real date."
            max={LIMITS.dateLabel}
            onChange={(value) => set("dateLabel", value)}
          />
          <Field
            label="Where"
            value={draft.location}
            placeholder="Wānaka, New Zealand"
            max={LIMITS.location}
            onChange={(value) => set("location", value)}
          />
          <Field
            label="Message"
            value={draft.message}
            placeholder={DEFAULT_SAVE_THE_DATE_MESSAGE}
            max={LIMITS.message}
            multiline
            onChange={(value) => set("message", value)}
          />
        </Panel>

        <PhotosPanel
          library={library}
          chosen={draft.photoIds}
          autoPhotoIds={autoPhotoIds}
          onChange={(ids) => set("photoIds", ids)}
          onUploaded={() => router.refresh()}
        />

        <Panel title="Layout">
          <div className="grid grid-cols-3 gap-2">
            {SAVE_THE_DATE_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => set("layout", layout)}
                aria-pressed={draft.layout === layout}
                className={`rounded border p-2 text-left transition-colors ${
                  draft.layout === layout ? "border-ink bg-white" : "border-line hover:border-muted"
                }`}
              >
                <LayoutGlyph layout={layout} />
                <span className="mt-2 block text-xs font-medium">
                  {SAVE_THE_DATE_LAYOUT_LABELS[layout].label}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {SAVE_THE_DATE_LAYOUT_LABELS[draft.layout].description}
          </p>
        </Panel>

        <Panel title="Colour">
          <div className="flex flex-wrap gap-2">
            <Swatch
              label="Match site"
              tokens={themeTokens(siteTheme)}
              active={draft.palette === "site"}
              onClick={() => set("palette", "site")}
            />
            {PALETTE_IDS.map((id) => (
              <Swatch
                key={id}
                label={PALETTES[id].label}
                tokens={PALETTES[id].tokens}
                active={draft.palette === id}
                onClick={() => set("palette", id)}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Extras">
          <Toggle
            label="Greet each household by name"
            hint={sample ? `“For ${sample.name}”` : undefined}
            checked={draft.showGreeting}
            onChange={(value) => set("showGreeting", value)}
          />
          <Toggle
            label="Add-to-calendar buttons"
            hint="Apple, Outlook and Google. Hidden until there's a wedding date."
            checked={draft.showCalendar}
            onChange={(value) => set("showCalendar", value)}
          />
          <Toggle
            label="Countdown"
            hint="“214 days to go”"
            checked={draft.showCountdown}
            onChange={(value) => set("showCountdown", value)}
          />
        </Panel>
      </div>

      {/* ------------------------------------------------------------- preview */}
      <div className="space-y-3 lg:sticky lg:top-4">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-1" role="group" aria-label="Preview size">
            {(["phone", "desktop"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDevice(option)}
                aria-pressed={device === option}
                className={`rounded px-3 py-1 text-sm ${
                  device === option ? "bg-ink text-white" : "text-muted hover:bg-line/50"
                }`}
              >
                {option === "phone" ? "Phone" : "Desktop"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">
              Opened by {opens.opened} of {opens.households}
            </span>
            {sample ? (
              <a
                href={`${sample.path}?preview=1`}
                target="_blank"
                rel="noreferrer"
                className="btn"
                title="Opens the real page. Your own visit isn't counted."
              >
                Open as a guest ↗
              </a>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={save}
              disabled={pending || !dirty}
            >
              {pending ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : notice && !dirty ? (
          <p className="text-sm text-muted" role="status">
            {notice}{" "}
            <Link href="/guests" className="underline">
              Copy each household&rsquo;s link from Guests →
            </Link>
          </p>
        ) : null}

        <div className="rounded-lg bg-line/40 p-4 sm:p-6">
          {device === "phone" ? (
            <div className="mx-auto w-[390px] max-w-full overflow-hidden rounded-[28px] border-[6px] border-ink/85 bg-paper shadow-xl">
              <div className="h-[720px] overflow-y-auto">
                <PreviewCard
                  display={display}
                  sample={sample}
                  draft={draft}
                  photos={photos}
                  palette={palette}
                  google={google}
                  wedding={wedding}
                />
              </div>
            </div>
          ) : (
            <ScaledDesktop>
              <PreviewCard
                display={display}
                sample={sample}
                draft={draft}
                photos={photos}
                palette={palette}
                google={google}
                wedding={wedding}
              />
            </ScaledDesktop>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  display,
  sample,
  draft,
  photos,
  palette,
  google,
  wedding,
}: {
  display: ReturnType<typeof saveTheDateDisplay>;
  sample: SaveTheDateEditorProps["sample"];
  draft: Draft;
  photos: SaveTheDateCardPhoto[];
  palette: SiteTheme;
  google: string | null;
  wedding: SaveTheDateEditorProps["wedding"];
}) {
  return (
    <SaveTheDateCard
      display={display}
      greeting={draft.showGreeting ? (sample?.name ?? "the Okonkwos") : null}
      photos={photos}
      layout={draft.layout}
      colourVars={themeCssVars(palette)}
      typography={palette.typography}
      countdownDate={draft.showCountdown ? wedding.wedding_date : null}
      // Buttons that look real and go nowhere: a planner testing the design
      // should not be downloading calendar files.
      calendar={google ? { icsHref: "#", googleHref: "#" } : null}
    />
  );
}

/**
 * The page at a real desktop width, scaled to fit the column.
 *
 * Rendered at 1280px rather than squeezed, because the card's layout switches
 * on its own width — a desktop preview drawn at 700px would show the phone
 * layout and call it desktop.
 */
function ScaledDesktop({ children }: { children: React.ReactNode }) {
  const DESKTOP = 1280;
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(600);

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const next = Math.min(outer.current.clientWidth / DESKTOP, 1);
      setScale(next);
      setHeight(inner.current.scrollHeight * next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full overflow-hidden rounded-md shadow-xl" style={{ height }}>
      <div
        ref={inner}
        style={{
          width: DESKTOP,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function PhotosPanel({
  library,
  chosen,
  autoPhotoIds,
  onChange,
  onUploaded,
}: {
  library: SaveTheDateCardPhoto[];
  chosen: string[] | null;
  autoPhotoIds: string[];
  onChange: (ids: string[] | null) => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const automatic = chosen === null;
  const current = chosen ?? autoPhotoIds;
  const byId = new Map(library.map((photo) => [photo.id, photo]));
  const full = current.length >= SAVE_THE_DATE_PHOTO_LIMIT;

  function toggle(id: string) {
    if (current.includes(id)) {
      onChange(current.filter((existing) => existing !== id));
    } else if (!full) {
      onChange([...current, id]);
    }
  }

  function move(index: number, by: -1 | 1) {
    const next = [...current];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  async function upload(files: FileList) {
    setError(null);
    let ids = [...current];
    const list = Array.from(files).slice(0, SAVE_THE_DATE_PHOTO_LIMIT - ids.length);
    if (list.length === 0) {
      setError(
        `That's the most it holds — take one out first (up to ${SAVE_THE_DATE_PHOTO_LIMIT}).`,
      );
      return;
    }
    for (const [index, file] of list.entries()) {
      setBusy(`Uploading ${index + 1} of ${list.length}…`);
      const result = await uploadSitePhoto(file, "story");
      if (!result.ok) {
        setError(result.error);
        break;
      }
      ids = [...ids, result.assetId];
      onChange(ids);
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
    // The new photos need signed URLs from the server before they can show.
    onUploaded();
  }

  return (
    <Panel
      title="Photos"
      aside={
        automatic ? (
          <span className="text-xs text-muted">Automatic</span>
        ) : (
          <button
            type="button"
            className="text-xs text-muted underline"
            onClick={() => onChange(null)}
          >
            Back to automatic
          </button>
        )
      }
    >
      {automatic ? (
        <p className="mb-3 text-xs text-muted">
          Using your site&rsquo;s photos — hero first. Change anything below and it becomes your own
          choice.
        </p>
      ) : null}

      {current.length > 0 ? (
        <ol className="mb-3 space-y-1.5">
          {current.map((id, index) => {
            const photo = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded border border-line bg-white p-1.5"
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL
                  <img src={photo.url} alt="" className="h-12 w-12 shrink-0 object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 bg-line" />
                )}
                <span className="flex-1 text-xs text-muted">
                  {index === 0 ? "Lead photo" : `Photo ${index + 1}`}
                </span>
                <button
                  type="button"
                  className="px-1.5 text-muted hover:text-ink disabled:opacity-30"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move earlier"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="px-1.5 text-muted hover:text-ink disabled:opacity-30"
                  onClick={() => move(index, 1)}
                  disabled={index === current.length - 1}
                  aria-label="Move later"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="px-1.5 text-muted hover:text-red-700"
                  onClick={() => toggle(id)}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mb-3 text-xs text-muted">
          No photos — the words carry it on their own. That&rsquo;s a real design, not a gap.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy !== null || full}
          onClick={() => inputRef.current?.click()}
        >
          {busy ?? "Upload photos"}
        </button>
        <span className="text-xs text-muted">
          {current.length} of {SAVE_THE_DATE_PHOTO_LIMIT}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
          }}
        />
      </div>

      {library.length > 0 ? (
        <div className="mt-4">
          <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted">
            Your photos — tap to add or take out
          </span>
          <ul className="grid grid-cols-4 gap-1.5">
            {library.map((photo) => {
              const position = current.indexOf(photo.id);
              const selected = position >= 0;
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => toggle(photo.id)}
                    disabled={!selected && full}
                    aria-pressed={selected}
                    aria-label={photo.alt ?? (selected ? "Take this photo out" : "Add this photo")}
                    className={`relative block aspect-square w-full overflow-hidden rounded-sm border-2 disabled:opacity-40 ${
                      selected ? "border-accent" : "border-transparent hover:border-line"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    {selected ? (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold text-white">
                        {position + 1}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  hint,
  max,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  max: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const className = "field mt-1";
  return (
    <label className="mb-3 block last:mb-0">
      <span className="flex items-baseline justify-between text-sm font-medium">
        {label}
        {value.length > max * 0.8 ? (
          <span className="text-xs font-normal text-muted">
            {value.length}/{max}
          </span>
        ) : null}
      </span>
      {multiline ? (
        <textarea
          className={`${className} min-h-[92px]`}
          value={value}
          placeholder={placeholder}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={className}
          value={value}
          placeholder={placeholder}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mb-2.5 flex items-start gap-2.5 last:mb-0">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

function Swatch({
  label,
  tokens,
  active,
  onClick,
}: {
  label: string;
  tokens: { paper: string; ink: string; accent: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1 rounded p-1.5 ${active ? "bg-white ring-1 ring-ink" : ""}`}
    >
      <span
        className="flex h-9 w-9 items-end justify-end overflow-hidden rounded-full border border-line"
        style={{ background: tokens.paper }}
      >
        <span className="h-4 w-4 rounded-tl-full" style={{ background: tokens.accent }} />
      </span>
      <span className="text-[0.7rem]">{label}</span>
    </button>
  );
}

/** A thumbnail of each layout's composition, so the choice previews itself. */
function LayoutGlyph({ layout }: { layout: SaveTheDateLayout }) {
  const bar = "block rounded-[1px] bg-ink/70";
  if (layout === "cover") {
    return (
      <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-sm bg-muted/60">
        <span className={`${bar} absolute bottom-5 left-1.5 h-2 w-3/4 bg-white/90`} />
        <span className={`${bar} absolute bottom-2.5 left-1.5 h-1 w-1/2 bg-white/80`} />
      </span>
    );
  }
  if (layout === "editorial") {
    return (
      <span className="block aspect-[3/4] w-full rounded-sm border border-line bg-white p-1.5">
        <span className={`${bar} h-2.5 w-4/5`} />
        <span className={`${bar} mt-1 h-2.5 w-3/5`} />
        <span className="mt-1.5 block h-[45%] w-full rounded-[1px] bg-muted/50" />
      </span>
    );
  }
  return (
    <span className="flex aspect-[3/4] w-full flex-col items-center rounded-sm border border-line bg-white p-1.5">
      <span className="block h-[45%] w-4/5 rounded-[1px] bg-muted/50" />
      <span className={`${bar} mt-1.5 h-1.5 w-3/5`} />
      <span className={`${bar} mt-1 h-1 w-2/5 bg-ink/40`} />
    </span>
  );
}
