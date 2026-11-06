"use client";

import { useEffect, useMemo, useState } from "react";
import { PINNED_CURRENCIES } from "@/lib/onboarding";

/**
 * The currency picker (spec 40 §8): the six main ones first, then every code
 * the runtime knows. A symbol only: picking one never converts an amount.
 */
export function CurrencySelect({
  name,
  currencies,
  defaultValue = "NZD",
  id,
}: {
  name: string;
  currencies: readonly string[];
  defaultValue?: string;
  id?: string;
}) {
  // Names are added after mount: the server's and the browser's locale data
  // can word them differently, and that breaks hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    if (mounted) {
      try {
        names = new Intl.DisplayNames(["en-NZ"], { type: "currency" });
      } catch {
        names = null;
      }
    }
    const list = currencies.includes(defaultValue) ? currencies : [defaultValue, ...currencies];
    return list.map((code) => ({ code, label: names ? `${code} · ${names.of(code) ?? code}` : code }));
  }, [currencies, defaultValue, mounted]);

  const pinned = options.filter((o) => (PINNED_CURRENCIES as readonly string[]).includes(o.code));
  const rest = options.filter((o) => !(PINNED_CURRENCIES as readonly string[]).includes(o.code));

  return (
    <select id={id} name={name} defaultValue={defaultValue} className="field" required>
      {pinned.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
      {rest.length > 0 ? (
        <optgroup label="Everything else">
          {rest.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
