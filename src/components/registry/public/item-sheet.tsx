"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { claimRegistryItem, type ClaimReceipt } from "@/server/actions/registry-public";
import { wantedLabel } from "@/lib/registry/items";
import type { PublicRegistryItem } from "@/server/registry/public";

/**
 * One gift, full size, and the "I'll buy this" flow (spec 36 §6).
 *
 * A native <dialog>: focus is trapped, Esc closes it and the rest of the page is
 * inert, all without a library. It's a bottom sheet on a phone and a centred
 * card on a laptop.
 *
 * The claim is made by pressing the confirm button — never on open, never on
 * page load (a link scanner that fetches the URL must not be able to take a gift).
 */
export function ItemSheet({
  item,
  slug,
  canClaim,
  preview,
  receipt,
  onClaimed,
  onClose,
}: {
  item: PublicRegistryItem;
  slug: string;
  canClaim: boolean;
  preview: boolean;
  receipt: ClaimReceipt | null;
  onClaimed: (receipt: ClaimReceipt) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="registry-sheet fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/50 sm:inset-0 sm:m-auto sm:max-h-[88vh] sm:max-w-xl sm:rounded-3xl"
    >
      <div className="relative p-5 sm:p-7">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-lg shadow hover:bg-line"
        >
          ✕
        </button>

        {receipt ? (
          <Receipt receipt={receipt} />
        ) : claiming ? (
          <ClaimForm
            item={item}
            slug={slug}
            onBack={() => setClaiming(false)}
            onClaimed={onClaimed}
          />
        ) : (
          <Details
            item={item}
            canClaim={canClaim}
            preview={preview}
            onClaim={() => setClaiming(true)}
          />
        )}
      </div>
    </dialog>
  );
}

function Details({
  item,
  canClaim,
  preview,
  onClaim,
}: {
  item: PublicRegistryItem;
  canClaim: boolean;
  preview: boolean;
  onClaim: () => void;
}) {
  const wanted = wantedLabel(item.remaining, item.quantity);
  return (
    <>
      {item.imageUrl ? (
        <div className="mb-5 overflow-hidden rounded-2xl bg-line/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address */}
          <img src={item.imageUrl} alt="" className="max-h-80 w-full object-contain" />
        </div>
      ) : null}

      <h2 id="sheet-title" className="font-display text-3xl leading-tight">{item.title}</h2>
      <p className="mt-1 text-muted">{[item.store, item.priceText, wanted].filter(Boolean).join(" · ")}</p>

      {item.note ? <p className="mt-4 whitespace-pre-line italic leading-relaxed">{item.note}</p> : null}

      {item.specs.length > 0 ? (
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
          {item.specs.map((spec, i) => (
            <div key={i} className="contents">
              <dt className="text-muted">{spec.label}</dt>
              <dd className="font-medium">{spec.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {canClaim ? (
          <button type="button" onClick={onClaim} className="flex-1 rounded-full bg-accent px-6 py-3 text-base font-medium text-paper hover:opacity-90">
            I&rsquo;ll buy this
          </button>
        ) : (
          <p className="flex-1 rounded-full border border-line px-6 py-3 text-center text-sm text-muted">
            {preview ? "Preview — nothing can be claimed from here" : "The registry has closed"}
          </p>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-accent px-6 py-3 text-center text-base font-medium text-accent hover:bg-accent/10"
        >
          See it{item.store ? ` at ${item.store}` : ""} ↗
        </a>
      </div>
      {canClaim ? (
        <p className="mt-3 text-center text-xs text-muted">
          Pressing the button takes it off the list so nobody doubles up. You can undo it later.
        </p>
      ) : null}
    </>
  );
}

function ClaimForm({
  item,
  slug,
  onBack,
  onClaimed,
}: {
  item: PublicRegistryItem;
  slug: string;
  onBack: () => void;
  onClaimed: (receipt: ClaimReceipt) => void;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    startTransition(async () => {
      const result = await claimRegistryItem({ slug, item_id: item.id, name, message, quantity, website });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setProblem(result.fieldErrors ? null : result.error);
        return;
      }
      onClaimed(result.data);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 id="sheet-title" className="font-display text-2xl leading-tight">You&rsquo;re getting {item.title}</h2>
      <p className="text-sm text-muted">Tell us who it&rsquo;s from, and leave a note if you like. Only the couple will ever see it.</p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Your name</span>
        <input
          className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          required
          autoFocus
        />
        {errors["name"] ? <span className="mt-1 block text-red-700">{errors["name"].join(" ")}</span> : null}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">A message for them <span className="font-normal text-muted">(optional)</span></span>
        <textarea
          className="min-h-28 w-full rounded-xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          placeholder="Congratulations — we love you both!"
        />
        <span className="mt-1 block text-right text-xs text-muted">{message.length}/500</span>
        {errors["message"] ? <span className="block text-red-700">{errors["message"].join(" ")}</span> : null}
      </label>

      {item.remaining > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">How many?</span>
          <select
            className="rounded-xl border border-line bg-paper px-4 py-3 text-base"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          >
            {Array.from({ length: item.remaining }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Honeypot: invisible to people, tempting to form-filling bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>

      {problem ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{problem}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={pending} className="flex-1 rounded-full bg-accent px-6 py-3 text-base font-medium text-paper hover:opacity-90 disabled:opacity-60">
          {pending ? "One moment…" : "Confirm — I’ll buy this"}
        </button>
        <button type="button" onClick={onBack} className="rounded-full border border-line px-6 py-3 text-base hover:bg-line/40">Back</button>
      </div>
    </form>
  );
}

function Receipt({ receipt }: { receipt: ClaimReceipt }) {
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const manageUrl = typeof window === "undefined" ? "" : `${window.location.origin}/registry/claim/${receipt.token}`;

  async function copy(text: string, what: "address" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard can be refused in an in-app browser; the text is on screen to select.
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="site-label text-muted">Thank you</p>
        <h2 id="sheet-title" className="mt-1 font-display text-3xl leading-tight">{receipt.itemTitle} is yours to give</h2>
      </div>

      {receipt.thanksImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address
        <img src={receipt.thanksImageUrl} alt="" className="max-h-64 w-full rounded-2xl object-cover" />
      ) : null}
      {receipt.thanksText ? <p className="whitespace-pre-line leading-relaxed">{receipt.thanksText}</p> : null}

      <section className="space-y-2 rounded-2xl border border-line p-4">
        <h3 className="font-medium">Get it to them</h3>
        {receipt.buyUrl ? (
          <p>
            <a href={receipt.buyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
              Buy it here ↗
            </a>
          </p>
        ) : null}
        {receipt.address.length > 0 ? (
          <>
            <p className="text-sm text-muted">Send it to:</p>
            <address className="whitespace-pre-line not-italic">{receipt.address.join("\n")}</address>
            {receipt.courierNote ? <p className="text-sm italic text-muted">{receipt.courierNote}</p> : null}
            <button type="button" onClick={() => copy(receipt.address.join("\n"), "address")} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-line/40">
              {copied === "address" ? "Copied" : "Copy address"}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">The couple haven&rsquo;t added a delivery address yet &mdash; they&rsquo;ll be in touch.</p>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h3 className="font-medium">Changed your mind?</h3>
        <p className="text-muted">
          Keep this private link &mdash; it&rsquo;s the only way to undo this. We don&rsquo;t keep an email address, so take a screenshot or copy it somewhere safe.
        </p>
        <button type="button" onClick={() => copy(manageUrl, "link")} className="rounded-full border border-line px-4 py-1.5 hover:bg-line/40">
          {copied === "link" ? "Copied" : "Copy my private link"}
        </button>
      </section>
    </div>
  );
}
