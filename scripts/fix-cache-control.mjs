#!/usr/bin/env node
/**
 * One-off: give every object already in the bucket a year-long cache-control.
 *
 *   node scripts/fix-cache-control.mjs           # dry run: lists what it would change
 *   node scripts/fix-cache-control.mjs --apply   # re-uploads each one in place
 *
 * Until November 2026 every upload was stored as `no-cache` (the browser PUTs
 * sent no cache-control header), so browsers and the CDN re-downloaded every
 * photograph on every view, which spent the Free plan's egress. New uploads
 * now send the header (src/lib/storage-cache.ts). Storage keeps an object's
 * cache-control from when it was written, so the only way to change an
 * existing one is to write it again: download, then upload to the same path
 * with upsert. Safe because every path is a uuid that never gets new bytes.
 *
 * Costs one download of the whole bucket (about 0.17 GB) once. Idempotent:
 * objects that already have the header are skipped, so a run that stops
 * half-way can simply be run again. A failed upload leaves the old object as
 * it was.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (reads
 * .env.local / .env like ensure-bucket.mjs).
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "moodboards";
const CACHE_SECONDS = "31536000"; // UPLOAD_CACHE_SECONDS in src/lib/storage-cache.ts
const apply = process.argv.includes("--apply");

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

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const storage = createClient(url, serviceKey, { auth: { persistSession: false } }).storage.from(BUCKET);

/** Every file under `prefix`. A listing entry with no id is a folder. */
async function listAll(prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`listing ${prefix || "/"}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(path)));
      else files.push({ path, metadata: entry.metadata ?? {} });
    }
    if (data.length < 1000) break;
  }
  return files;
}

const files = await listAll();
const todo = files.filter((file) => file.metadata.cacheControl !== `max-age=${CACHE_SECONDS}`);
console.log(`${files.length} objects, ${todo.length} without a year-long cache-control.`);

if (!apply) {
  for (const file of todo.slice(0, 20)) console.log(`  ${file.path}  (${file.metadata.cacheControl ?? "none"})`);
  if (todo.length > 20) console.log(`  … and ${todo.length - 20} more`);
  console.log("Dry run. Re-run with --apply to rewrite them.");
  process.exit(0);
}

let done = 0;
const failed = [];
for (const file of todo) {
  const { data: blob, error: downloadError } = await storage.download(file.path);
  if (downloadError || !blob) {
    failed.push(`${file.path}: download: ${downloadError?.message}`);
    continue;
  }
  const { error: uploadError } = await storage.upload(file.path, blob, {
    upsert: true,
    cacheControl: CACHE_SECONDS,
    contentType: file.metadata.mimetype ?? blob.type ?? "application/octet-stream",
  });
  if (uploadError) failed.push(`${file.path}: upload: ${uploadError.message}`);
  else done += 1;
  if ((done + failed.length) % 50 === 0) console.log(`  ${done + failed.length} / ${todo.length}`);
}

console.log(`Rewrote ${done} of ${todo.length}.`);
if (failed.length > 0) {
  console.error(`${failed.length} failed (left as they were; run again to retry):`);
  for (const line of failed) console.error(`  ${line}`);
  process.exit(1);
}
