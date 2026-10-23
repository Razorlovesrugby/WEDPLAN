"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRegistryTag,
  deleteRegistryItem,
  deleteRegistryTag,
  renameRegistryTag,
  reorderRegistryItems,
  saveRegistryItem,
} from "@/server/actions/registry";
import { previewRegistryLink } from "@/server/actions/registry-import";
import { MAX_SPECS, formatPrice, minorToDollars, storeFromUrl, type Spec } from "@/lib/registry/items";
import type { PlannerRegistryItem } from "@/server/queries/registry";
import type { RegistryTagRow } from "@/lib/types/database";
import { Field, Toggle } from "./field";
import { ImageField } from "./image-field";

/**
 * The couple's item list (spec 36 §5). Each item is its own form: a page of
 * thirty items saved together is a page where a typo in the last loses the first
 * twenty-nine. The paste-a-link box pre-fills a NEW item and never saves.
 */

const SPEC_SUGGESTIONS = ["Colour", "Size", "Material", "Model"];

type Draft = {
  id?: string;
  title: string;
  url: string;
  price: string;
  note: string;
  quantity: string;
  specs: Spec[];
  ship_note: string;
  starred: boolean;
  hidden: boolean;
  image_asset_id: string | null;
  tag_ids: string[];
};

const EMPTY: Draft = {
  title: "", url: "", price: "", note: "", quantity: "1", specs: [], ship_note: "",
  starred: false, hidden: false, image_asset_id: null, tag_ids: [],
};

function toDraft(item: PlannerRegistryItem): Draft {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    price: minorToDollars(item.price_minor),
    note: item.note ?? "",
    quantity: String(item.quantity),
    specs: item.specs,
    ship_note: item.ship_note ?? "",
    starred: item.starred,
    hidden: item.hidden,
    image_asset_id: item.image_asset_id,
    tag_ids: item.tag_ids,
  };
}

export function ItemEditor({ items, tags }: { items: PlannerRegistryItem[]; tags: RegistryTagRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);

  function move(index: number, delta: -1 | 1) {
    const order = items.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    startTransition(async () => {
      const result = await reorderRegistryItems(order);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function remove(item: PlannerRegistryItem) {
    const claimed = item.claimed_quantity > 0 ? ` ${item.claimed_quantity} already claimed — those stay on the Claims tab.` : "";
    if (!window.confirm(`Remove “${item.title}” from the registry?${claimed}`)) return;
    startTransition(async () => {
      const result = await deleteRegistryItem(item.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <TagManager tags={tags} />

      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}

      {adding ? (
        <ItemForm
          initial={EMPTY}
          tags={tags}
          isNew
          onDone={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="btn w-full" onClick={() => setAdding(true)}>
          + Add an item
        </button>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm text-muted">
          Nothing here yet. Paste the link to something you&rsquo;d love and we&rsquo;ll fetch the
          name, picture and price where the shop lets us.
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="card p-3">
            {editing === item.id ? (
              <ItemForm initial={toDraft(item)} tags={tags} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-line/40">
                  {item.image_asset_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address
                    <img src={`/api/photo/${item.image_asset_id}?w=480`} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.starred ? <span title="Most wanted" aria-label="Most wanted">★ </span> : null}
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[item.store, formatPrice(item.price_minor)].filter(Boolean).join(" · ") || "No price"}
                    {item.tag_ids.length ? ` · ${item.tag_ids.map((t) => tagName.get(t)).filter(Boolean).join(", ")}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs">
                    {item.hidden ? <span className="mr-2 rounded bg-line px-1.5 py-0.5">Hidden</span> : null}
                    {item.remaining === 0 ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">All claimed</span>
                    ) : item.claimed_quantity > 0 ? (
                      <span className="text-muted">{item.claimed_quantity} of {item.quantity} claimed</span>
                    ) : item.quantity > 1 ? (
                      <span className="text-muted">{item.quantity} wanted</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="btn px-2" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" className="btn px-2" aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>↓</button>
                  <button type="button" className="btn" onClick={() => setEditing(item.id)}>Edit</button>
                  <button type="button" className="btn" onClick={() => remove(item)}>Remove</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemForm({
  initial,
  tags,
  isNew = false,
  onDone,
}: {
  initial: Draft;
  tags: RegistryTagRow[];
  isNew?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };

  async function autofill() {
    setFetching(true);
    setStatus(null);
    const result = await previewRegistryLink(draft.url);
    setFetching(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    const found = result.data;
    // Fill blanks only: never overwrite what the owner has already typed.
    setDraft((d) => ({
      ...d,
      title: d.title || found.title || "",
      note: d.note || "",
      price: d.price || (found.priceMinor ? minorToDollars(found.priceMinor) : ""),
    }));
    setCandidates(found.images);
    setStatus(
      found.images.length > 0
        ? "Filled in what we could. Pick a picture below, and check the details."
        : "Filled in what we could — no picture found, so upload one.",
    );
  }

  function toggleTag(id: string) {
    set("tag_ids", draft.tag_ids.includes(id) ? draft.tag_ids.filter((t) => t !== id) : [...draft.tag_ids, id]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveRegistryItem({
        ...draft,
        quantity: Number(draft.quantity) || 1,
        specs: draft.specs,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.error);
        return;
      }
      setErrors({});
      router.refresh();
      onDone();
    });
  }

  const host = storeFromUrl(draft.url);

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Link to the shop" errors={errors["url"]} hint={host ? `Opens ${host}` : "The page where someone can buy it."}>
        <div className="flex gap-2">
          <input
            className="field"
            inputMode="url"
            placeholder="https://…"
            value={draft.url}
            onChange={(e) => set("url", e.target.value)}
            required
          />
          <button type="button" className="btn shrink-0" disabled={fetching || draft.url.trim() === ""} onClick={autofill}>
            {fetching ? "Looking…" : "Fetch details"}
          </button>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem]">
        <Field label="Name" errors={errors["title"]}>
          <input className="field" value={draft.title} maxLength={160} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="Price (NZD)" errors={errors["price"]}>
          <input className="field tabular-nums" inputMode="decimal" placeholder="120" value={draft.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label="How many" errors={errors["quantity"]}>
          <input className="field" type="number" min={1} max={99} value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} />
        </Field>
      </div>

      <ImageField
        label="Picture"
        value={draft.image_asset_id}
        onChange={(id) => set("image_asset_id", id)}
        candidates={candidates}
        helper="This is the picture people see on the registry."
      />

      <Field label="Why you want it (optional)" errors={errors["note"]}>
        <input className="field" value={draft.note} maxLength={400} onChange={(e) => set("note", e.target.value)} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Details for the buyer</legend>
        <p className="text-xs text-muted">So they buy the right one — colour, size, anything.</p>
        {draft.specs.map((spec, index) => (
          <div key={index} className="flex gap-2">
            <input
              className="field w-32 shrink-0"
              aria-label="Label"
              list="spec-labels"
              placeholder="Colour"
              value={spec.label}
              maxLength={40}
              onChange={(e) => set("specs", draft.specs.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))}
            />
            <input
              className="field"
              aria-label="Value"
              placeholder="Sage"
              value={spec.value}
              maxLength={80}
              onChange={(e) => set("specs", draft.specs.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)))}
            />
            <button type="button" className="btn px-2" aria-label="Remove this detail" onClick={() => set("specs", draft.specs.filter((_, i) => i !== index))}>
              ✕
            </button>
          </div>
        ))}
        <datalist id="spec-labels">
          {SPEC_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
        {draft.specs.length < MAX_SPECS ? (
          <button type="button" className="btn" onClick={() => set("specs", [...draft.specs, { label: draft.specs.length === 0 ? "Colour" : draft.specs.length === 1 ? "Size" : "", value: "" }])}>
            + Add a detail
          </button>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Tags</legend>
        {tags.length === 0 ? (
          <p className="text-xs text-muted">Add a few tags above (Kitchen, Bedroom…) and tick them here. They become the filters on your page.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = draft.tag_ids.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:text-ink"}`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <Field label="Delivery note for this item (optional)" hint="e.g. “Collect in store” or “Deliver to the venue”." errors={errors["ship_note"]}>
        <input className="field" value={draft.ship_note} maxLength={300} onChange={(e) => set("ship_note", e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-6">
        <Toggle checked={draft.starred} onChange={(v) => set("starred", v)} label="Most wanted" hint="Shown first, with a star." />
        <Toggle checked={draft.hidden} onChange={(v) => set("hidden", v)} label="Hide for now" hint="Keep it here but off the page." />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Add to the registry" : "Save"}
        </button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        {status ? <span role="status" className="text-sm text-muted">{status}</span> : null}
      </div>
    </form>
  );
}

/** Tags are the page's filters. Small and inline: add, rename, remove. */
function TagManager({ tags }: { tags: RegistryTagRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    startTransition(async () => {
      const result = await createRegistryTag(name);
      if (!result.ok) return setError(result.error);
      setError(null);
      setName("");
      router.refresh();
    });
  }

  function rename(tag: RegistryTagRow) {
    const next = window.prompt("Rename this tag", tag.name);
    if (!next || next.trim() === tag.name) return;
    startTransition(async () => {
      const result = await renameRegistryTag(tag.id, next);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function remove(tag: RegistryTagRow) {
    if (!window.confirm(`Delete the tag “${tag.name}”? Items keep everything else.`)) return;
    startTransition(async () => {
      const result = await deleteRegistryTag(tag.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <section className="card space-y-2 p-3" aria-label="Tags">
      <h2 className="text-sm font-medium">Tags <span className="font-normal text-muted">— these become the filters on your page</span></h2>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-0.5 pl-3 pr-1 text-sm">
            {tag.name}
            <button type="button" className="rounded-full px-1.5 text-muted hover:text-ink" aria-label={`Rename ${tag.name}`} onClick={() => rename(tag)}>✎</button>
            <button type="button" className="rounded-full px-1.5 text-muted hover:text-ink" aria-label={`Delete ${tag.name}`} onClick={() => remove(tag)}>✕</button>
          </span>
        ))}
        <form onSubmit={add} className="flex gap-1">
          <input className="field w-40 py-1" placeholder="New tag, e.g. Kitchen" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="New tag" />
          <button type="submit" className="btn py-1" disabled={pending}>Add</button>
        </form>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
