import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl, serverEnv } from "@/lib/env";
import { decryptToken, invitationUrl } from "@/lib/tokens";
import { digestEmail, reminderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { buildDigest, hasAnythingToReport, isoWeek, type DigestItem } from "@/lib/reminders/digest";

/**
 * Scheduled chasing.
 *
 * The rules this enforces, in order of how annoyed somebody gets when they are
 * broken:
 *
 *   - Only non-responders. Anyone who has answered is never chased again.
 *   - Never a muted household.
 *   - Never twice inside REMINDER_GAP_DAYS, regardless of how often the cron
 *     runs or how many times it is retried.
 *   - Never after the RSVP lock date, when chasing has no purpose.
 *
 * Idempotency comes from message_log: the dedupe key is the household plus the
 * day, and the row is written before the send. A retry collides on the unique
 * index and skips, so a cron that fires twice does not mail anyone twice.
 *
 * Runs as the service role because there is no user. Every query is therefore
 * explicitly scoped — RLS is not doing it here.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMINDER_GAP_DAYS = 10;

async function run(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - REMINDER_GAP_DAYS * 86_400_000).toISOString();

  const { data: weddings, error: weddingError } = await supabase
    .from("weddings")
    .select("id, name, wedding_date, timezone, rsvp_lock_at");
  if (weddingError) {
    return NextResponse.json({ error: weddingError.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const wedding of weddings ?? []) {
    if (wedding.rsvp_lock_at && new Date(wedding.rsvp_lock_at) < now) {
      continue; // RSVPs are closed; chasing now is just noise.
    }

    const { data: outstanding } = await supabase
      .from("v_household_rsvp")
      .select("household_id, invitation_id, sent_at, response_state")
      .eq("wedding_id", wedding.id)
      .neq("response_state", "complete")
      .not("sent_at", "is", null);

    for (const row of outstanding ?? []) {
      if (!row.invitation_id) continue;

      const { data: household } = await supabase
        .from("households")
        .select("id, display_name, reminders_muted")
        .eq("wedding_id", wedding.id)
        .eq("id", row.household_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!household || household.reminders_muted) {
        skipped++;
        continue;
      }

      const { data: recent } = await supabase
        .from("message_log")
        .select("id")
        .eq("wedding_id", wedding.id)
        .eq("household_id", household.id)
        .eq("kind", "reminder")
        .gte("created_at", cutoff)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped++;
        continue;
      }

      const { data: invitation } = await supabase
        .from("invitations")
        .select("token_encrypted")
        .eq("wedding_id", wedding.id)
        .eq("id", row.invitation_id)
        .maybeSingle();

      const token = invitation ? decryptToken(invitation.token_encrypted) : null;
      if (!token) {
        skipped++;
        continue;
      }

      const { data: guests } = await supabase
        .from("guests")
        .select("email")
        .eq("wedding_id", wedding.id)
        .eq("household_id", household.id)
        .is("deleted_at", null)
        .not("email", "is", null);

      const recipients = [
        ...new Set((guests ?? []).map((g) => g.email).filter((e): e is string => !!e)),
      ];
      if (recipients.length === 0) {
        skipped++;
        continue;
      }

      const message = reminderEmail({
        weddingName: wedding.name,
        householdName: household.display_name,
        url: invitationUrl(token),
        lockLabel: wedding.rsvp_lock_at
          ? formatDate(wedding.rsvp_lock_at, wedding.timezone)
          : null,
      });

      for (const recipient of recipients) {
        const dedupeKey = `reminder:${household.id}:${recipient}:${today}`;
        const { error: logError } = await supabase.from("message_log").insert({
          wedding_id: wedding.id,
          household_id: household.id,
          kind: "reminder",
          channel: "email",
          to_address: recipient,
          dedupe_key: dedupeKey,
          status: "queued",
        });

        if (logError) {
          skipped++; // 23505: already sent today.
          continue;
        }

        const result = await sendEmail({ to: recipient, ...message });
        await supabase
          .from("message_log")
          .update(
            result.ok
              ? {
                  status: "sent",
                  provider_id: result.providerId,
                  sent_at: new Date().toISOString(),
                }
              : { status: "failed", error: result.error },
          )
          .eq("wedding_id", wedding.id)
          .eq("dedupe_key", dedupeKey);

        if (result.ok) sent++;
        else skipped++;
      }
    }
  }

  const digestResult = await sendDigests(supabase, weddings ?? [], today);
  sent += digestResult.sent;
  skipped += digestResult.skipped;

  return NextResponse.json({ sent, skipped, ranAt: now.toISOString() });
}

/**
 * The weekly digest (spec 02) — independent of the RSVP-chase loop above.
 * Runs for every wedding regardless of `rsvp_lock_at`: lists and the
 * timeline keep mattering after RSVPs close, unlike a chase for an answer
 * nobody's waiting on any more.
 */
async function sendDigests(
  supabase: ReturnType<typeof createAdminClient>,
  weddings: { id: string; name: string }[],
  today: string,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  const week = isoWeek(today);

  for (const wedding of weddings) {
    const { data: rows } = await supabase
      .from("v_timeline_items")
      .select("id, title, due_date, list_title, list_color, snoozed_until, status")
      .eq("wedding_id", wedding.id)
      .neq("status", "done");

    const items: DigestItem[] = (rows ?? [])
      .filter((row): row is typeof row & { due_date: string } => row.due_date !== null)
      .map((row) => ({
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        list_title: row.list_title,
        list_color: row.list_color,
        snoozed_until: row.snoozed_until,
        done: row.status === "done",
      }));

    const digest = buildDigest(items, today);
    if (!hasAnythingToReport(digest)) continue; // nothing to chase this week — see spec 02, section 7.

    const { data: collaborators } = await supabase
      .from("collaborators")
      .select("user_id")
      .eq("wedding_id", wedding.id);

    const message = digestEmail({ weddingName: wedding.name, url: absoluteUrl("/timeline"), digest });

    for (const collaborator of collaborators ?? []) {
      const { data: userResult } = await supabase.auth.admin.getUserById(collaborator.user_id);
      const recipient = userResult?.user?.email;
      if (!recipient) {
        skipped++;
        continue;
      }

      const dedupeKey = `digest:${wedding.id}:${week}:${recipient}`;
      const { error: logError } = await supabase.from("message_log").insert({
        wedding_id: wedding.id,
        household_id: null,
        kind: "digest",
        channel: "email",
        to_address: recipient,
        dedupe_key: dedupeKey,
        status: "queued",
      });
      if (logError) {
        skipped++; // 23505: already sent this ISO week.
        continue;
      }

      const result = await sendEmail({ to: recipient, ...message });
      await supabase
        .from("message_log")
        .update(
          result.ok
            ? { status: "sent", provider_id: result.providerId, sent_at: new Date().toISOString() }
            : { status: "failed", error: result.error },
        )
        .eq("wedding_id", wedding.id)
        .eq("dedupe_key", dedupeKey);

      if (result.ok) sent++;
      else skipped++;
    }
  }

  return { sent, skipped };
}

/**
 * Vercel Cron invokes the path with GET, supplying the Authorization header
 * itself from CRON_SECRET. POST is kept so the job can be triggered by hand
 * with curl when testing the copy.
 */
export const GET = run;
export const POST = run;
