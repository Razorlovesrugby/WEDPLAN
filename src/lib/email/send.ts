import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Outbound email.
 *
 * V1 sends and does not read. There is no inbox, no OAuth and no threading —
 * that is V2's Gmail work. What V1 cannot do without is a way to put an
 * invitation in front of somebody and chase the ones who ignore it, and the
 * spec's "no email integration" never meant "no sending".
 *
 * In development, with no API key configured, messages are logged rather than
 * sent. Wiring a real provider into a dev database and accidentally mailing a
 * hundred real people is a mistake worth designing out.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult =
  | { ok: true; providerId: string; delivered: boolean }
  | { ok: false; error: string };

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const env = serverEnv();

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info(
      `[email:dev] would send to ${message.to}\n  subject: ${message.subject}\n` +
        message.text.split("\n").map((line) => `  ${line}`).join("\n"),
    );
    return { ok: true, providerId: `dev-${crypto.randomUUID()}`, delivered: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Provider rejected the message (${response.status}): ${body}` };
    }

    const payload = (await response.json()) as { id?: string };
    return { ok: true, providerId: payload.id ?? "unknown", delivered: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Network error" };
  }
}
