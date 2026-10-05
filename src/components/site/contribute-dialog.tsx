"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_GIFT_MESSAGE, type PublicBank } from "@/lib/site/gift-funds";
import { formatNzAccount, giftClipboardText } from "@/lib/site/bank-account";

/**
 * The Contribute button and the popup it opens (spec 28 §6.1).
 *
 * A native `<dialog>` opened with `showModal()`, because the browser then does
 * the parts that are easy to get subtly wrong: it traps focus, closes on Esc,
 * and hands focus back to the button that opened it. It is a centred dialog on
 * a laptop and a sheet from the bottom edge on a phone (`max-sm:`), where a
 * thumb can reach the close button. Tapping the backdrop closes it.
 *
 * **The popup never depends on the Clipboard API to be useful.** Some in-app
 * browsers — the ones links open in from Instagram and Facebook — and older iOS
 * webviews refuse it. The values are plain, selectable text (a tap selects the
 * whole value), and where copying is not available the button says **Select
 * and copy** and does the best it can: select the text and try the old
 * `execCommand`, leaving it selected for the guest to copy themselves.
 *
 * The account details are in the page's HTML, inside the closed dialog, and
 * nowhere else: never in a link preview, an Open Graph image or page metadata.
 */

type OnlineLink = { name: string; url: string };

export function ContributeDialog({
  bank,
  reference,
  onlineLinks,
  dark,
}: {
  bank: PublicBank | null;
  reference: string;
  onlineLinks: OnlineLink[];
  dark: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [canCopy, setCanCopy] = useState(true);

  // Decided after mount: the server cannot know. Until then the button says
  // "Copy", which is right for nearly everybody and corrected for the rest.
  useEffect(() => {
    setCanCopy(typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText) && window.isSecureContext);
  }, []);

  function open() {
    dialog.current?.showModal();
    // The page behind a bottom sheet must not scroll under a thumb.
    document.documentElement.style.overflow = "hidden";
  }

  function close() {
    dialog.current?.close();
  }

  const accountNumber = bank?.accountNumber ? formatNzAccount(bank.accountNumber) : null;
  const rows = [
    bank?.accountName ? { label: "Account name", value: bank.accountName } : null,
    accountNumber ? { label: "Account number", value: accountNumber } : null,
    { label: "Reference", value: reference },
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-block border px-8 py-3 text-[0.78rem] uppercase tracking-[0.14em] transition-colors ${
          dark
            ? "border-paper hover:bg-paper hover:!text-ink"
            : "border-accent text-accent hover:bg-accent hover:text-paper"
        }`}
      >
        Contribute
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="contribute-title"
        // The restore runs however it closed — Esc, the button, the backdrop.
        onClose={() => {
          document.documentElement.style.overflow = "";
        }}
        // The dialog has no padding of its own, so a click whose target is the
        // dialog element itself landed on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(92vw,30rem)] rounded-md border border-line bg-paper p-0 text-left text-ink shadow-xl backdrop:bg-black/50 max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h3 id="contribute-title" className="site-heading text-2xl">
              A gift, if you are moved
            </h3>
            <button
              type="button"
              onClick={close}
              autoFocus
              aria-label="Close"
              className="-mr-2 -mt-2 px-2 py-1 text-2xl leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>

          <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted">
            {bank?.message ?? DEFAULT_GIFT_MESSAGE}
          </p>

          <dl className="mt-6 divide-y divide-line border-y border-line" data-copy-all="">
            {rows.map((row) => (
              <CopyRow key={row.label} label={row.label} value={row.value} canCopy={canCopy} />
            ))}
          </dl>

          <CopyAll
            canCopy={canCopy}
            text={giftClipboardText({
              accountName: bank?.accountName ?? null,
              accountNumber: bank?.accountNumber ?? null,
              reference,
            })}
          />

          {bank?.note ? <p className="mt-5 text-[0.95rem] text-muted">{bank.note}</p> : null}

          {onlineLinks.length > 0 ? (
            <div className="mt-6 border-t border-line pt-5">
              <ul className="space-y-2">
                {onlineLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent underline underline-offset-2"
                    >
                      {onlineLinks.length > 1 ? `Or give online — ${link.name}` : "Or give online"}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}

/** "Copy", then "Copied ✓" for two seconds — or "Select and copy" where copying is not available. */
function useCopy(canCopy: boolean) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(text: string, source: HTMLElement | null) {
    let outcome: "copied" | "selected" = "copied";
    try {
      if (!canCopy) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      // Select it, so the guest can finish the job themselves, and try the old
      // route first in case the browser still honours it from a tap.
      outcome = "selected";
      if (source) {
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        try {
          if (document.execCommand("copy")) outcome = "copied";
        } catch {
          // Left selected; the guest copies it.
        }
      }
    }
    setState(outcome);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  const label =
    state === "copied" ? "Copied ✓" : state === "selected" ? "Selected — copy it" : canCopy ? "Copy" : "Select and copy";
  return { copy, label, state };
}

function CopyRow({ label, value, canCopy }: { label: string; value: string; canCopy: boolean }) {
  const text = useRef<HTMLElement>(null);
  const { copy, label: buttonLabel, state } = useCopy(canCopy);

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="site-label text-muted">{label}</dt>
        {/* `select-all`: one tap selects the whole value, which is the whole of
            the fallback where the clipboard is blocked. */}
        <dd ref={text} className="mt-0.5 select-all break-words text-[1.0625rem] tabular-nums text-ink">
          {value}
        </dd>
      </div>
      <button
        type="button"
        onClick={() => copy(value, text.current)}
        aria-live="polite"
        className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[0.82rem] transition-colors ${
          state === "copied" ? "border-accent bg-accent text-paper" : "border-line text-muted hover:border-ink hover:text-ink"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function CopyAll({ text, canCopy }: { text: string; canCopy: boolean }) {
  const { copy, label, state } = useCopy(canCopy);
  const wrap = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrap} className="mt-4">
      <button
        type="button"
        onClick={() => copy(text, wrap.current?.previousElementSibling as HTMLElement | null)}
        aria-live="polite"
        className={`w-full rounded-full border px-4 py-2 text-[0.82rem] uppercase tracking-[0.12em] transition-colors ${
          state === "copied" ? "border-accent bg-accent text-paper" : "border-ink text-ink hover:bg-ink hover:text-paper"
        }`}
      >
        {state === "idle" ? (canCopy ? "Copy all" : "Select all and copy") : label}
      </button>
    </div>
  );
}
