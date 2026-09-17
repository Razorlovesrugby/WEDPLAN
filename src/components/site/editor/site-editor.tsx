"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldInput } from "./field";
import { SECTION_FORMS } from "@/lib/site/editor-fields";
import { SECTIONS, type SectionKey } from "@/lib/site/sections";
import {
  addStarterFaq,
  reorderSections,
  saveSiteBlock,
  setSectionVisible,
} from "@/server/actions/site";

/**
 * The `/site` editor (spec 14 §13).
 *
 * A list of sections with an inline form, the same shape as the question
 * builder: what the planner is doing is deciding what the site says as a
 * whole, not editing one section in isolation.
 *
 * Rendered from `SECTION_FORMS`, so a field the renderer reads and this
 * forgets is a test failure rather than a section nobody can fill in.
 */

export type EditorBlock = {
  block_key: string;
  payload: Record<string, unknown>;
  sort_order: number;
  visible: boolean;
};

export type EditorEvent = { id: string; name: string };

type Draft = Record<string, unknown>;

function rowsOf(payload: Draft, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export function SiteEditor({
  blocks,
  events,
  siteHref,
}: {
  blocks: EditorBlock[];
  events: EditorEvent[];
  siteHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  const byKey = new Map(blocks.map((block) => [block.block_key, block]));

  // The saved order, with anything unsaved falling back to the designed one,
  // so a site nobody has reordered still lists top to bottom as intended.
  const ordered = (Object.keys(SECTION_FORMS) as SectionKey[]).sort((a, b) => {
    const orderA = byKey.get(a)?.sort_order ?? SECTIONS[a].defaultOrder;
    const orderB = byKey.get(b)?.sort_order ?? SECTIONS[b].defaultOrder;
    return orderA - orderB || SECTIONS[a].defaultOrder - SECTIONS[b].defaultOrder;
  });

  const draftFor = (key: SectionKey): Draft =>
    drafts[key] ?? (byKey.get(key)?.payload as Draft | undefined) ?? {};

  const setDraft = (key: SectionKey, next: Draft) =>
    setDrafts((current) => ({ ...current, [key]: next }));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string[]> }>, done?: string) =>
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error ?? "That didn't save");
        return;
      }
      setErrors({});
      if (done) setMessage(done);
      router.refresh();
    });

  const save = (key: SectionKey) => {
    const draft = draftFor(key);
    const form = SECTION_FORMS[key];

    // The FAQ stores tags as an array; the editor asks for one, because a
    // question belongs in one group and a comma-separated list invites people
    // to type three and wonder why only the first groups it.
    const payload: Draft = { ...draft };
    if (form.repeat) {
      payload[form.repeat.key] = rowsOf(draft, form.repeat.key).map((row) => {
        if (key !== "faq") return row;
        const tag = typeof row["tags"] === "string" ? row["tags"].trim() : "";
        return { ...row, tags: tag ? [tag] : [] };
      });
    }

    run(() => saveSiteBlock(key, payload), `${SECTIONS[key].label} saved`);
  };

  const move = (key: SectionKey, direction: -1 | 1) => {
    const index = ordered.indexOf(key);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    next.splice(index, 1);
    next.splice(target, 0, key);
    run(() => reorderSections(next));
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}

      <ul className="space-y-2">
        {ordered.map((key, index) => {
          const block = byKey.get(key);
          const visible = block?.visible ?? true;
          const form = SECTION_FORMS[key];
          const draft = draftFor(key);
          const isOpen = open === key;

          return (
            <li key={key} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setOpen(isOpen ? null : key)}
                  aria-expanded={isOpen}
                >
                  <span className="font-medium">{SECTIONS[key].label}</span>
                  {!visible ? <span className="ml-2 text-xs text-muted">hidden</span> : null}
                  <span className="block text-xs text-muted">{form.blurb}</span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    disabled={pending || index === 0}
                    onClick={() => move(key, -1)}
                    aria-label={`Move ${SECTIONS[key].label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    disabled={pending || index === ordered.length - 1}
                    onClick={() => move(key, 1)}
                    aria-label={`Move ${SECTIONS[key].label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    disabled={pending}
                    onClick={() => run(() => setSectionVisible(key, !visible))}
                  >
                    {visible ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {isOpen ? (
                <div className="mt-4 space-y-4 border-t border-line pt-4">
                  {form.fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      field={field}
                      idPrefix={key}
                      value={draft[field.name]}
                      errors={errors[field.name]}
                      onChange={(value) => setDraft(key, { ...draft, [field.name]: value })}
                    />
                  ))}

                  {key === "schedule" ? (
                    <ScheduleExtras
                      events={events}
                      draft={draft}
                      onChange={(next) => setDraft(key, next)}
                    />
                  ) : null}

                  {form.repeat ? (
                    <Repeater
                      sectionKey={key}
                      draft={draft}
                      onChange={(next) => setDraft(key, next)}
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={pending}
                      onClick={() => save(key)}
                    >
                      Save
                    </button>
                    {key === "faq" ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const result = await addStarterFaq();
                            if (result.ok) {
                              setMessage(
                                result.data.added === 0
                                  ? "Those questions are already here"
                                  : `Added ${result.data.added} starter questions — they're drafts, so edit the bits in [brackets]`,
                              );
                            }
                            return result;
                          })
                        }
                      >
                        Add the starter questions
                      </button>
                    ) : null}
                    <a className="text-sm text-muted underline" href={`${siteHref}#${key}`} target="_blank" rel="noreferrer">
                      See it on the site →
                    </a>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Per-event dress codes and map links, keyed to the events that exist. */
function ScheduleExtras({
  events,
  draft,
  onChange,
}: {
  events: EditorEvent[];
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const rows = rowsOf(draft, "events");
  const rowFor = (id: string) => rows.find((row) => row["id"] === id) ?? { id };

  const update = (id: string, patch: Record<string, unknown>) => {
    const next = rows.filter((row) => row["id"] !== id);
    onChange({ ...draft, events: [...next, { ...rowFor(id), ...patch }] });
  };

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">
        No public events yet. Add them under Events and they&rsquo;ll appear here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Per event</p>
      {events.map((event) => {
        const row = rowFor(event.id);
        return (
          <div key={event.id} className="rounded border border-line p-3">
            <p className="text-sm font-medium">{event.name}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <FieldInput
                field={{ name: "dress_code", label: "Dress code", kind: "text" }}
                idPrefix={`event-${event.id}`}
                value={row["dress_code"]}
                onChange={(value) => update(event.id, { dress_code: value })}
              />
              <FieldInput
                field={{ name: "map_url", label: "Map link", kind: "text" }}
                idPrefix={`event-${event.id}`}
                value={row["map_url"]}
                onChange={(value) => update(event.id, { map_url: value })}
              />
            </div>
            <div className="mt-3">
              <FieldInput
                field={{ name: "detail", label: "Anything else", kind: "textarea", rows: 2 }}
                idPrefix={`event-${event.id}`}
                value={row["detail"]}
                onChange={(value) => update(event.id, { detail: value })}
              />
            </div>
            <div className="mt-3">
              <FieldInput
                field={{
                  name: "hide_time",
                  label: "Hide the time",
                  kind: "checkbox",
                  help: "For anything that's “evening” rather than a committed hour.",
                }}
                idPrefix={`event-${event.id}`}
                value={row["hide_time"]}
                onChange={(value) => update(event.id, { hide_time: value })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A list of rows — FAQ questions, party members, milestones. */
function Repeater({
  sectionKey,
  draft,
  onChange,
}: {
  sectionKey: SectionKey;
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const repeat = SECTION_FORMS[sectionKey].repeat!;
  const rows = rowsOf(draft, repeat.key);

  const write = (next: Record<string, unknown>[]) => onChange({ ...draft, [repeat.key]: next });

  const patch = (index: number, field: string, value: unknown) =>
    write(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    write(next);
  };

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="rounded border border-line p-3">
          <div className="mb-2 flex items-center justify-end gap-1">
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${repeat.noun} ${index + 1} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              disabled={index === rows.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${repeat.noun} ${index + 1} down`}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              onClick={() => write(rows.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
          <div className="space-y-3">
            {repeat.fields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                idPrefix={`${sectionKey}-${index}`}
                // The FAQ's tags round-trip as an array; the editor edits one.
                value={
                  field.name === "tags" && Array.isArray(row["tags"])
                    ? ((row["tags"] as unknown[])[0] ?? "")
                    : row[field.name]
                }
                onChange={(value) => patch(index, field.name, value)}
              />
            ))}
          </div>
        </div>
      ))}

      <button type="button" className="btn" onClick={() => write([...rows, {}])}>
        Add a {repeat.noun}
      </button>
    </div>
  );
}
