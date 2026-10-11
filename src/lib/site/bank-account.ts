
/**
 * A NZ bank account number, and what goes with it in the gift popup (spec 28 §6.1).
 *
 * NZ accounts are written `12-3456-7890123-00`: bank (2), branch (4), account
 * (7), suffix (2 or 3). **Stored as digits only** (`0033`), because the dashes
 * are presentation: a number pasted with spaces, dashes or neither is one
 * number, and whichever form a guest's banking app wants is one `format` away.
 *
 * Pure, because "what counts as an account number" is decided by a string and
 * is checked live in the editor as well as by the action.
 */

export type NzAccount = { ok: true; digits: string; formatted: string } | { ok: false; error: string };

/** Digits only: what is stored. Spaces, dashes and the like are dropped. */
export function accountDigits(input: string): string {
  return input.replace(/[\s\-–—.]/g, "");
}

/** `1234567890123 00` as `12-3456-7890123-00`. Anything that is not 15–16 digits comes back as typed. */
export function formatNzAccount(digits: string): string {
  if (!/^\d{15,16}$/.test(digits)) return digits;
  return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6, 13), digits.slice(13)].join("-");
}

export function parseNzAccount(input: string): NzAccount {
  const digits = accountDigits(input);
  if (digits === "") return { ok: false, error: "Add the account number" };
  if (!/^\d+$/.test(digits)) return { ok: false, error: "An account number is digits and dashes only" };
  if (digits.length < 15) {
    return {
      ok: false,
      error: `That's ${digits.length} digits — a NZ account has 15 or 16 (like 12-3456-7890123-00)`,
    };
  }
  if (digits.length > 16) {
    return { ok: false, error: `That's ${digits.length} digits — a NZ account has 15 or 16` };
  }
  return { ok: true, digits, formatted: formatNzAccount(digits) };
}

/** The values as labelled lines, for a guest pasting into a note. */
export function giftClipboardText(details: { accountName: string | null; accountNumber: string | null }): string {
  return [
    details.accountName ? `Account name: ${details.accountName}` : null,
    details.accountNumber ? `Account number: ${formatNzAccount(details.accountNumber)}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
