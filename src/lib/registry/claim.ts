import { z } from "zod";

/**
 * The visitor's side of "I'll buy this" (spec 36 §6). Input rules only; the
 * write itself is `claim_registry_item()` in the database, where the race is
 * settled under a row lock.
 */

export const claimSchema = z.object({
  item_id: z.string().uuid(),
  name: z.string().trim().min(1, "Please tell us your name").max(80, "That's a long name"),
  message: z
    .string()
    .max(500, "Keep it under 500 characters")
    .optional()
    .transform((v) => {
      const text = (v ?? "").replace(/\r\n/g, "\n").trim();
      // Plain text only: never rendered as HTML anywhere, but a run of blank
      // lines is still collapsed so a card can't be pushed off the screen.
      return text === "" ? null : text.replace(/\n{3,}/g, "\n\n");
    }),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  // A honeypot: invisible to people, tempting to form-filling bots. Anything in
  // it and the claim is silently dropped (see `isHoneypotTripped`).
  website: z.string().optional(),
});

export function isHoneypotTripped(input: { website?: string | undefined }): boolean {
  return (input.website ?? "").trim() !== "";
}

export type ClaimOutcome = "ok" | "unavailable" | "sold_out" | "busy";

/** What the visitor is told, in the couple's voice rather than an error's. */
export function outcomeMessage(outcome: ClaimOutcome, remaining = 0): string | null {
  switch (outcome) {
    case "ok":
      return null;
    case "sold_out":
      return remaining > 0
        ? `Only ${remaining} ${remaining === 1 ? "is" : "are"} left — someone just got in first.`
        : "Someone just got this one — have a look at what else is on the list.";
    case "busy":
      return "A lot of people are choosing gifts right now. Please try again in a few minutes.";
    default:
      return "This one isn't available any more.";
  }
}

/** The arithmetic behind `v_registry_items.remaining`, for places that only hold the two numbers. */
export function remainingOf(quantity: number, claimed: number): number {
  return Math.max(quantity - claimed, 0);
}
