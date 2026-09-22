/**
 * The one message body that is composed in the browser.
 *
 * `templates.ts` is server-only, because it is imported alongside the sender.
 * The WhatsApp text is different: nothing sends it, the planner copies it to
 * their clipboard and pastes it themselves. So it lives here, with no
 * server-only guard and no secrets anywhere near it.
 */
export function whatsappMessage(options: {
  weddingName: string;
  householdName: string;
  dateLabel: string;
  url: string;
}): string {
  return [
    `${options.householdName} — we're getting married!`,
    "",
    `${options.weddingName}, ${options.dateLabel}.`,
    "",
    `Everything you need, and the RSVP, is here: ${options.url}`,
    "",
    `No account needed, just tap the link.`,
  ].join("\n");
}

/**
 * The save-the-date's WhatsApp text — deliberately *not* the invitation's.
 *
 * Different opening line, no mention of an RSVP, and a closing line that says
 * the invitation is still to come, so neither the guest nor the planner can
 * mistake one message for the other in a chat history. The link it carries
 * ends in `/save-the-date`; the invitation's never does.
 */
export function saveTheDateWhatsappMessage(options: {
  householdName: string;
  dateLabel: string | null;
  location: string | null;
  url: string;
}): string {
  const when = options.dateLabel ? ` on ${options.dateLabel}` : "";
  const where = options.location ? ` in ${options.location}` : "";
  return [
    `${options.householdName} — save the date!`,
    "",
    `We're getting married${when}${where}, and we'd love you to be there.`,
    "",
    options.url,
    "",
    "Nothing to do yet — the invitation follows nearer the time.",
  ].join("\n");
}
