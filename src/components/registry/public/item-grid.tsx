"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { specSummary, wantedLabel } from "@/lib/registry/items";
import type { PublicRegistryItem } from "@/server/registry/public";
import type { ClaimReceipt } from "@/server/actions/registry-public";
import { ItemSheet } from "./item-sheet";

/**
 * The grid of gifts (spec 36 §4.2). Owns which item's sheet is open and, once a
 * claim succeeds, the receipt — kept here rather than in the sheet because the
 * claimed item drops out of the list the moment the page refreshes, and the
 * buyer must still be looking at their thank-you when it does.
 */
export function ItemGrid({
  items,
  slug,
  canClaim,
  preview,
}: {
  items: PublicRegistryItem[];
  slug: string;
  canClaim: boolean;
  preview: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PublicRegistryItem | null>(null);
  const [receipt, setReceipt] = useState<ClaimReceipt | null>(null);

  function close() {
    const claimed = receipt !== null;
    setSelected(null);
    setReceipt(null);
    // The claimed item should now be gone (or down to fewer wanted).
    if (claimed) router.refresh();
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="registry-card">
            <Card item={item} onOpen={() => setSelected(item)} />
          </li>
        ))}
      </ul>

      {selected ? (
        <ItemSheet
          key={selected.id}
          item={selected}
          slug={slug}
          canClaim={canClaim}
          preview={preview}
          receipt={receipt}
          onClaimed={setReceipt}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function Card({ item, onOpen }: { item: PublicRegistryItem; onOpen: () => void }) {
  const wanted = wantedLabel(item.remaining, item.quantity);
  const chips = specSummary(item.specs);

  const body = (
    <>
      <span className="relative block aspect-square overflow-hidden rounded-xl bg-line/50">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address; see its route
          <img
            src={item.imageUrl.replace("w=960", "w=480")}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover ${item.taken ? "opacity-50 grayscale" : ""}`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-4 text-center font-display text-lg text-muted">
            {item.title}
          </span>
        )}
        {item.starred && !item.taken ? (
          <span className="absolute left-2 top-2 rounded-full bg-paper/95 px-2.5 py-0.5 text-xs font-medium text-accent">★ Most wanted</span>
        ) : null}
        {item.taken ? (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-paper/95 px-3 py-1 text-center text-xs font-medium">Someone&rsquo;s got this one 🎁</span>
        ) : null}
      </span>
      <span className="mt-3 block">
        <span className="block font-display text-lg leading-snug">{item.title}</span>
        <span className="mt-0.5 block text-sm text-muted">
          {[item.store, item.priceText].filter(Boolean).join(" · ")}
        </span>
        {chips ? <span className="mt-0.5 block text-sm text-ink/80">{chips}</span> : null}
        {wanted ? <span className="mt-0.5 block text-xs text-muted">{wanted}</span> : null}
      </span>
    </>
  );

  if (item.taken) return <div className="block text-left">{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${item.title}${item.priceText ? `, ${item.priceText}` : ""} — see details`}
      className="registry-card-button block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
    >
      {body}
    </button>
  );
}
