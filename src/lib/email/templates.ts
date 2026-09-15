import "server-only";
import { pluralise } from "@/lib/format";
import type { DigestContent } from "@/lib/reminders/digest";

/**
 * Message bodies.
 *
 * Plain text is written first and the HTML mirrors it, rather than the other
 * way round: a text part that reads like an afterthought is a reliable way
 * into a spam folder, and some of these go to people whose mail client is
 * fifteen years old.
 *
 * No images, no tracking pixel, no link shortener. All three hurt
 * deliverability, and a shortener would obscure the one link that matters.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#fbfaf8;
    font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.6">
    <div style="max-width:34rem;margin:0 auto">${bodyHtml}</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}"
    style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;
    text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>
    <p style="font-size:13px;color:#6b6560">If the button doesn't work, paste this into your
    browser:<br><span style="word-break:break-all">${escapeHtml(href)}</span></p>`;
}

export function invitationEmail(options: {
  weddingName: string;
  householdName: string;
  dateLabel: string;
  url: string;
}) {
  const { weddingName, householdName, dateLabel, url } = options;

  const text = [
    `${householdName},`,
    "",
    `We're getting married, and we would love you to be there.`,
    "",
    `${weddingName} — ${dateLabel}`,
    "",
    `Everything you need, and the RSVP, is here:`,
    url,
    "",
    `There's no account to create — the link is yours. You can change your answer any time`,
    `before RSVPs close.`,
  ].join("\n");

  const html = layout(`
    <p>${escapeHtml(householdName)},</p>
    <p>We&rsquo;re getting married, and we would love you to be there.</p>
    <p style="font-size:20px;margin:24px 0 4px">${escapeHtml(weddingName)}</p>
    <p style="color:#6b6560;margin:0">${escapeHtml(dateLabel)}</p>
    ${button(url, "Everything you need, and the RSVP")}
    <p style="font-size:13px;color:#6b6560">There&rsquo;s no account to create — the link is
    yours. You can change your answer any time before RSVPs close.</p>`);

  return { subject: `${weddingName} — you're invited`, text, html };
}

export function reminderEmail(options: {
  weddingName: string;
  householdName: string;
  url: string;
  lockLabel: string | null;
}) {
  const { weddingName, householdName, url, lockLabel } = options;
  const deadline = lockLabel ? `We need answers by ${lockLabel}.` : "We'd love to know either way.";

  const text = [
    `${householdName},`,
    "",
    `A gentle nudge — we haven't heard back about ${weddingName} yet.`,
    "",
    deadline,
    "",
    `Your RSVP link:`,
    url,
    "",
    `If you already know you can't make it, saying no is just as helpful as saying yes.`,
  ].join("\n");

  const html = layout(`
    <p>${escapeHtml(householdName)},</p>
    <p>A gentle nudge — we haven&rsquo;t heard back about
    ${escapeHtml(weddingName)} yet.</p>
    <p>${escapeHtml(deadline)}</p>
    ${button(url, "RSVP now")}
    <p style="font-size:13px;color:#6b6560">If you already know you can&rsquo;t make it, saying no
    is just as helpful as saying yes.</p>`);

  return { subject: `${weddingName} — a nudge about your RSVP`, text, html };
}

/**
 * The weekly digest — the "chases you" half of spec 02, replacing the part
 * of spreadsheet planning that can't chase anyone. Only sent when there's
 * something to report (see `hasAnythingToReport` in
 * src/lib/reminders/digest.ts) — an empty "nothing due" email every week is
 * exactly the kind of message a recipient trains themselves to stop opening.
 */
export function digestEmail(options: { weddingName: string; url: string; digest: DigestContent }) {
  const { weddingName, url, digest } = options;
  const summary = `${pluralise(digest.overdueCount, "overdue", "overdue")}, ${pluralise(digest.dueSoonCount, "due this week", "due this week")}`;

  const textGroups = digest.groups
    .map((group) => {
      const lines = [group.listTitle];
      if (group.overdue.length > 0) {
        lines.push("  Overdue:");
        for (const item of group.overdue) lines.push(`    - ${item.title} (was due ${item.due_date})`);
      }
      if (group.dueSoon.length > 0) {
        lines.push("  Due this week:");
        for (const item of group.dueSoon) lines.push(`    - ${item.title} (due ${item.due_date})`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const text = [
    `${weddingName} — this week's tasks`,
    "",
    summary + ".",
    "",
    textGroups,
    "",
    "Everything, and the full timeline:",
    url,
  ].join("\n");

  const htmlGroups = digest.groups
    .map((group) => {
      const overdueHtml =
        group.overdue.length > 0
          ? `<p style="margin:8px 0 2px;font-size:13px;color:#b91c1c">Overdue</p>
             <ul style="margin:0;padding-left:20px">
               ${group.overdue.map((i) => `<li>${escapeHtml(i.title)} <span style="color:#6b6560">(was due ${i.due_date})</span></li>`).join("")}
             </ul>`
          : "";
      const dueSoonHtml =
        group.dueSoon.length > 0
          ? `<p style="margin:8px 0 2px;font-size:13px;color:#6b6560">Due this week</p>
             <ul style="margin:0;padding-left:20px">
               ${group.dueSoon.map((i) => `<li>${escapeHtml(i.title)} <span style="color:#6b6560">(due ${i.due_date})</span></li>`).join("")}
             </ul>`
          : "";
      return `<div style="margin:16px 0;padding-left:12px;border-left:3px solid ${escapeHtml(group.listColor ?? "#8a8580")}">
        <p style="margin:0;font-weight:bold">${escapeHtml(group.listTitle)}</p>
        ${overdueHtml}${dueSoonHtml}
      </div>`;
    })
    .join("");

  const html = layout(`
    <p style="font-size:20px;margin:0 0 4px">${escapeHtml(weddingName)}</p>
    <p style="color:#6b6560;margin:0 0 16px">This week's tasks</p>
    <p><strong>${escapeHtml(summary)}.</strong></p>
    ${htmlGroups}
    ${button(url, "See the full timeline")}`);

  return { subject: `${weddingName} — ${summary}`, text, html };
}

// The WhatsApp message lives in templates-client.ts: the planner copies it in
// the browser, so it must not sit behind the server-only guard.
export { whatsappMessage } from "./templates-client";
