#!/usr/bin/env node
/**
 * Puts a backup made by scripts/backup-storage.mjs back into the bucket
 * (docs/RESTORE.md). Run scripts/ensure-bucket.mjs first so the bucket exists.
 *
 *   node scripts/restore-storage.mjs ./decrypted/storage
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the NEW
 * project. Existing objects are overwritten (upsert), so it is safe to re-run.
 * Checks the count against manifest.json and fails if they differ.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const BUCKET = "moodboards";

// The bucket only accepts these (scripts/ensure-bucket.mjs).
const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

export async function restoreBucket(client, bucket, dir, { concurrency = 4 } = {}) {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const queue = [...manifest.objects];
  let uploaded = 0;

  async function worker() {
    for (let o = queue.shift(); o; o = queue.shift()) {
      const body = await readFile(join(dir, o.path));
      const { error } = await client.storage.from(bucket).upload(o.path, body, {
        upsert: true,
        contentType: TYPES[extname(o.path).toLowerCase()] ?? "application/octet-stream",
      });
      if (error) throw new Error(`Could not upload "${o.path}": ${error.message}`);
      uploaded += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  if (uploaded !== manifest.count) {
    throw new Error(`Uploaded ${uploaded} of ${manifest.count} objects.`);
  }
  return { uploaded };
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/restore-storage.mjs <storage-backup-dir>");
    process.exit(2);
  }
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (for the NEW project).");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { uploaded } = await restoreBucket(client, BUCKET, dir);
  console.log(`==> uploaded ${uploaded} objects`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`!! ${error.message}`);
    process.exit(1);
  });
}
