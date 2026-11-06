"use client";

import { createContext, useContext } from "react";

/**
 * The wedding's currency for client components (spec 40 §8). A symbol only:
 * amounts never convert. Provided once by the planner layout so the budget
 * and vendor screens don't thread a prop through every parent.
 *
 * No default on purpose: a component rendered outside the provider throws
 * instead of quietly printing NZD for a wedding that isn't.
 */
const CurrencyContext = createContext<string | null>(null);

export function CurrencyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): string {
  const currency = useContext(CurrencyContext);
  if (currency === null) throw new Error("useCurrency() needs a <CurrencyProvider> above it");
  return currency;
}
