import { NextResponse, type NextRequest } from "next/server";
import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl, serverEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { dayBeforeEmail } from "@/lib/email/templates";
import { decryptToken } from "@/lib/tokens";
import { dayBeforeDue, pushDue, type ReminderTask } from "@/lib/day-links/reminders";
import { localDate } from "@/lib/day-links/my-day";

/**
 * The every-minute job for day links (spec 54 §6.15): the day-before email at
 * 6 pm wedding time and the "10 minutes before" push. Called by Supabase
 * `pg_cron` (scripts/ensure-day-cron.mjs), gated by the same bearer secret as
 * the other cron routes. Idempotent: every send is logged first, and a
 * reminder already logged is never sent again.
 */

export const dynamic = "force-dynamic";

type Counts = { emails: number; pushes: number; failures: number };

async function run(request: NextRequest) {
  const env = serverEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const counts: Counts = { emails: 0, pushes: 0, failures: 0 };
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (pushReady) {
    webpush.setVapidDetails(env.VAPID_SUBJECT ?? "mailto:admin@example.com", env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }

  const { data: links, error } = await supabase
    .from("day_links")
    .select("*")
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!links?.length) return NextResponse.json({ ok: true, ...counts });

  const weddingIds = [...new Set(links.map((l) => l.wedding_id))];
  const linkIds = links.map((l) => l.id);
  const [weddings, assignees, subs, logs] = await Promise.all([
    supabase.from("weddings").select("id, name, timezone, day_before_email").in("id", weddingIds),
    supabase.from("run_sheet_item_assignees").select("item_id, wedding_id, state, vendor_id, guest_id, person_id").in("wedding_id", weddingIds),
    supabase.from("day_push_subscriptions").select("*").in("link_id", linkIds),
    supabase.from("day_reminder_log").select("link_id, dedupe_key").in("link_id", linkIds),
  ]);
  for (const r of [weddings, assignees, subs, logs]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });

  const itemIds = [...new Set((assignees.data ?? []).map((a) => a.item_id))];
  const items = itemIds.length
    ? await supabase.from("run_sheet_items").select("id, title, starts_at, location").in("id", itemIds)
    : { data: [], error: null };
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const weddingById = new Map((weddings.data ?? []).map((w) => [w.id, w]));

  for (const link of links) {
    const wedding = weddingById.get(link.wedding_id);
    if (!wedding) continue;

    const mine = (assignees.data ?? []).filter(
      (a) => a.wedding_id === link.wedding_id && (link.vendor_id ? a.vendor_id === link.vendor_id : link.guest_id ? a.guest_id === link.guest_id : a.person_id === link.person_id),
    );
    const tasks: (ReminderTask & { where: string | null })[] = mine.flatMap((a) => {
      const item = itemById.get(a.item_id);
      return item ? [{ id: item.id, title: item.title, startsAt: item.starts_at, state: a.state, where: item.location }] : [];
    });
    if (tasks.length === 0) continue;
    const sent = new Set((logs.data ?? []).filter((l) => l.link_id === link.id).map((l) => l.dedupe_key));

    // The day-before email.
    if (wedding.day_before_email) {
      const due = dayBeforeDue(tasks, now, wedding.timezone, sent);
      if (due) {
        const to = await emailOf(supabase, link);
        const token = decryptToken(link.token_encrypted);
        if (to && token) {
          const claimed = await supabase
            .from("day_reminder_log")
            .insert({ link_id: link.id, wedding_id: link.wedding_id, dedupe_key: due.key, kind: "day_before_email" });
          if (!claimed.error) {
            const time = (iso: string) =>
              new Intl.DateTimeFormat("en-NZ", { timeZone: wedding.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
            const message = dayBeforeEmail({
              weddingName: wedding.name,
              helperName: link.label.split(" ")[0] ?? link.label,
              url: absoluteUrl(`/d/${token}`),
              jobs: due.tasks.map((t) => {
                const full = tasks.find((x) => x.id === t.id);
                return { time: time(t.startsAt), title: t.title, where: full?.where ?? null };
              }),
            });
            const result = await sendEmail({ to, ...message });
            if (result.ok) counts.emails += 1;
            else {
              counts.failures += 1;
              // Free the key so the next minute tries again.
              await supabase.from("day_reminder_log").delete().eq("link_id", link.id).eq("dedupe_key", due.key);
            }
          }
        }
      }
    }

    // The "10 minutes before" push, only on or after the job's own day.
    if (pushReady) {
      const linkSubs = (subs.data ?? []).filter((s) => s.link_id === link.id);
      if (linkSubs.length > 0) {
        for (const due of pushDue(tasks, now, sent)) {
          if (localDate(due.task.startsAt, wedding.timezone) !== localDate(now.toISOString(), wedding.timezone)) continue;
          const claimed = await supabase
            .from("day_reminder_log")
            .insert({ link_id: link.id, wedding_id: link.wedding_id, dedupe_key: due.key, kind: "push_10_min" });
          if (claimed.error) continue;
          const payload = JSON.stringify({
            title: due.task.title,
            body: "Starts in about 10 minutes",
            tag: due.key,
            url: `/d/${decryptToken(link.token_encrypted) ?? ""}`,
          });
          for (const sub of linkSubs) {
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
              counts.pushes += 1;
            } catch (e) {
              const status = (e as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) await supabase.from("day_push_subscriptions").delete().eq("id", sub.id);
              else counts.failures += 1;
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...counts });
}

async function emailOf(
  supabase: ReturnType<typeof createAdminClient>,
  link: { vendor_id: string | null; guest_id: string | null; person_id: string | null },
): Promise<string | null> {
  const { data } = link.vendor_id
    ? await supabase.from("vendors").select("email").eq("id", link.vendor_id).maybeSingle()
    : link.guest_id
      ? await supabase.from("guests").select("email").eq("id", link.guest_id).maybeSingle()
      : await supabase.from("people").select("email").eq("id", link.person_id!).maybeSingle();
  return data?.email?.trim() || null;
}

export const GET = run;
export const POST = run;
