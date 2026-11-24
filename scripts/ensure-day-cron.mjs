#!/usr/bin/env node
/**
 * Schedules the every-minute day-links job in Supabase (spec 54 §6.15).
 * Idempotent: run it as often as you like.
 *
 *   SUPABASE_DB_URL=postgres://... SITE_URL=https://your.site CRON_SECRET=... \
 *     node scripts/ensure-day-cron.mjs
 *
 * `pg_cron` and `pg_net` exist on Supabase, not on the bare Postgres the SQL
 * suite runs on, so this is a script and not a migration (the same reason
 * scripts/ensure-bucket.mjs makes the storage bucket). The job does no work
 * itself: it calls /api/cron/day-links with the bearer secret, and the route
 * sends whatever is due. Vercel's own cron stays weekly, so no plan change.
 *
 * Needs the project's direct database URL (Settings → Database), which can
 * create extensions. Enable pg_cron and pg_net first if the dashboard asks
 * (Database → Extensions).
 */
import pg from "pg";

const { SUPABASE_DB_URL, SITE_URL, CRON_SECRET } = process.env;
if (!SUPABASE_DB_URL || !SITE_URL || !CRON_SECRET) {
  console.error("Set SUPABASE_DB_URL, SITE_URL and CRON_SECRET.");
  process.exit(1);
}

const url = `${SITE_URL.replace(/\/$/, "")}/api/cron/day-links`;
const client = new pg.Client({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("create extension if not exists pg_cron");
  await client.query("create extension if not exists pg_net");
  // cron.schedule replaces a job of the same name, which is what makes this rerunnable.
  await client.query(
    `select cron.schedule(
       'wedplan-day-links',
       '* * * * *',
       $job$select net.http_post(
         url := $1,
         headers := jsonb_build_object('authorization', 'Bearer ' || $2),
         timeout_milliseconds := 20000
       )$job$
     )`.replace("$1", `'${url.replace(/'/g, "''")}'`).replace("$2", `'${CRON_SECRET.replace(/'/g, "''")}'`),
  );
  console.log(`Scheduled wedplan-day-links every minute → ${url}`);
} finally {
  await client.end();
}
