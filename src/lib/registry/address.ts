export type ShippingAddress = {
  recipient_name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string;
  courier_note: string | null;
};

/** Lines to print or copy, blanks dropped. Empty when there is nothing worth showing. */
export function addressLines(address: Partial<ShippingAddress> | null | undefined): string[] {
  if (!address) return [];
  const cityLine = [address.city, address.region, address.postcode].map((p) => p?.trim()).filter(Boolean).join(" ");
  const lines = [address.recipient_name, address.line1, address.line2, cityLine, address.country]
    .map((l) => l?.trim())
    .filter((l): l is string => Boolean(l));
  // A country alone is not an address.
  return lines.length > 1 ? lines : [];
}

export function addressForCopy(address: Partial<ShippingAddress> | null | undefined): string {
  return addressLines(address).join("\n");
}

export function hasAddress(address: Partial<ShippingAddress> | null | undefined): boolean {
  return addressLines(address).length > 0;
}
