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
